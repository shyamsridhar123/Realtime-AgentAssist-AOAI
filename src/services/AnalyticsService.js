const { AzureOpenAI } = require('openai');
const EventEmitter = require('events');
const Logger = require('../utils/Logger');

class AnalyticsService extends EventEmitter {
  constructor(config) {
    super();
    this.logger = new Logger('AnalyticsService');
    this.config = config;
    this.client = null;
    this.isRunning = false;
    this.transcriptHistory = [];
    this.sentimentHistory = [];
    this.callReasons = new Set();
    this.escalationKeywords = [
      'manager', 'supervisor', 'complaint', 'unacceptable', 'terrible', 'awful',
      'frustrated', 'angry', 'disappointed', 'cancel', 'lawyer', 'sue',
      'better business bureau', 'review', 'social media', 'twitter'
    ];
    this.currentContext = {
      callSummary: '',
      detectedIssues: [],
      customerMood: 'neutral',
      agentPerformance: 'good'
    };
  }

  async start() {
    try {
      this.logger.info('Starting Analytics Service...');
      
      // Initialize Azure OpenAI client
      this.client = new AzureOpenAI({
        endpoint: this.config.endpoint,
        apiKey: this.config.apiKey,
        apiVersion: this.config.apiVersion,
        deployment: this.config.deployment
      });
      
      this.isRunning = true;
      this.logger.info('Analytics Service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Analytics Service:', error.message);
      this.logger.error('Stack trace:', error.stack);
      throw error;
    }
  }

  async analyzeSentiment(transcript) {
    if (!this.isRunning || !this.client) {
      this.logger.warn('Analytics Service not ready');
      return { sentiment: 'neutral', confidence: 0.5 };
    }

    try {
      const prompt = `Analyze the sentiment of this customer service transcript. 
      Rate the sentiment as positive, negative, or neutral and provide a confidence score between 0 and 1.
      
      Transcript: "${transcript}"
      
      Respond with JSON format: {"sentiment": "positive|negative|neutral", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

      const response = await this.client.chat.completions.create({
        model: this.config.deployment,
        messages: [
          {
            role: 'system',
            content: 'You are a sentiment analysis expert specializing in customer service interactions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Store sentiment history
      this.sentimentHistory.push({
        timestamp: new Date().toISOString(),
        transcript: transcript,
        sentiment: result.sentiment,
        confidence: result.confidence,
        reasoning: result.reasoning
      });

      // Keep only last 20 sentiment analyses
      if (this.sentimentHistory.length > 20) {
        this.sentimentHistory.shift();
      }

      this.logger.info(`Sentiment analysis: ${result.sentiment} (${result.confidence})`);
      
      // Emit sentiment event
      this.emit('sentimentAnalyzed', result);
      
      return result;
      
    } catch (error) {
      this.logger.error('Error analyzing sentiment:', error);
      return { sentiment: 'neutral', confidence: 0.5 };
    }
  }

  async detectCallReason(transcript) {
    if (!this.isRunning || !this.client) {
      this.logger.warn('Analytics Service not ready');
      return 'unknown';
    }

    try {
      const prompt = `Analyze this customer service transcript and identify the main reason for the call.
      
      Common call reasons:
      - billing_inquiry
      - technical_support
      - account_management
      - service_complaint
      - new_service_request
      - cancellation_request
      - general_inquiry
      - product_information
      
      Transcript: "${transcript}"
      
      Respond with just the call reason category.`;

      const response = await this.client.chat.completions.create({
        model: this.config.deployment,
        messages: [
          {
            role: 'system',
            content: 'You are a call categorization expert for telecommunications customer service.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 50,
        temperature: 0.2
      });

      const callReason = response.choices[0].message.content.trim().toLowerCase();
      this.callReasons.add(callReason);
      
      this.logger.info(`Call reason detected: ${callReason}`);
      
      // Emit call reason event
      this.emit('callReasonDetected', callReason);
      
      return callReason;
      
    } catch (error) {
      this.logger.error('Error detecting call reason:', error);
      return 'unknown';
    }
  }

  async checkEscalation(transcript) {
    if (!this.isRunning || !this.client) {
      this.logger.warn('Analytics Service not ready');
      return { shouldEscalate: false, confidence: 0.5 };
    }

    try {
      // First check for escalation keywords
      const hasEscalationKeywords = this.escalationKeywords.some(keyword =>
        transcript.toLowerCase().includes(keyword)
      );

      const prompt = `Analyze this customer service transcript and determine if the call should be escalated to a supervisor.
      
      Consider these factors:
      - Customer anger or frustration level
      - Complexity of the issue
      - Request for supervisor/manager
      - Threats or complaints
      - Unresolved repeated issues
      
      Transcript: "${transcript}"
      
      Respond with JSON format: {"shouldEscalate": true|false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

      const response = await this.client.chat.completions.create({
        model: this.config.deployment,
        messages: [
          {
            role: 'system',
            content: 'You are an escalation detection expert for customer service calls.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Boost confidence if escalation keywords are present
      if (hasEscalationKeywords && result.shouldEscalate) {
        result.confidence = Math.min(result.confidence + 0.2, 1.0);
      }

      this.logger.info(`Escalation check: ${result.shouldEscalate ? 'ESCALATE' : 'CONTINUE'} (${result.confidence})`);
      
      // Emit escalation event
      if (result.shouldEscalate && result.confidence > 0.7) {
        this.emit('escalationRequired', result);
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('Error checking escalation:', error);
      return { shouldEscalate: false, confidence: 0.5 };
    }
  }

  async processTranscript(transcriptData) {
    if (!this.isRunning) {
      this.logger.warn('Analytics Service not running');
      return;
    }

    try {
      // Store transcript
      this.transcriptHistory.push(transcriptData);
      
      // Keep only last 50 transcripts
      if (this.transcriptHistory.length > 50) {
        this.transcriptHistory.shift();
      }

      // Analyze sentiment
      const sentiment = await this.analyzeSentiment(transcriptData.text);
      
      // Detect call reason
      const callReason = await this.detectCallReason(transcriptData.text);
      
      // Check for escalation
      const escalation = await this.checkEscalation(transcriptData.text);
      
      // Update context
      this.updateContext(transcriptData, sentiment, callReason, escalation);
      
      // Emit analytics event
      this.emit('analyticsProcessed', {
        transcript: transcriptData,
        sentiment: sentiment,
        callReason: callReason,
        escalation: escalation,
        context: this.currentContext
      });
      
    } catch (error) {
      this.logger.error('Error processing transcript:', error);
    }
  }

  updateContext(transcript, sentiment, callReason, escalation) {
    // Update customer mood based on sentiment
    if (sentiment.confidence > 0.7) {
      this.currentContext.customerMood = sentiment.sentiment;
    }

    // Add detected issues
    if (escalation.shouldEscalate) {
      this.currentContext.detectedIssues.push({
        type: 'escalation_required',
        reason: escalation.reasoning,
        timestamp: new Date().toISOString()
      });
    }

    // Update call summary
    this.currentContext.callSummary = `Call about ${callReason}. Customer mood: ${this.currentContext.customerMood}`;
  }

  getInsights() {
    const recentSentiments = this.sentimentHistory.slice(-10);
    const avgSentiment = recentSentiments.reduce((acc, item) => {
      return acc + (item.sentiment === 'positive' ? 1 : item.sentiment === 'negative' ? -1 : 0);
    }, 0) / recentSentiments.length;

    return {
      callReasons: Array.from(this.callReasons),
      currentMood: this.currentContext.customerMood,
      avgSentiment: avgSentiment,
      recentIssues: this.currentContext.detectedIssues.slice(-5),
      callSummary: this.currentContext.callSummary
    };
  }

  async stop() {
    this.logger.info('Stopping Analytics Service...');
    this.isRunning = false;
    this.client = null;
    this.logger.info('Analytics Service stopped');
  }
}

module.exports = AnalyticsService;
