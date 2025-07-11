const EventEmitter = require('events');
const Logger = require('../utils/Logger');

class ChatbotService extends EventEmitter {
  constructor(config) {
    super();
    this.logger = new Logger('ChatbotService');
    this.config = config;
    this.client = null;
    this.isRunning = false;
    this.conversationHistory = [];
    this.knowledgeBase = {
      billing: {
        'billing_inquiry': 'To help with billing inquiries, check the customer account for recent charges and payment history.',
        'disputed_charge': 'For disputed charges, review the charge details and offer to investigate. If error confirmed, process refund.',
        'payment_issues': 'For payment issues, verify payment method and suggest alternative payment options if needed.'
      },
      technical: {
        'connection_issues': 'For connection problems, check service status in the area and guide through basic troubleshooting.',
        'slow_internet': 'For slow internet, check speed test results and verify plan details. May need technical dispatch.',
        'equipment_problems': 'For equipment issues, guide through device restart and check for firmware updates.'
      },
      service: {
        'service_activation': 'For service activation, verify customer information and process activation request.',
        'service_cancellation': 'For cancellation requests, understand reasons and offer retention options if appropriate.',
        'service_upgrade': 'For upgrades, explain available options and pricing. Process upgrade if customer agrees.'
      }
    };
    this.systemPrompt = this.buildSystemPrompt();
  }
  async start() {
    try {
      this.logger.info('Starting Chatbot Service...');
      
      // Just set running to true for now, don't initialize Azure OpenAI client yet
      this.isRunning = true;
      this.logger.info('Chatbot Service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Chatbot Service:', error.message);
      this.logger.error('Stack trace:', error.stack);
      throw error;
    }
  }

  buildSystemPrompt() {
    return `You are an AI assistant helping contact center agents provide excellent customer service for a telecommunications company.

Your role is to:
1. Provide quick, actionable advice to agents during live calls
2. Suggest appropriate responses and solutions
3. Help with policy questions and procedures
4. Offer troubleshooting guidance
5. Recommend next best actions

Guidelines:
- Keep responses concise and actionable
- Focus on customer satisfaction and resolution
- Suggest empathetic language when appropriate
- Provide step-by-step guidance when needed
- Always prioritize customer retention and satisfaction

Available knowledge areas:
- Billing and payment issues
- Technical support and troubleshooting
- Service activation, changes, and cancellation
- Company policies and procedures
- Escalation procedures

Response format:
- Be direct and practical
- Use bullet points for multi-step actions
- Include suggested phrases for customer communication
- Prioritize most important actions first`;
  }

  async query(question, context = null) {
    if (!this.isRunning) {
      throw new Error('Chatbot service is not running');
    }

    try {
      const messages = [
        {
          role: 'system',
          content: this.systemPrompt
        }
      ];

      // Add conversation history for context
      if (this.conversationHistory.length > 0) {
        messages.push({
          role: 'assistant',
          content: 'Previous conversation context: ' + this.conversationHistory.slice(-3).map(h => `Q: ${h.question} A: ${h.answer}`).join(' | ')
        });
      }

      // Add current call context if available
      if (context) {
        messages.push({
          role: 'user',
          content: `Current call context: ${JSON.stringify(context)}`
        });
      }

      // Add the current question
      messages.push({
        role: 'user',
        content: question
      });

      const result = await this.client.getChatCompletions(
        this.config.deployment,
        messages,
        {
          temperature: 0.3,
          maxTokens: 300,
          topP: 0.9
        }
      );

      const answer = result.choices[0].message.content;
      
      // Store in conversation history
      this.conversationHistory.push({
        question,
        answer,
        timestamp: new Date(),
        context: context || null
      });

      // Keep only last 10 conversations
      if (this.conversationHistory.length > 10) {
        this.conversationHistory = this.conversationHistory.slice(-10);
      }

      this.logger.debug(`Chatbot query: "${question}" -> "${answer.substring(0, 100)}..."`);
      
      return answer;
      
    } catch (error) {
      this.logger.error('Error processing chatbot query:', error);
      throw new Error('Failed to process chatbot query: ' + error.message);
    }
  }

  async getProactiveAdvice(callContext) {
    try {
      if (!callContext || !callContext.transcriptHistory) return null;
      
      const recentTranscripts = callContext.transcriptHistory.slice(-5);
      const conversationText = recentTranscripts.map(t => `${t.speaker}: ${t.text}`).join('\n');
      
      const messages = [
        {
          role: 'system',
          content: `You are proactively helping a contact center agent during a live call. 
          Analyze the conversation and provide proactive advice WITHOUT being asked.
          Focus on:
          1. What the agent should do next
          2. Potential issues to watch for
          3. Suggested responses
          4. Escalation warnings
          
          Only provide advice if there's something actionable. Return null if no advice needed.
          Keep it very concise - maximum 2 sentences.`
        },
        {
          role: 'user',
          content: `Current conversation:\n${conversationText}\n\nCall context: Customer mood: ${callContext.customerMood}, Call reasons: ${callContext.callReasons?.map(r => r.category).join(', ') || 'unknown'}`
        }
      ];

      const result = await this.client.getChatCompletions(
        this.config.deployment,
        messages,
        {
          temperature: 0.4,
          maxTokens: 150
        }
      );

      const advice = result.choices[0].message.content;
      
      // Return null if the response indicates no advice needed
      if (advice.toLowerCase().includes('no advice needed') || advice.toLowerCase().includes('null')) {
        return null;
      }
      
      return {
        type: 'proactive_advice',
        message: advice,
        timestamp: new Date(),
        confidence: 0.8
      };
      
    } catch (error) {
      this.logger.error('Error generating proactive advice:', error);
      return null;
    }
  }

  async suggestResponse(customerMessage, callContext) {
    try {
      const messages = [
        {
          role: 'system',
          content: `You are helping an agent craft the perfect response to a customer message.
          Provide a suggested response that is:
          - Empathetic and professional
          - Addresses the customer's concern
          - Moves the conversation toward resolution
          - Maintains a positive tone
          
          Return only the suggested response text, no additional commentary.`
        },
        {
          role: 'user',
          content: `Customer just said: "${customerMessage}"
          
          Call context: Customer mood: ${callContext?.customerMood || 'neutral'}, Previous issues: ${callContext?.detectedIssues?.length || 0}`
        }
      ];

      const result = await this.client.getChatCompletions(
        this.config.deployment,
        messages,
        {
          temperature: 0.5,
          maxTokens: 200
        }
      );

      return result.choices[0].message.content;
      
    } catch (error) {
      this.logger.error('Error suggesting response:', error);
      return null;
    }
  }

  async analyzeCallIntent(transcriptHistory) {
    try {
      const conversation = transcriptHistory.slice(-10).map(t => `${t.speaker}: ${t.text}`).join('\n');
      
      const messages = [
        {
          role: 'system',
          content: `Analyze the conversation and identify the customer's true intent and what they need.
          Look beyond surface-level requests to understand underlying needs.
          Return a JSON object with: intent, underlying_need, suggested_actions, priority_level`
        },
        {
          role: 'user',
          content: `Conversation:\n${conversation}`
        }
      ];

      const result = await this.client.getChatCompletions(
        this.config.deployment,
        messages,
        {
          temperature: 0.3,
          maxTokens: 250
        }
      );

      const response = result.choices[0].message.content;
      return JSON.parse(response);
      
    } catch (error) {
      this.logger.error('Error analyzing call intent:', error);
      return null;
    }
  }

  getQuickResponses(category) {
    const quickResponses = {
      greeting: [
        "Good morning! Thank you for calling. How can I help you today?",
        "Hello! I'm here to assist you. What can I do for you?",
        "Thank you for choosing us. How may I help you today?"
      ],
      empathy: [
        "I completely understand your frustration, and I'm here to help resolve this.",
        "I can definitely see why this would be concerning. Let me look into this for you.",
        "I apologize for any inconvenience this has caused. I'll work to get this resolved."
      ],
      clarification: [
        "Just to make sure I understand correctly, you're saying that...",
        "Let me clarify - are you looking to...",
        "To ensure I can best assist you, could you tell me more about..."
      ],
      resolution: [
        "I've found a solution that should resolve this issue for you.",
        "Based on what you've told me, here's what I can do to help:",
        "I have good news - I can take care of this for you right away."
      ],
      followup: [
        "Is there anything else I can help you with today?",
        "Are there any other questions or concerns I can address?",
        "Before we end, is there anything else on your mind?"
      ]
    };

    return quickResponses[category] || [];
  }

  getChatbotStats() {
    return {
      conversationHistory: this.conversationHistory.length,
      recentQueries: this.conversationHistory.slice(-5),
      isRunning: this.isRunning,
      knowledgeBaseSize: Object.keys(this.knowledgeBase).length
    };
  }

  clearHistory() {
    this.conversationHistory = [];
    this.logger.info('Chatbot conversation history cleared');
  }

  stop() {
    this.logger.info('Stopping Chatbot Service...');
    this.isRunning = false;
    this.removeAllListeners();
    this.logger.info('Chatbot Service stopped');
  }
}

module.exports = ChatbotService;
