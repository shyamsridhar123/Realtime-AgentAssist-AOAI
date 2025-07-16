# Real-Time Agent Assist

A web-based agent assist tool for contact centers that integrates with Azure OpenAI services to provide real-time transcription analysis, sentiment monitoring, and agent support during customer calls.

## Components

- **Web Dashboard**: Browser interface for agents to monitor calls and interact with AI assistant
- **Backend Server**: Node.js/Express server handling WebSocket connections and Azure OpenAI API calls
- **Azure OpenAI Integration**: Processes transcript text for sentiment analysis and generates insights
- **Manual Transcription**: Text input system with speaker identification (Customer/Agent)

## Technologies

- **Frontend**: HTML, CSS, JavaScript with Bootstrap 5
- **Backend**: Node.js, Express.js, Socket.IO
- **AI Services**: Azure OpenAI API (GPT-4 model)
- **Communication**: WebSocket for real-time updates

## Setup

1. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your Azure OpenAI credentials
   ```

2. **Install Dependencies**
   ```bash
   npm install
   cd webapp && npm install
   ```

3. **Start the Application**
   ```bash
   # Start the web server
   cd webapp && node server.js
   ```
   
   The dashboard will be available at `http://localhost:3000`

## Features

- **Call Session Management**: Start/end call sessions with caller ID tracking
- **Manual Transcript Input**: Text entry with speaker assignment (Customer/Agent)
- **Sentiment Analysis**: Analyzes transcript text to determine customer sentiment
- **Call Reason Detection**: Identifies the primary reason for customer calls
- **Escalation Risk Assessment**: Evaluates conversation for potential escalation needs
- **Agent Chatbot**: AI assistant that can answer questions about the current call
- **Real-time Analytics**: Dashboard showing sentiment, call reason, and escalation risk
- **Smart Insights**: Contextual suggestions based on conversation analysis

## Environment Variables

Required Azure OpenAI configuration in `.env` file:
```
AZURE_OPENAI_ENDPOINT=your-openai-endpoint
AZURE_OPENAI_KEY=your-api-key
AZURE_OPENAI_API_VERSION=2024-02-01
AZURE_OPENAI_LLM_DEPLOYMENT=your-gpt4-deployment-name
```

Optional for advanced features:
```
AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT=your-realtime-deployment
AZURE_OPENAI_REALTIME_API_VERSION=2024-10-01-preview
```

## Usage

1. **Access Dashboard**: Open `http://localhost:3000` in your browser
2. **Agent Registration**: Enter agent name and ID, then click "Register Agent"
3. **Start Call Session**: Enter caller ID and click "Start Call"
4. **Add Transcript**: Use the "Simulate Transcript" button or manually enter conversation text
5. **Monitor Analytics**: View sentiment analysis, call reason, and escalation risk in real-time
6. **Use Agent Chatbot**: Ask questions about the current call context in the chatbot interface
7. **End Call**: Click "End Call" to complete the session and generate a summary

## Project Structure

```
realtime-agent-assist/
├── webapp/
│   ├── public/
│   │   ├── index.html         # Main dashboard interface
│   │   ├── styles.css         # Dashboard styling
│   │   └── app.js            # Frontend JavaScript
│   ├── server.js             # Express server and Socket.IO handlers
│   └── package.json          # Web app dependencies
├── src/
│   ├── services/             # Backend service modules
│   └── utils/               # Logging and utility functions
├── logs/                    # Application log files
└── README.md
```

## Current Limitations

- Transcript input is manual (no automatic speech recognition)
- Real-time audio processing requires additional Azure OpenAI Realtime Speech deployment
- Speaker detection is manual assignment only
- No persistent data storage (sessions are memory-only)

## License

MIT
