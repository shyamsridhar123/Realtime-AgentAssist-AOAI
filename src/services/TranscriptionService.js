const WebSocket = require('ws');
const EventEmitter = require('events');
const Logger = require('../utils/Logger');

class TranscriptionService extends EventEmitter {
  constructor(config) {
    super();
    this.logger = new Logger('TranscriptionService');
    this.config = config;
    this.ws = null;
    this.isRunning = false;
    this.audioBuffer = [];
    this.transcriptionQueue = [];
    this.speakerDetection = new Map();
    this.currentSpeaker = null;
    this.lastTranscript = null;
    this.sessionId = null;
    this.realtimeEndpoint = null;
    
    // Enhanced speaker detection properties
    this.speakerLearningEnabled = false;
    this.voicePatterns = new Map();
    this.voiceActivityHistory = [];
    this.manualSpeakerAssignments = [];
  }

  async start() {
    try {
      this.logger.info('Starting Azure OpenAI Realtime Speech Transcription Service...');
      
      // Build the Azure OpenAI Realtime endpoint
      const baseEndpoint = this.config.endpoint.replace(/\/$/, '');
      this.realtimeEndpoint = `${baseEndpoint}/openai/realtime?api-version=${this.config.apiVersion}&deployment=${this.config.realtimeDeployment}`;
      
      // Convert to WebSocket URL - Azure OpenAI Realtime endpoint format
      const wsEndpoint = this.realtimeEndpoint.replace('https://', 'wss://');
      
      this.logger.info(`Connecting to Azure OpenAI Realtime API: ${wsEndpoint}`);
      
      // Initialize WebSocket connection to Azure OpenAI Realtime API
      this.ws = new WebSocket(wsEndpoint, {
        headers: {
          'api-key': this.config.apiKey,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      this.setupWebSocketHandlers();
      this.isRunning = true;
      
      // Wait for connection
      await this.waitForConnection();
      
      this.logger.info('Azure OpenAI Realtime Speech Service started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start Azure OpenAI Realtime Speech Service:', error);
      throw error;
    }
  }

  setupWebSocketHandlers() {
    this.ws.on('open', () => {
      this.logger.info('Connected to Azure OpenAI Realtime API');
      this.initializeSession();
    });

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this.handleRealtimeEvent(event);
      } catch (error) {
        this.logger.error('Error parsing realtime event:', error);
      }
    });

    this.ws.on('close', (code, reason) => {
      this.logger.warn(`WebSocket connection closed: ${code} - ${reason}`);
      this.isRunning = false;
      if (code !== 1000) {
        setTimeout(() => this.reconnect(), 5000);
      }
    });

    this.ws.on('error', (error) => {
      this.logger.error('WebSocket error:', error);
      this.emit('error', error);
    });
  }

  async waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  initializeSession() {
    // Initialize the realtime session
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: 'You are a real-time transcription assistant. Transcribe speech accurately and identify speakers when possible. Pay attention to voice characteristics, tone, and speech patterns.',
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: this.config.realtimeModel || 'gpt-4o-mini-realtime-preview'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        }
      }
    };

    this.sendRealtimeEvent(sessionConfig);
  }

  handleRealtimeEvent(event) {
    switch (event.type) {
      case 'session.created':
        this.sessionId = event.session.id;
        this.logger.info(`Session created: ${this.sessionId}`);
        break;

      case 'session.updated':
        this.logger.info('Session updated successfully');
        break;

      case 'input_audio_buffer.speech_started':
        this.logger.debug('Speech started');
        this.recordVoiceActivity('speech_started', event);
        this.emit('speechStarted');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.logger.debug('Speech stopped');
        this.recordVoiceActivity('speech_stopped', event);
        this.emit('speechStopped');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        this.handleTranscription(event);
        break;

      case 'conversation.item.input_audio_transcription.failed':
        this.logger.error('Transcription failed:', event.error);
        this.emit('transcriptionError', event.error);
        break;

      case 'error':
        this.logger.error('Realtime API error:', event.error);
        this.emit('error', event.error);
        break;

      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  handleTranscription(event) {
    const transcript = event.transcript;
    if (transcript && transcript.trim()) {
      const transcriptionData = {
        text: transcript,
        timestamp: new Date().toISOString(),
        speaker: this.detectSpeakerAdvanced(transcript, event),
        confidence: event.confidence || 0.95,
        sessionId: this.sessionId,
        audioFeatures: this.extractAudioFeatures(event)
      };

      this.logger.info(`Transcription: [${transcriptionData.speaker}] ${transcript}`);
      this.lastTranscript = transcriptionData;
      
      // Learn from this transcription for future speaker detection
      this.learnFromTranscription(transcriptionData);
      
      // Emit transcription event
      this.emit('transcription', transcriptionData);
      
      // Add to history
      this.transcriptionQueue.push(transcriptionData);
      
      // Keep only last 50 transcriptions
      if (this.transcriptionQueue.length > 50) {
        this.transcriptionQueue.shift();
      }
    }
  }

  detectSpeaker(transcript) {
    // Legacy method - kept for backward compatibility
    return this.detectSpeakerAdvanced(transcript, {});
  }

  detectSpeakerAdvanced(transcript, event) {
    // Enhanced speaker detection using voice characteristics and learning
    const audioFeatures = this.extractAudioFeatures(event);
    const contextClues = this.analyzeContextClues(transcript);
    
    // If we have learned voice patterns, use them
    if (this.speakerLearningEnabled && this.voicePatterns.size > 0) {
      const voiceBasedSpeaker = this.matchVoicePattern(audioFeatures);
      if (voiceBasedSpeaker) {
        this.logger.debug(`Voice-based speaker detection: ${voiceBasedSpeaker}`);
        return voiceBasedSpeaker;
      }
    }
    
    // Fallback to context-based detection
    const contextBasedSpeaker = this.detectSpeakerByContext(transcript);
    if (contextBasedSpeaker) {
      return contextBasedSpeaker;
    }
    
    // Fallback to alternating speakers with timing consideration
    return this.detectSpeakerByTiming();
  }

  detectSpeakerByContext(transcript) {
    // Enhanced context-based speaker detection
    const agentKeywords = [
      'how can I help', 'thank you for calling', 'let me check', 'I can help you',
      'let me look that up', 'can you please provide', 'I apologize for',
      'according to our records', 'I understand your concern', 'let me transfer you'
    ];
    
    const customerKeywords = [
      'I need help', 'I have a problem', 'I want to cancel', 'I\'m calling about',
      'my account', 'I can\'t', 'it\'s not working', 'I\'m frustrated',
      'I want to speak to', 'this is ridiculous', 'I demand'
    ];
    
    const lowerTranscript = transcript.toLowerCase();
    
    // Check for agent keywords
    if (agentKeywords.some(keyword => lowerTranscript.includes(keyword))) {
      return 'Agent';
    }
    
    // Check for customer keywords
    if (customerKeywords.some(keyword => lowerTranscript.includes(keyword))) {
      return 'Customer';
    }
    
    return null;
  }

  detectSpeakerByTiming() {
    // Use timing and conversation flow to detect speaker
    const recentTranscripts = this.transcriptionQueue.slice(-5);
    
    if (recentTranscripts.length === 0) {
      return this.currentSpeaker || 'Agent';
    }
    
    const lastSpeaker = recentTranscripts[recentTranscripts.length - 1]?.speaker;
    const timeSinceLastTranscript = new Date() - new Date(recentTranscripts[recentTranscripts.length - 1]?.timestamp);
    
    // If more than 3 seconds since last transcript, likely speaker change
    if (timeSinceLastTranscript > 3000) {
      return lastSpeaker === 'Agent' ? 'Customer' : 'Agent';
    }
    
    // If less than 1 second, likely same speaker continuing
    if (timeSinceLastTranscript < 1000) {
      return lastSpeaker;
    }
    
    // Default alternating
    return lastSpeaker === 'Agent' ? 'Customer' : 'Agent';
  }

  extractAudioFeatures(event) {
    // Extract audio features from the event for voice pattern matching
    // Note: OpenAI Realtime API might not provide all these features directly
    // This is a framework for when such features become available
    return {
      timestamp: new Date().toISOString(),
      confidence: event.confidence || 0.95,
      duration: this.calculateSpeechDuration(),
      voiceActivity: this.getRecentVoiceActivity(),
      // Placeholder for future audio features
      pitch: null,
      tone: null,
      speechRate: null,
      volume: null
    };
  }

  matchVoicePattern(audioFeatures) {
    // Match current audio features against learned voice patterns
    if (!this.voicePatterns.size) return null;
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [speaker, patterns] of this.voicePatterns) {
      const score = this.calculateVoicePatternScore(audioFeatures, patterns);
      if (score > bestScore && score > 0.7) { // Threshold for voice matching
        bestMatch = speaker;
        bestScore = score;
      }
    }
    
    return bestMatch;
  }

  calculateVoicePatternScore(currentFeatures, storedPatterns) {
    // Calculate similarity score between current and stored voice patterns
    // This is a simplified implementation
    let score = 0;
    let factors = 0;
    
    // Duration-based scoring
    if (storedPatterns.avgDuration && currentFeatures.duration) {
      const durationSimilarity = 1 - Math.abs(currentFeatures.duration - storedPatterns.avgDuration) / Math.max(currentFeatures.duration, storedPatterns.avgDuration);
      score += durationSimilarity * 0.3;
      factors += 0.3;
    }
    
    // Voice activity pattern scoring
    if (storedPatterns.voiceActivityPattern && currentFeatures.voiceActivity) {
      const activitySimilarity = this.compareVoiceActivityPatterns(currentFeatures.voiceActivity, storedPatterns.voiceActivityPattern);
      score += activitySimilarity * 0.4;
      factors += 0.4;
    }
    
    // Confidence-based scoring
    if (currentFeatures.confidence) {
      score += currentFeatures.confidence * 0.3;
      factors += 0.3;
    }
    
    return factors > 0 ? score / factors : 0;
  }

  compareVoiceActivityPatterns(current, stored) {
    // Compare voice activity patterns (simplified)
    if (!current || !stored) return 0;
    
    // Simple pattern matching based on speech/silence intervals
    const currentPattern = current.slice(-5); // Last 5 activities
    const storedPattern = stored.slice(-5);
    
    let matches = 0;
    const minLength = Math.min(currentPattern.length, storedPattern.length);
    
    for (let i = 0; i < minLength; i++) {
      if (currentPattern[i]?.type === storedPattern[i]?.type) {
        matches++;
      }
    }
    
    return minLength > 0 ? matches / minLength : 0;
  }

  learnFromTranscription(transcriptionData) {
    // Learn voice patterns from transcription data
    if (!this.speakerLearningEnabled) return;
    
    const speaker = transcriptionData.speaker;
    const features = transcriptionData.audioFeatures;
    
    if (!this.voicePatterns.has(speaker)) {
      this.voicePatterns.set(speaker, {
        samples: [],
        avgDuration: 0,
        voiceActivityPattern: [],
        lastUpdated: new Date()
      });
    }
    
    const patterns = this.voicePatterns.get(speaker);
    patterns.samples.push(features);
    patterns.lastUpdated = new Date();
    
    // Update average duration
    if (features.duration) {
      const durations = patterns.samples.map(s => s.duration).filter(d => d);
      patterns.avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    }
    
    // Update voice activity pattern
    if (features.voiceActivity) {
      patterns.voiceActivityPattern.push(...features.voiceActivity);
      // Keep only recent patterns
      if (patterns.voiceActivityPattern.length > 20) {
        patterns.voiceActivityPattern = patterns.voiceActivityPattern.slice(-20);
      }
    }
    
    // Keep only recent samples
    if (patterns.samples.length > 10) {
      patterns.samples = patterns.samples.slice(-10);
    }
    
    this.logger.debug(`Updated voice patterns for ${speaker}, samples: ${patterns.samples.length}`);
  }

  recordVoiceActivity(type, event) {
    // Record voice activity for pattern analysis
    this.voiceActivityHistory.push({
      type: type,
      timestamp: new Date().toISOString(),
      event: event
    });
    
    // Keep only recent history
    if (this.voiceActivityHistory.length > 100) {
      this.voiceActivityHistory = this.voiceActivityHistory.slice(-100);
    }
  }

  getRecentVoiceActivity() {
    // Get recent voice activity for pattern matching
    return this.voiceActivityHistory.slice(-10);
  }

  calculateSpeechDuration() {
    // Calculate duration of current speech segment
    const recentActivity = this.voiceActivityHistory.slice(-2);
    if (recentActivity.length < 2) return null;
    
    const start = recentActivity.find(a => a.type === 'speech_started');
    const end = recentActivity.find(a => a.type === 'speech_stopped');
    
    if (start && end) {
      return new Date(end.timestamp) - new Date(start.timestamp);
    }
    
    return null;
  }

  // Methods for manual speaker assignment and learning
  enableSpeakerLearning() {
    this.speakerLearningEnabled = true;
    this.logger.info('Speaker learning enabled');
  }

  disableSpeakerLearning() {
    this.speakerLearningEnabled = false;
    this.logger.info('Speaker learning disabled');
  }

  manualSpeakerAssignment(transcriptId, speaker) {
    // Record manual speaker assignment for learning
    this.manualSpeakerAssignments.push({
      transcriptId: transcriptId,
      speaker: speaker,
      timestamp: new Date().toISOString()
    });
    
    // Find the corresponding transcript and update learning
    const transcript = this.transcriptionQueue.find(t => t.id === transcriptId);
    if (transcript) {
      transcript.speaker = speaker;
      this.learnFromTranscription(transcript);
      this.logger.info(`Manual speaker assignment: ${speaker} for transcript ${transcriptId}`);
    }
  }

  getSpeakerStats() {
    // Get statistics about speaker detection
    return {
      totalTranscripts: this.transcriptionQueue.length,
      speakerPatterns: this.voicePatterns.size,
      learningEnabled: this.speakerLearningEnabled,
      manualAssignments: this.manualSpeakerAssignments.length,
      voiceActivitySamples: this.voiceActivityHistory.length
    };
  }

  analyzeContextClues(transcript) {
    // Analyze context clues from transcript
    const clues = {
      hasQuestions: /\?/.test(transcript),
      hasGreeting: /hello|hi|good morning|good afternoon/i.test(transcript),
      hasClosing: /thank you|goodbye|have a good day/i.test(transcript),
      hasApology: /sorry|apologize|my apologies/i.test(transcript),
      hasCompanyLanguage: /our company|our policy|according to our records/i.test(transcript),
      hasPersonalLanguage: /I am|I have|my|me/i.test(transcript),
      hasComplaint: /problem|issue|complaint|frustrated|angry/i.test(transcript),
      hasAcknowledgment: /I understand|I see|got it|okay/i.test(transcript)
    };
    
    return clues;
  }

  sendRealtimeEvent(event) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      this.logger.warn('WebSocket not connected, cannot send event');
    }
  }

  async processAudioStream(audioBuffer) {
    if (!this.isRunning || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('Service not ready for audio processing');
      return;
    }

    try {
      // Send audio to Azure OpenAI Realtime API
      const audioEvent = {
        type: 'input_audio_buffer.append',
        audio: audioBuffer.toString('base64')
      };

      this.sendRealtimeEvent(audioEvent);
      
      // Commit the audio buffer for processing
      this.sendRealtimeEvent({
        type: 'input_audio_buffer.commit'
      });

    } catch (error) {
      this.logger.error('Error processing audio stream:', error);
      this.emit('error', error);
    }
  }

  async reconnect() {
    if (this.isRunning) {
      this.logger.info('Attempting to reconnect to Azure OpenAI Realtime API...');
      try {
        await this.start();
      } catch (error) {
        this.logger.error('Reconnection failed:', error);
        setTimeout(() => this.reconnect(), 10000);
      }
    }
  }

  async stop() {
    this.logger.info('Stopping Azure OpenAI Realtime Speech Service...');
    this.isRunning = false;
    
    if (this.ws) {
      this.ws.close(1000, 'Service stopped');
      this.ws = null;
    }
    
    this.logger.info('Azure OpenAI Realtime Speech Service stopped');
  }

  getTranscriptionHistory() {
    return this.transcriptionQueue.slice();
  }

  getLastTranscription() {
    return this.lastTranscript;
  }
}

module.exports = TranscriptionService;