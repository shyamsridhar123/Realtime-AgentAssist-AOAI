// Socket.IO connection
const socket = io();

// DOM elements
const elements = {
    agentName: document.getElementById('agentName'),
    agentId: document.getElementById('agentId'),
    registerAgent: document.getElementById('registerAgent'),
    callerId: document.getElementById('callerId'),
    startCall: document.getElementById('startCall'),
    endCall: document.getElementById('endCall'),
    toggleAudio: document.getElementById('toggleAudio'),
    simulateTranscript: document.getElementById('simulateTranscript'),
    audioStatus: document.getElementById('audioStatus'),
    audioLevel: document.getElementById('audioLevel'),
    transcript: document.getElementById('transcript'),
    sessionId: document.getElementById('sessionId'),
    sentimentValue: document.getElementById('sentimentValue'),
    sentimentIndicator: document.getElementById('sentimentIndicator'),
    callReasonValue: document.getElementById('callReasonValue'),
    escalationValue: document.getElementById('escalationValue'),
    escalationIndicator: document.getElementById('escalationIndicator'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendChatMessage: document.getElementById('sendChatMessage'),
    insights: document.getElementById('insights'),
    connectionStatus: document.getElementById('connectionStatus'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    // Context Panel Elements
    contextPanel: document.getElementById('contextPanel'),
    toggleContext: document.getElementById('toggleContext'),
    contextContent: document.getElementById('contextContent'),
    contextToggleIcon: document.getElementById('contextToggleIcon'),
    contextDuration: document.getElementById('contextDuration'),
    contextCaller: document.getElementById('contextCaller'),
    contextSentiment: document.getElementById('contextSentiment'),
    contextReason: document.getElementById('contextReason'),
    contextRisk: document.getElementById('contextRisk'),
    // Suggestions Panel Elements
    suggestionsPanel: document.getElementById('suggestionsPanel'),
    suggestionsContent: document.getElementById('suggestionsContent'),
    // Speaker Recognition Elements
    autoSpeakerDetection: document.getElementById('autoSpeakerDetection'),
    speakerCustomer: document.getElementById('speakerCustomer'),
    speakerAgent: document.getElementById('speakerAgent')
};

// Application state
let state = {
    agentRegistered: false,
    callActive: false,
    audioActive: false,
    sessionId: null,
    // Speaker Recognition State
    autoSpeakerDetection: false,
    currentSpeaker: 'Agent',
    speakerHistory: [],
    lastSpeakerChange: null,
    // Call Context State
    callContext: {
        startTime: null,
        caller: null,
        duration: 0,
        sentiment: 'neutral',
        reason: 'unknown',
        risk: 'low'
    },
    // Chat and Transcript State
    transcriptEntries: [],
    chatHistory: []
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - initializing application');
    initializeEventListeners();
    initializeContextPanel();
    initializeSpeakerRecognition();
    setupSocketListeners();
    showToast('Welcome to Agent Assist Dashboard', 'info');
    
    // Debug current speaker state
    console.log('Initial speaker state:', state.currentSpeaker);
    console.log('Agent radio checked:', elements.speakerAgent?.checked);
    console.log('Customer radio checked:', elements.speakerCustomer?.checked);
    
    // Force set the radio buttons after DOM is ready
    setTimeout(() => {
        if (elements.speakerAgent && elements.speakerCustomer) {
            elements.speakerAgent.checked = true;
            elements.speakerCustomer.checked = false;
            state.currentSpeaker = 'Agent';
            console.log('Force set radio buttons - Agent checked:', elements.speakerAgent.checked);
        }
    }, 100);
});

// Event listeners
function initializeEventListeners() {
    elements.registerAgent.addEventListener('click', registerAgent);
    elements.startCall.addEventListener('click', startCall);
    elements.endCall.addEventListener('click', endCall);
    elements.toggleAudio.addEventListener('click', toggleAudio);
    elements.simulateTranscript.addEventListener('click', simulateTranscript);
    elements.sendChatMessage.addEventListener('click', sendChatMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Context Panel Event Listeners
    elements.toggleContext.addEventListener('click', toggleContextPanel);
    
    // Suggestions Panel Event Listeners
    elements.suggestionsContent.addEventListener('click', handleSuggestionClick);
    
    // Speaker Recognition Initialization
    initializeSpeakerRecognition();
}

// Socket.IO event listeners
function setupSocketListeners() {
    socket.on('connect', () => {
        updateConnectionStatus('Connected', 'success');
        showToast('Connected to Agent Assist server', 'success');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('Disconnected', 'danger');
        showToast('Disconnected from server', 'error');
    });

    socket.on('agentRegistered', (data) => {
        state.agentRegistered = true;
        showToast(`Agent ${data.name} registered successfully`, 'success');
        updateInsights([{
            type: '✅ Status',
            content: `Agent ${data.name} is now registered and ready to take calls`
        }]);
    });

    socket.on('callStarted', (data) => {
        state.callActive = true;
        state.sessionId = data.sessionId;
        elements.sessionId.textContent = data.sessionId;
        elements.startCall.disabled = true;
        elements.endCall.disabled = false;
        elements.transcript.innerHTML = '<div class="text-muted">Call started - waiting for transcript...</div>';
        showToast('Call session started', 'info');
        resetAnalytics();
        
        // Show context panel and update context
        enhanceCallStarted(data);
        
        // Show context panel and update context
        enhanceCallStarted(data);
    });

    socket.on('callEnded', (data) => {
        state.callActive = false;
        state.sessionId = null;
        elements.sessionId.textContent = 'Not Active';
        elements.startCall.disabled = false;
        elements.endCall.disabled = true;
        showToast('Call session ended', 'info');
        
        // Hide context panel
        enhanceCallEnded(data);
        
        // Hide context panel
        enhanceCallEnded(data);
        
        if (data.summary) {
            updateInsights([{
                type: '📋 Summary',
                content: data.summary
            }]);
        }
    });

    socket.on('newTranscript', (data) => {
        addTranscriptEntry(data);
    });

    socket.on('realtimeTranscript', (data) => {
        addTranscriptEntry(data);
    });

    socket.on('analyticsUpdate', (data) => {
        updateAnalytics(data);
        
        // Update context with analytics data
        enhanceAnalyticsUpdate(data);
    });

    socket.on('chatbotResponse', (data) => {
        addChatMessage(data.response, 'assistant');
    });

    socket.on('error', (error) => {
        showToast(`Error: ${error.message}`, 'error');
        console.error('Socket error:', error);
    });
}

// Agent registration
function registerAgent() {
    const name = elements.agentName.value.trim() || 'Agent';
    const id = elements.agentId.value.trim() || 'agent_' + Date.now();

    socket.emit('registerAgent', { name, id });
}

// Call management
function startCall() {
    if (!state.agentRegistered) {
        showToast('Please register as an agent first', 'error');
        return;
    }

    const callerId = elements.callerId.value.trim();
    if (!callerId) {
        showToast('Please enter caller ID', 'error');
        return;
    }

    socket.emit('startCall', { callerId });
}

function endCall() {
    if (!state.callActive) {
        return;
    }

    socket.emit('endCall', { sessionId: state.sessionId });
}

// Audio management
async function toggleAudio() {
    if (!state.audioActive) {
        await startAudio();
    } else {
        stopAudio();
    }
}

async function startAudio() {
    try {
        state.audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000,
                channelCount: 1
            } 
        });
        
        state.audioActive = true;
        elements.audioStatus.textContent = 'Stop Audio';
        elements.toggleAudio.classList.remove('btn-outline-primary');
        elements.toggleAudio.classList.add('btn-danger');
        
        // Start audio level monitoring
        monitorAudioLevel();
        
        // Start real-time audio streaming to server
        startAudioStreaming();
        
        showToast('Audio capture started', 'success');
        
    } catch (error) {
        console.error('Error starting audio:', error);
        showToast('Failed to start audio capture', 'error');
    }
}

function startAudioStreaming() {
    if (!state.audioStream || !state.callActive) return;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
    });
    
    const source = audioContext.createMediaStreamSource(state.audioStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (event) => {
        if (!state.audioActive || !state.callActive) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        const audioData = new Float32Array(inputData);
        
        // Convert to 16-bit PCM and send to server
        const pcm16 = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
        }
        
        // Send audio chunk to server for Azure OpenAI Realtime processing
        socket.emit('audioChunk', {
            sessionId: state.sessionId,
            audioData: Array.from(pcm16),
            timestamp: Date.now()
        });
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    // Store references for cleanup
    state.audioContext = audioContext;
    state.audioProcessor = processor;
}

function stopAudio() {
    if (state.audioStream) {
        state.audioStream.getTracks().forEach(track => track.stop());
        state.audioStream = null;
    }
    
    if (state.audioContext) {
        state.audioContext.close();
        state.audioContext = null;
    }
    
    if (state.audioProcessor) {
        state.audioProcessor.disconnect();
        state.audioProcessor = null;
    }
    
    state.audioActive = false;
    elements.audioStatus.textContent = 'Start Audio';
    elements.toggleAudio.classList.remove('btn-danger');
    elements.toggleAudio.classList.add('btn-outline-primary');
    elements.audioLevel.style.width = '0%';
    
    showToast('Audio capture stopped', 'info');
}

function monitorAudioLevel() {
    if (!state.audioStream || !state.audioActive) return;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(state.audioStream);
    const analyser = audioContext.createAnalyser();
    
    source.connect(analyser);
    analyser.fftSize = 256;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function updateLevel() {
        if (!state.audioActive) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        const level = Math.min(100, (average / 128) * 100);
        
        elements.audioLevel.style.width = `${level}%`;
        
        requestAnimationFrame(updateLevel);
    }
    
    updateLevel();
}

// Transcript management
function addTranscriptEntry(data) {
    console.log('addTranscriptEntry called with speaker:', data.speaker);
    
    const entry = document.createElement('div');
    entry.className = `transcript-entry transcript-${data.speaker.toLowerCase()}`;
    entry.setAttribute('data-transcript-id', data.id || Date.now());
    
    const timestamp = new Date(data.timestamp).toLocaleTimeString();
    
    entry.innerHTML = `
        <div class="transcript-timestamp">${timestamp}</div>
        <div class="transcript-speaker">${data.speaker}:</div>
        <div class="transcript-text">${data.text}</div>
        <div class="transcript-actions">
            <button class="btn btn-outline-info btn-sm" onclick="changeSpeakerForTranscript('${data.id || Date.now()}', 'Customer')" title="Mark as Customer">
                C
            </button>
            <button class="btn btn-outline-success btn-sm" onclick="changeSpeakerForTranscript('${data.id || Date.now()}', 'Agent')" title="Mark as Agent">
                A
            </button>
        </div>
    `;
    
    elements.transcript.appendChild(entry);
    elements.transcript.scrollTop = elements.transcript.scrollHeight;
    
    // Add to speaker history
    addSpeakerToHistory(data.speaker, data.text, data.timestamp);
    
    // Add to transcript entries (with safety check)
    if (!state.transcriptEntries) {
        state.transcriptEntries = [];
    }
    state.transcriptEntries.push(data);
}

function simulateTranscript() {
    if (!state.callActive) {
        showToast('Please start a call first', 'error');
        return;
    }

    console.log('simulateTranscript called - current speaker:', state.currentSpeaker);
    console.log('autoSpeakerDetection:', state.autoSpeakerDetection);
    console.log('Agent radio checked:', elements.speakerAgent?.checked);
    console.log('Customer radio checked:', elements.speakerCustomer?.checked);

    const sampleTranscripts = [
        { speaker: 'Customer', text: 'Hi, I\'m having trouble with my account. I can\'t seem to log in.' },
        { speaker: 'Agent', text: 'I\'m sorry to hear you\'re having trouble. Let me help you with that.' },
        { speaker: 'Customer', text: 'I\'ve been trying for over an hour and it\'s really frustrating!' },
        { speaker: 'Agent', text: 'I understand your frustration. Let me check your account details.' },
        { speaker: 'Customer', text: 'This is the third time this month. Your system is terrible!' },
        { speaker: 'Agent', text: 'I sincerely apologize for the inconvenience. Let me escalate this to our technical team.' }
    ];

    // Use current speaker selection or random
    let selectedSpeaker = state.currentSpeaker;
    if (state.autoSpeakerDetection) {
        const randomTranscript = sampleTranscripts[Math.floor(Math.random() * sampleTranscripts.length)];
        selectedSpeaker = randomTranscript.speaker;
    }
    
    const speakerTranscripts = sampleTranscripts.filter(t => t.speaker === selectedSpeaker);
    const randomTranscript = speakerTranscripts.length > 0 ? 
        speakerTranscripts[Math.floor(Math.random() * speakerTranscripts.length)] :
        sampleTranscripts[Math.floor(Math.random() * sampleTranscripts.length)];
    
    console.log('Selected speaker:', selectedSpeaker);
    console.log('Using transcript:', randomTranscript.text);
    
    socket.emit('newTranscript', {
        sessionId: state.sessionId,
        speaker: selectedSpeaker,
        text: randomTranscript.text,
        timestamp: new Date().toISOString()
    });
    
    // Auto-switch speaker for next time if manual mode
    if (!state.autoSpeakerDetection) {
        setTimeout(() => {
            const newSpeaker = state.currentSpeaker === 'Customer' ? 'Agent' : 'Customer';
            console.log('Auto-switching speaker from', state.currentSpeaker, 'to', newSpeaker);
            if (newSpeaker === 'Customer') {
                elements.speakerCustomer.checked = true;
            } else {
                elements.speakerAgent.checked = true;
            }
            state.currentSpeaker = newSpeaker;
            updateSpeakerIndicator();
        }, 1000);
    }
}

// Analytics
function updateAnalytics(data) {
    // Update sentiment
    if (data.sentiment) {
        elements.sentimentValue.textContent = data.sentiment.score;
        elements.sentimentIndicator.parentElement.className = 
            `analytics-card sentiment-card sentiment-${data.sentiment.category.toLowerCase()}`;
    }

    // Update call reason
    if (data.callReason) {
        elements.callReasonValue.textContent = data.callReason;
    }

    // Update escalation risk
    if (data.escalationRisk) {
        elements.escalationValue.textContent = `${data.escalationRisk.score}% ${data.escalationRisk.level}`;
        elements.escalationIndicator.parentElement.className = 
            `analytics-card escalation-card escalation-${data.escalationRisk.level.toLowerCase()}`;
    }

    // Update insights
    if (data.insights) {
        console.log('Received insights:', data.insights);
        updateInsights(data.insights);
    } else {
        console.log('No insights received in analytics update');
    }
}

function resetAnalytics() {
    elements.sentimentValue.textContent = '-';
    elements.callReasonValue.textContent = '-';
    elements.escalationValue.textContent = '-';
    
    elements.sentimentIndicator.parentElement.className = 'analytics-card sentiment-card';
    elements.escalationIndicator.parentElement.className = 'analytics-card escalation-card';
}

// Chat management
function sendChatMessage() {
    const message = elements.chatInput.value.trim();
    if (!message) return;

    if (!state.callActive) {
        showToast('Please start a call first', 'error');
        return;
    }

    addChatMessage(message, 'user');
    elements.chatInput.value = '';

    socket.emit('chatMessage', {
        sessionId: state.sessionId,
        message: message,
        context: (state.transcriptEntries || []).slice(-10) // Send last 10 transcript entries for context
    });
}

function addChatMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${sender}-message`;
    
    messageElement.innerHTML = `
        <div class="message-content">${message}</div>
    `;
    
    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    
    state.chatHistory.push({ message, sender, timestamp: new Date() });
}

// Insights
function updateInsights(insights) {
    elements.insights.innerHTML = '';
    
    if (!insights || insights.length === 0) {
        elements.insights.innerHTML = '<div class="insight-item"><div class="insight-type">No insights</div><div class="insight-content">Continue conversation to get insights</div></div>';
        return;
    }
    
    insights.forEach(insight => {
        const insightElement = document.createElement('div');
        insightElement.className = 'insight-item';
        
        // Handle both 'message' and 'content' properties for backward compatibility
        const content = insight.message || insight.content || 'No content available';
        const type = insight.type || 'info';
        
        insightElement.innerHTML = `
            <div class="insight-type">${type}</div>
            <div class="insight-content">${content}</div>
        `;
        
        elements.insights.appendChild(insightElement);
    });
}

// Context Panel Functions
function initializeContextPanel() {
    // Initialize context panel state
    if (elements.contextContent) {
        elements.contextContent.classList.remove('collapsed');
    }
    if (elements.contextToggleIcon) {
        elements.contextToggleIcon.textContent = '▼';
    }
    
    // Set default context values
    updateCallContext({
        duration: '-',
        caller: '-',
        sentiment: '-',
        reason: '-',
        risk: '-'
    });
}

function updateCallContext(context) {
    if (elements.contextDuration) elements.contextDuration.textContent = context.duration || '-';
    if (elements.contextCaller) elements.contextCaller.textContent = context.caller || '-';
    if (elements.contextSentiment) elements.contextSentiment.textContent = context.sentiment || '-';
    if (elements.contextReason) elements.contextReason.textContent = context.reason || '-';
    if (elements.contextRisk) elements.contextRisk.textContent = context.risk || '-';
}

function toggleContextPanel() {
    const isCollapsed = elements.contextContent.classList.contains('collapsed');
    
    if (isCollapsed) {
        elements.contextContent.classList.remove('collapsed');
        elements.contextToggleIcon.textContent = '▼';
    } else {
        elements.contextContent.classList.add('collapsed');
        elements.contextToggleIcon.textContent = '▶';
    }
}

function showContextPanel() {
    elements.contextPanel.classList.add('show');
}

function hideContextPanel() {
    elements.contextPanel.classList.remove('show');
}

function updateContextPanel(context) {
    // Update call duration
    if (context.startTime) {
        const duration = Math.floor((Date.now() - context.startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        elements.contextDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Update other context fields
    elements.contextCaller.textContent = context.caller || '-';
    elements.contextSentiment.textContent = context.sentiment || 'neutral';
    elements.contextReason.textContent = context.reason || 'unknown';
    elements.contextRisk.textContent = context.risk || 'low';
    
    // Update context colors based on sentiment and risk
    updateContextColors(context);
}

function updateContextColors(context) {
    // Update sentiment color
    const sentimentColors = {
        positive: '#28a745',
        negative: '#dc3545',
        neutral: '#6c757d'
    };
    elements.contextSentiment.style.color = sentimentColors[context.sentiment] || '#6c757d';
    
    // Update risk color
    const riskColors = {
        high: '#dc3545',
        medium: '#ffc107',
        low: '#28a745'
    };
    elements.contextRisk.style.color = riskColors[context.risk] || '#28a745';
}

// Suggestions Functions
function showSuggestionsPanel() {
    elements.suggestionsPanel.classList.add('show');
}

function hideSuggestionsPanel() {
    elements.suggestionsPanel.classList.remove('show');
}

function updateSuggestions(context) {
    const suggestions = generateSuggestions(context);
    state.currentSuggestions = suggestions;
    
    // Clear existing suggestions
    elements.suggestionsContent.innerHTML = '';
    
    // Add new suggestions
    suggestions.forEach((suggestion, index) => {
        const button = document.createElement('button');
        button.className = 'suggestion-button';
        button.dataset.suggestionIndex = index;
        button.innerHTML = `
            <span class="suggestion-icon">${suggestion.icon}</span>
            ${suggestion.text}
        `;
        elements.suggestionsContent.appendChild(button);
    });
    
    // Show suggestions panel if there are suggestions
    if (suggestions.length > 0) {
        showSuggestionsPanel();
    } else {
        hideSuggestionsPanel();
    }
}

function generateSuggestions(context) {
    const suggestions = [];
    
    // Sentiment-based suggestions
    if (context.sentiment === 'negative') {
        suggestions.push({
            icon: '😌',
            text: 'How can I help de-escalate this situation?',
            query: 'The customer seems frustrated. What are some de-escalation techniques I can use?'
        });
    }
    
    // Call reason-based suggestions
    if (context.reason === 'billing_inquiry') {
        suggestions.push({
            icon: '💰',
            text: 'Show billing options',
            query: 'What billing options and payment methods are available for this customer?'
        });
    } else if (context.reason === 'technical_support') {
        suggestions.push({
            icon: '🔧',
            text: 'Troubleshooting steps',
            query: 'What are the common troubleshooting steps for technical issues?'
        });
    }
    
    // Escalation risk-based suggestions
    if (context.risk === 'high') {
        suggestions.push({
            icon: '🚨',
            text: 'Escalation procedures',
            query: 'When should I escalate this call and what are the escalation procedures?'
        });
    }
    
    // Duration-based suggestions
    if (context.duration > 300) { // 5 minutes
        suggestions.push({
            icon: '📝',
            text: 'Summarize call',
            query: 'Can you provide a summary of this call so far?'
        });
    }
    
    // Always available suggestions
    suggestions.push({
        icon: '🎯',
        text: 'Next steps',
        query: 'What should be the next steps for this customer call?'
    });
    
    return suggestions;
}

function handleSuggestionClick(event) {
    const button = event.target.closest('.suggestion-button');
    if (!button) return;
    
    const suggestionIndex = parseInt(button.dataset.suggestionIndex);
    const suggestion = state.currentSuggestions[suggestionIndex];
    
    if (suggestion) {
        // Auto-populate chat input with suggestion query
        elements.chatInput.value = suggestion.query;
        
        // Optionally auto-send the message
        sendChatMessage();
    }
}

// Update the existing call start handler to show context
function enhanceCallStarted(data) {
    state.callContext.startTime = Date.now();
    state.callContext.caller = elements.callerId.value || 'Unknown';
    
    showContextPanel();
    updateContextPanel(state.callContext);
    updateSuggestions(state.callContext);
    
    // Start context update timer
    if (state.contextUpdateInterval) {
        clearInterval(state.contextUpdateInterval);
    }
    state.contextUpdateInterval = setInterval(() => {
        updateContextPanel(state.callContext);
    }, 1000);
}

// Update the existing call end handler to hide context
function enhanceCallEnded(data) {
    hideContextPanel();
    hideSuggestionsPanel();
    
    // Clear context update timer
    if (state.contextUpdateInterval) {
        clearInterval(state.contextUpdateInterval);
    }
    
    // Reset context
    state.callContext = {
        duration: 0,
        caller: '',
        sentiment: 'neutral',
        reason: 'unknown',
        risk: 'low',
        startTime: null
    };
}

// Update the existing analytics update handler
function enhanceAnalyticsUpdate(data) {
    // Update context with new analytics data
    if (data.sentiment) {
        state.callContext.sentiment = data.sentiment.category || 'neutral';
    }
    if (data.callReason) {
        state.callContext.reason = data.callReason;
    }
    if (data.escalationRisk) {
        state.callContext.risk = data.escalationRisk.level || 'low';
    }
    
    // Update displays
    updateContextPanel(state.callContext);
    updateSuggestions(state.callContext);
}

// Speaker Recognition Functions
function initializeSpeakerRecognition() {
    // Set initial speaker state and UI
    state.currentSpeaker = 'Agent';
    elements.speakerAgent.checked = true;
    elements.speakerCustomer.checked = false;
    updateSpeakerIndicator();
    
    // Auto-detection toggle
    elements.autoSpeakerDetection.addEventListener('change', (e) => {
        state.autoSpeakerDetection = e.target.checked;
        updateSpeakerControls();
        
        if (state.autoSpeakerDetection) {
            showToast('Auto speaker detection enabled', 'success');
        } else {
            showToast('Manual speaker assignment enabled', 'info');
        }
    });
    
    // Speaker assignment radio buttons
    const speakerRadios = document.querySelectorAll('input[name="currentSpeaker"]');
    speakerRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                state.currentSpeaker = e.target.value;
                state.lastSpeakerChange = new Date();
                updateSpeakerIndicator();
                
                // Log speaker change
                console.log(`Speaker changed to: ${state.currentSpeaker}`);
            }
        });
    });
    
    console.log('Speaker recognition initialized - default speaker:', state.currentSpeaker);
}

function updateSpeakerControls() {
    const speakerAssignment = document.querySelector('.speaker-assignment');
    if (state.autoSpeakerDetection) {
        speakerAssignment.style.opacity = '0.5';
        speakerAssignment.style.pointerEvents = 'none';
    } else {
        speakerAssignment.style.opacity = '1';
        speakerAssignment.style.pointerEvents = 'auto';
    }
}

function updateSpeakerIndicator() {
    // Update any visual indicators for current speaker
    console.log('updateSpeakerIndicator called - current speaker:', state.currentSpeaker);
    
    const customerBtn = elements.speakerCustomer?.nextElementSibling;
    const agentBtn = elements.speakerAgent?.nextElementSibling;
    
    if (customerBtn && agentBtn) {
        if (state.currentSpeaker === 'Customer') {
            customerBtn.classList.add('active');
            agentBtn.classList.remove('active');
            console.log('Set Customer as active');
        } else {
            agentBtn.classList.add('active');
            customerBtn.classList.remove('active');
            console.log('Set Agent as active');
        }
    } else {
        console.log('Speaker button elements not found');
    }
}

function detectSpeaker(audioData) {
    // Placeholder for advanced speaker detection
    // In a real implementation, this would use Azure Speaker Recognition
    // or voice activity detection algorithms
    
    if (!state.autoSpeakerDetection) {
        return state.currentSpeaker;
    }
    
    // Simple heuristic: alternate speakers based on silence gaps
    // This is a placeholder - real implementation would use proper speaker diarization
    const currentTime = new Date();
    const timeSinceLastChange = state.lastSpeakerChange ? 
        (currentTime - state.lastSpeakerChange) : 0;
    
    // If more than 2 seconds since last change, potentially switch speakers
    if (timeSinceLastChange > 2000) {
        // Simple alternating logic (placeholder)
        const newSpeaker = state.currentSpeaker === 'Customer' ? 'Agent' : 'Customer';
        
        // Only switch if we detect a significant change (placeholder logic)
        if (Math.random() > 0.7) { // 30% chance of speaker change
            state.currentSpeaker = newSpeaker;
            state.lastSpeakerChange = currentTime;
            
            // Update UI
            if (newSpeaker === 'Customer') {
                elements.speakerCustomer.checked = true;
            } else {
                elements.speakerAgent.checked = true;
            }
            
            updateSpeakerIndicator();
            console.log(`Auto-detected speaker change to: ${newSpeaker}`);
        }
    }
    
    return state.currentSpeaker;
}

function addSpeakerToHistory(speaker, text, timestamp) {
    state.speakerHistory.push({
        speaker: speaker,
        text: text,
        timestamp: timestamp,
        confidence: state.autoSpeakerDetection ? 0.7 : 1.0
    });
    
    // Keep only last 50 entries
    if (state.speakerHistory.length > 50) {
        state.speakerHistory.shift();
    }
}

function changeSpeakerForTranscript(transcriptId, newSpeaker) {
    // Find and update transcript entry
    const transcriptEntry = document.querySelector(`[data-transcript-id="${transcriptId}"]`);
    if (transcriptEntry) {
        // Update visual styling
        transcriptEntry.className = `transcript-entry transcript-${newSpeaker.toLowerCase()}`;
        
        // Update speaker label
        const speakerLabel = transcriptEntry.querySelector('.transcript-speaker');
        if (speakerLabel) {
            speakerLabel.textContent = `${newSpeaker}:`;
        }
        
        // Send update to server
        socket.emit('updateTranscriptSpeaker', {
            transcriptId: transcriptId,
            newSpeaker: newSpeaker,
            sessionId: state.sessionId
        });
        
        showToast(`Speaker changed to ${newSpeaker}`, 'success');
    }
}

// UI helpers
function updateConnectionStatus(status, type) {
    elements.connectionStatus.textContent = status;
    elements.connectionStatus.className = `badge bg-${type}`;
}

function showToast(message, type = 'info') {
    const toast = new bootstrap.Toast(elements.toast);
    const bgClass = type === 'error' ? 'bg-danger' : 
                   type === 'success' ? 'bg-success' : 
                   type === 'warning' ? 'bg-warning' : 'bg-info';
    
    elements.toast.querySelector('.toast-header').className = `toast-header ${bgClass} text-white`;
    elements.toastMessage.textContent = message;
    
    toast.show();
}

// Export for debugging
window.agentAssist = {
    state,
    socket,
    simulateTranscript,
    addTranscriptEntry,
    updateAnalytics,
    showToast
};
