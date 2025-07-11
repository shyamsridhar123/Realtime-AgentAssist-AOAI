// Load environment variables first
require('dotenv').config({ path: '../.env' });

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

// Debug environment variables
console.log('Environment variables loaded:');
console.log('AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT ? 'Set' : 'Missing');
console.log('AZURE_OPENAI_KEY:', process.env.AZURE_OPENAI_KEY ? 'Set' : 'Missing');
console.log('AZURE_OPENAI_API_VERSION:', process.env.AZURE_OPENAI_API_VERSION ? 'Set' : 'Missing');
console.log('AZURE_OPENAI_REALTIME_API_VERSION:', process.env.AZURE_OPENAI_REALTIME_API_VERSION ? 'Set' : 'Missing');
console.log('AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT:', process.env.AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT ? 'Set' : 'Missing');

const { AzureOpenAI } = require('openai');
const { OpenAIRealtimeWS } = require('openai/beta/realtime/ws');

class AgentAssistWebApp {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.azureOpenAI = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION
    });
    
    this.activeAgents = new Map();
    this.activeCalls = new Map();
    this.realtimeConnections = new Map(); // Store Azure OpenAI Realtime WebSocket connections
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  setupRoutes() {
    // Serve the main dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        services: {
          azureOpenAI: !!this.azureOpenAI,
          activeAgents: this.activeAgents.size,
          activeCalls: this.activeCalls.size
        }
      });
    });

    // Get active stats
    this.app.get('/api/stats', (req, res) => {
      res.json({
        activeAgents: this.activeAgents.size,
        activeCalls: this.activeCalls.size,
        totalSessionsToday: 0 // TODO: Implement session tracking
      });
    });
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Agent connected: ${socket.id}`);
      
      // Register agent
      socket.on('registerAgent', (agentData) => {
        this.activeAgents.set(socket.id, {
          id: socket.id,
          name: agentData.name || 'Agent',
          agentId: agentData.id,
          status: 'available',
          connectedAt: new Date(),
          currentCall: null
        });
        
        socket.emit('agentRegistered', {
          agentId: socket.id,
          name: agentData.name,
          status: 'connected'
        });
        
        console.log(`Agent registered: ${agentData.name || socket.id}`);
      });

      // Start call session
      socket.on('startCall', async (callData) => {
        const sessionId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const call = {
          id: sessionId,
          agentId: socket.id,
          callerId: callData.callerId || 'Unknown',
          startTime: new Date(),
          status: 'active',
          transcript: [],
          sentiment: 'neutral',
          callReason: 'unknown',
          escalationRisk: 'low',
          insights: []
        };
        
        this.activeCalls.set(sessionId, call);
        
        // Update agent status
        if (this.activeAgents.has(socket.id)) {
          this.activeAgents.get(socket.id).currentCall = sessionId;
          this.activeAgents.get(socket.id).status = 'on-call';
        }
        
        // Create Azure OpenAI Realtime connection for this session
        try {
          await this.createRealtimeConnection(sessionId, socket);
          console.log(`Realtime transcription enabled for session ${sessionId}`);
        } catch (error) {
          console.error('Failed to create realtime connection:', error);
          // Continue without realtime transcription
        }
        
        socket.emit('callStarted', {
          sessionId: sessionId,
          status: 'active'
        });
        
        console.log(`Call started: ${sessionId} by agent ${socket.id}`);
      });

      // Process audio transcript
      socket.on('newTranscript', async (data) => {
        const { sessionId, text, speaker, timestamp } = data;
        
        if (!this.activeCalls.has(sessionId)) {
          socket.emit('error', { message: 'Call not found' });
          return;
        }
        
        const call = this.activeCalls.get(sessionId);
        
        // Add to transcript
        const transcriptEntry = {
          timestamp: timestamp || new Date().toISOString(),
          speaker: speaker,
          text: text,
          id: Date.now()
        };
        
        call.transcript.push(transcriptEntry);
        
        // Emit live transcript update
        socket.emit('newTranscript', transcriptEntry);
        
        // Analyze with Azure OpenAI
        try {
          await this.analyzeTranscript(sessionId, text, speaker, socket);
        } catch (error) {
          console.error('Analysis error:', error);
          socket.emit('error', { message: error.message });
        }
      });

      // End call
      socket.on('endCall', (data) => {
        const { sessionId } = data;
        
        if (this.activeCalls.has(sessionId)) {
          const call = this.activeCalls.get(sessionId);
          call.endTime = new Date();
          call.status = 'completed';
          call.duration = call.endTime - call.startTime;
          
          // Generate call summary
          this.generateCallSummary(sessionId, socket);
          
          this.activeCalls.delete(sessionId);
        }
        
        // Close realtime connection if exists
        if (this.realtimeConnections.has(sessionId)) {
          const realtimeClient = this.realtimeConnections.get(sessionId);
          if (realtimeClient) {
            realtimeClient.close();
          }
          this.realtimeConnections.delete(sessionId);
        }
        
        // Update agent status
        if (this.activeAgents.has(socket.id)) {
          this.activeAgents.get(socket.id).currentCall = null;
          this.activeAgents.get(socket.id).status = 'available';
        }
        
        socket.emit('callEnded', { sessionId });
        console.log(`Call ended: ${sessionId}`);
      });

      // Agent chatbot query
      socket.on('chatMessage', async (data) => {
        const { message, sessionId, context } = data;
        
        try {
          const response = await this.handleAgentQuery(message, sessionId, context);
          socket.emit('chatbotResponse', {
            response: response,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle audio chunks for real-time transcription
      socket.on('audioChunk', (data) => {
        const { sessionId, audioData, timestamp } = data;
        
        if (!this.realtimeConnections.has(sessionId)) {
          console.warn(`No realtime connection for session ${sessionId}`);
          return;
        }
        
        const realtimeClient = this.realtimeConnections.get(sessionId);
        
        if (!realtimeClient) {
          console.warn(`Realtime client is null for session ${sessionId}`);
          return;
        }
        
        try {
          // Convert audio data to base64 for the OpenAI Realtime client
          const audioBuffer = new Int16Array(audioData);
          const base64Audio = Buffer.from(audioBuffer.buffer).toString('base64');
          
          // Send audio chunk to OpenAI Realtime client
          realtimeClient.send({
            type: 'input_audio_buffer.append',
            audio: base64Audio
          });
          
        } catch (error) {
          console.error('Error sending audio chunk:', error);
        }
      });

      // Handle manual speaker assignment for learning
      socket.on('updateTranscriptSpeaker', (data) => {
        const { transcriptId, newSpeaker, sessionId } = data;
        
        if (!this.activeCalls.has(sessionId)) {
          socket.emit('error', { message: 'Call not found' });
          return;
        }
        
        const call = this.activeCalls.get(sessionId);
        
        // Find and update the transcript entry
        const transcriptEntry = call.transcript.find(t => t.id == transcriptId);
        if (transcriptEntry) {
          transcriptEntry.speaker = newSpeaker;
          console.log(`Updated speaker for transcript ${transcriptId} to ${newSpeaker}`);
          
          // Emit the updated transcript to all connected clients
          socket.emit('transcriptUpdated', {
            transcriptId: transcriptId,
            newSpeaker: newSpeaker,
            sessionId: sessionId
          });
        }
      });

      // Enable/disable speaker learning
      socket.on('toggleSpeakerLearning', (data) => {
        const { sessionId, enabled } = data;
        
        if (this.realtimeConnections.has(sessionId)) {
          const realtimeClient = this.realtimeConnections.get(sessionId);
          if (realtimeClient && realtimeClient.transcriptionService) {
            if (enabled) {
              realtimeClient.transcriptionService.enableSpeakerLearning();
            } else {
              realtimeClient.transcriptionService.disableSpeakerLearning();
            }
            
            socket.emit('speakerLearningToggled', { enabled: enabled });
          }
        }
      });

      // Get speaker statistics
      socket.on('getSpeakerStats', (data) => {
        const { sessionId } = data;
        
        if (this.realtimeConnections.has(sessionId)) {
          const realtimeClient = this.realtimeConnections.get(sessionId);
          if (realtimeClient && realtimeClient.transcriptionService) {
            const stats = realtimeClient.transcriptionService.getSpeakerStats();
            socket.emit('speakerStats', stats);
          }
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`Agent disconnected: ${socket.id}`);
        
        // Clean up agent data
        if (this.activeAgents.has(socket.id)) {
          const agent = this.activeAgents.get(socket.id);
          if (agent.currentCall) {
            // End any active call
            socket.emit('end-call', { callId: agent.currentCall });
            
            // Close realtime connection if exists
            if (this.realtimeConnections.has(agent.currentCall)) {
              const realtimeClient = this.realtimeConnections.get(agent.currentCall);
              if (realtimeClient) {
                realtimeClient.close();
              }
              this.realtimeConnections.delete(agent.currentCall);
            }
          }
          this.activeAgents.delete(socket.id);
        }
      });
    });
  }

  async analyzeTranscript(sessionId, text, speaker, socket) {
    const call = this.activeCalls.get(sessionId);
    
    // Sentiment Analysis
    const sentiment = await this.analyzeSentiment(text);
    call.sentiment = sentiment.sentiment;
    
    // Call Reason Detection
    if (call.transcript.length <= 3) { // Early in the call
      const callReason = await this.detectCallReason(text);
      call.callReason = callReason;
    }
    
    // Escalation Detection
    const escalation = await this.checkEscalation(text, call.transcript);
    if (escalation.shouldEscalate && escalation.confidence > 0.7) {
      call.escalationRisk = 'high';
    }
    
    // Generate real-time insights
    const insights = await this.generateInsights(text, speaker, call);
    
    console.log('Generated insights:', insights.length, 'insights for', speaker);
    
    // Send combined analytics update
    socket.emit('analyticsUpdate', {
      sentiment: {
        score: sentiment.sentiment,
        category: sentiment.sentiment,
        confidence: sentiment.confidence
      },
      callReason: call.callReason,
      escalationRisk: {
        score: Math.round(escalation.confidence * 100),
        level: escalation.shouldEscalate ? 'high' : 'low',
        confidence: escalation.confidence
      },
      insights: insights.length > 0 ? insights : [{
        type: 'tip',
        message: 'Continue conversation to get more insights',
        timestamp: new Date().toISOString(),
        priority: 'low'
      }]
    });
  }

  async analyzeSentiment(text) {
    const response = await this.azureOpenAI.chat.completions.create({
      model: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
      messages: [
        {
          role: 'system',
          content: 'You are a sentiment analysis expert. Analyze customer service conversations and return JSON only.'
        },
        {
          role: 'user',
          content: `Analyze sentiment of: "${text}". Return JSON: {"sentiment": "positive|negative|neutral", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    });
    
    return JSON.parse(response.choices[0].message.content);
  }

  async detectCallReason(text) {
    const response = await this.azureOpenAI.chat.completions.create({
      model: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
      messages: [
        {
          role: 'system',
          content: 'You are a call categorization expert for telecommunications. Categorize the main reason for customer calls.'
        },
        {
          role: 'user',
          content: `Categorize this call reason: "${text}". Choose from: billing_inquiry, technical_support, account_management, service_complaint, new_service, cancellation, general_inquiry. Return only the category.`
        }
      ],
      max_tokens: 50,
      temperature: 0.2
    });
    
    return response.choices[0].message.content.trim().toLowerCase();
  }

  async checkEscalation(text, transcript) {
    const recentTranscripts = transcript.slice(-5).map(t => `${t.speaker}: ${t.text}`).join('\n');
    
    const response = await this.azureOpenAI.chat.completions.create({
      model: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
      messages: [
        {
          role: 'system',
          content: 'You are an escalation detection expert. Determine if customer service calls need supervisor escalation.'
        },
        {
          role: 'user',
          content: `Recent conversation:\n${recentTranscripts}\n\nLatest: "${text}"\n\nShould this be escalated? Return JSON: {"shouldEscalate": true|false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}`
        }
      ],
      max_tokens: 200,
      temperature: 0.3
    });
    
    return JSON.parse(response.choices[0].message.content);
  }

  async generateInsights(text, speaker, call) {
    const insights = [];
    
    try {
      // Generate insights for both customer and agent speech
      let systemPrompt = '';
      let userPrompt = '';
      
      if (speaker === 'Customer') {
        systemPrompt = `You are an expert agent coach. Provide helpful real-time suggestions for contact center agents based on customer statements. Keep suggestions brief and actionable.`;
        userPrompt = `Customer just said: "${text}"\nCall reason: ${call.callReason || 'unknown'}\nCustomer sentiment: ${call.sentiment || 'neutral'}\n\nProvide 1-2 brief suggestions for the agent:`;
      } else {
        systemPrompt = `You are an expert agent coach. Provide feedback and suggestions for contact center agents based on their responses to customers. Keep suggestions brief and actionable.`;
        userPrompt = `Agent just said: "${text}"\nCall reason: ${call.callReason || 'unknown'}\nCustomer sentiment: ${call.sentiment || 'neutral'}\n\nProvide 1-2 brief coaching tips for the agent:`;
      }
      
      const response = await this.azureOpenAI.chat.completions.create({
        model: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_tokens: 150,
        temperature: 0.4
      });
      
      const suggestion = response.choices[0].message.content.trim();
      if (suggestion && suggestion.length > 10) {
        insights.push({
          type: speaker === 'Customer' ? 'customer_insight' : 'agent_coaching',
          message: suggestion,
          timestamp: new Date().toISOString(),
          priority: call.sentiment === 'negative' ? 'high' : 'normal',
          speaker: speaker
        });
      }
      
      // Add contextual insights based on call progress
      if (call.transcript && call.transcript.length > 0) {
        const callDuration = Math.floor((new Date() - call.startTime) / 1000);
        
        if (callDuration > 300 && call.callReason === 'unknown') {
          insights.push({
            type: 'call_progress',
            message: 'Call is running long without clear reason identification. Consider asking clarifying questions.',
            timestamp: new Date().toISOString(),
            priority: 'medium'
          });
        }
        
        if (call.sentiment === 'negative' && call.escalationRisk !== 'high') {
          insights.push({
            type: 'sentiment_alert',
            message: 'Customer sentiment is negative. Focus on empathy and active listening.',
            timestamp: new Date().toISOString(),
            priority: 'high'
          });
        }
      }
      
    } catch (error) {
      console.error('Error generating insights:', error);
      // Return fallback insights
      insights.push({
        type: 'system_message',
        message: 'Continue active listening and maintain professional tone.',
        timestamp: new Date().toISOString(),
        priority: 'low'
      });
    }
    
    return insights;
  }

  async handleAgentQuery(query, sessionId, context = []) {
    const call = sessionId ? this.activeCalls.get(sessionId) : null;
    const callContext = call ? `Current call context: Reason=${call.callReason}, Sentiment=${call.sentiment}, Duration=${Math.floor((new Date() - call.startTime) / 1000)}s` : 'No active call';
    
    // Add recent transcript context
    const transcriptContext = context.length > 0 ? 
      `Recent conversation:\n${context.map(t => `${t.speaker}: ${t.text}`).join('\n')}` : 
      'No recent conversation available';
    
    const response = await this.azureOpenAI.chat.completions.create({
      model: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
      messages: [
        {
          role: 'system',
          content: `You are an expert contact center assistant helping agents during live calls. Provide helpful, actionable responses. ${callContext}\n\n${transcriptContext}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      max_tokens: 300,
      temperature: 0.4
    });
    
    return response.choices[0].message.content;
  }

  async generateCallSummary(sessionId, socket) {
    const call = this.activeCalls.get(sessionId);
    if (!call) return;
    
    const transcriptText = call.transcript.map(t => `${t.speaker}: ${t.text}`).join('\n');
    
    try {
      const response = await this.azureOpenAI.chat.completions.create({
        model: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
        messages: [
          {
            role: 'system',
            content: 'You are a call summarization expert. Create concise, professional call summaries for contact center records.'
          },
          {
            role: 'user',
            content: `Summarize this customer service call:\n\n${transcriptText}\n\nProvide: 1) Issue summary 2) Resolution/outcome 3) Next steps if any`
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      });
      
      const summary = {
        sessionId: sessionId,
        summary: response.choices[0].message.content,
        duration: Math.floor((call.endTime - call.startTime) / 1000),
        sentiment: call.sentiment,
        reason: call.callReason,
        escalated: call.escalationRisk === 'high',
        timestamp: new Date().toISOString()
      };
      
      socket.emit('call-summary', summary);
      
    } catch (error) {
      console.error('Summary generation error:', error);
    }
  }

  async createRealtimeConnection(sessionId, socket) {
    try {
      // Debug environment variables
      console.log('Realtime Speech Deployment:', process.env.AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT);
      console.log('Realtime Speech Model:', process.env.AZURE_OPENAI_LLM_REALTIME_SPEECH_MODEL);
      console.log('Regular API Version:', process.env.AZURE_OPENAI_API_VERSION);
      console.log('Realtime API Version:', process.env.AZURE_OPENAI_REALTIME_API_VERSION);
      console.log('Endpoint:', process.env.AZURE_OPENAI_ENDPOINT);
      
      // Create Azure OpenAI client for Realtime - use the specific API version for Realtime Speech
      const realtimeApiVersion = process.env.AZURE_OPENAI_REALTIME_API_VERSION || "2024-10-01-preview";
      const deploymentName = process.env.AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT || "gpt-4o-realtime-preview";
      
      console.log('Using Realtime API Version:', realtimeApiVersion);
      console.log('Using Deployment Name:', deploymentName);
      
      const azureOpenAIClient = new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_KEY,
        apiVersion: realtimeApiVersion,
        deployment: deploymentName,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      });
      
      // Create the realtime client using Azure OpenAI
      const realtimeClient = await OpenAIRealtimeWS.azure(azureOpenAIClient);
      
      console.log('Connecting to Azure OpenAI Realtime for session:', sessionId);
      
      // Set up event handlers
      realtimeClient.socket.on('open', () => {
        console.log(`Azure OpenAI Realtime connection opened for session ${sessionId}`);
        
        // Send session configuration
        realtimeClient.send({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: 'You are a helpful assistant for transcribing audio in real-time for a contact center agent assist system. Only provide transcription, do not respond conversationally.',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 200
            }
          }
        });
      });
      
      // Handle transcription completion
      realtimeClient.on('conversation.item.input_audio_transcription.completed', (event) => {
        if (event.transcript) {
          const transcriptData = {
            text: event.transcript,
            timestamp: new Date().toISOString(),
            speaker: 'Customer', // Default to customer, can be enhanced with speaker detection
            confidence: 0.95,
            id: Date.now()
          };
          
          console.log('Transcription:', transcriptData.text);
          
          // Add to call transcript
          if (this.activeCalls.has(sessionId)) {
            this.activeCalls.get(sessionId).transcript.push(transcriptData);
          }
          
          // Emit to frontend
          socket.emit('newTranscript', transcriptData);
          
          // Analyze the transcript
          this.analyzeTranscript(sessionId, transcriptData.text, transcriptData.speaker, socket);
        }
      });
      
      realtimeClient.on('input_audio_buffer.speech_started', () => {
        console.log('Speech started');
        socket.emit('speechStarted');
      });
      
      realtimeClient.on('input_audio_buffer.speech_stopped', () => {
        console.log('Speech stopped');
        socket.emit('speechStopped');
      });
      
      realtimeClient.on('error', (error) => {
        console.error('Azure OpenAI Realtime client error:', error);
        socket.emit('error', { 
          message: 'Realtime transcription connection error', 
          details: error.message 
        });
      });
      
      realtimeClient.socket.on('close', () => {
        console.log(`Azure OpenAI Realtime connection closed for session ${sessionId}`);
        this.realtimeConnections.delete(sessionId);
      });
      
      this.realtimeConnections.set(sessionId, realtimeClient);
      return realtimeClient;
      
    } catch (error) {
      console.error('Error creating realtime connection:', error);
      
      // Emit error to frontend but don't throw - allow the call to continue without realtime transcription
      socket.emit('error', { 
        message: 'Realtime transcription unavailable', 
        details: 'Azure OpenAI Realtime Speech endpoint not available. Please check your deployment configuration.',
        fallback: 'Manual transcription can be used instead.'
      });
      
      // Return null to indicate realtime connection failed
      return null;
    }
  }

  async createAzureSpeechConnection(sessionId, socket) {
    // For now, just log that we would use Azure Speech Services
    // This is a fallback when Azure OpenAI Realtime is not available
    console.log(`Azure Speech Services fallback for session ${sessionId}`);
    console.log('Azure Speech Endpoint:', process.env.AZURE_SPEECH_ENDPOINT);
    console.log('Azure Speech Region:', process.env.AZURE_SPEECH_REGION);
    
    // TODO: Implement Azure Speech Services WebSocket connection
    // This would use the Speech SDK to create a real-time recognition session
    throw new Error('Azure Speech Services fallback not implemented yet');
  }

  start(port = 3000) {
    this.server.listen(port, () => {
      console.log(`🚀 Real-Time Agent Assist Web App running on http://localhost:${port}`);
      console.log(`📊 Dashboard: http://localhost:${port}`);
      console.log(`🔧 Health Check: http://localhost:${port}/health`);
    });
  }
}

// Start the application
const app = new AgentAssistWebApp();
app.start(process.env.PORT || 3000);
