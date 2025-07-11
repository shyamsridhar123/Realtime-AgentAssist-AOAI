# Real-Time Agent Assist Solution

A contact center agent assist solution built with Azure OpenAI services. Provides real-time transcription, sentiment analysis, call analytics, and agent support features.

## Components

- **Web Dashboard**: Browser-based interface for agents
- **Console Interface**: Terminal-based agent assist tool
- **Backend Services**: Node.js server with Socket.IO for real-time communication
- **Azure OpenAI Integration**: Uses Azure OpenAI for transcription and analytics
- **Speaker Recognition**: Manual and automatic speaker detection

## Technologies

- **Frontend**: HTML, CSS, JavaScript, Bootstrap
- **Backend**: Node.js, Express, Socket.IO
- **AI Services**: Azure OpenAI (GPT-4, Realtime Speech)
- **Real-time**: WebSocket connections for live updates

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

3. **Start Services**
   ```bash
   # Terminal interface
   npm start
   
   # Web dashboard
   cd webapp && node server.js
   ```

## Features

- Real-time audio transcription with speaker identification
- Sentiment analysis and call reason detection
- Escalation risk monitoring
- Agent chatbot for call assistance
- Context-aware suggestions
- Call analytics and insights

## Environment Variables

Required Azure OpenAI configuration:
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_KEY`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_LLM_DEPLOYMENT`
- `AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT`

See `.env.example` for complete configuration.

## Usage

1. **Web Interface**: Navigate to `http://localhost:3000`
2. **Register Agent**: Enter agent name and ID
3. **Start Call**: Input caller ID and start session
4. **Simulate Transcript**: Use simulate button for testing
5. **Monitor Analytics**: View real-time sentiment and escalation data

## File Structure

```
├── src/                    # Core services
│   ├── console/           # Terminal interface
│   ├── services/          # AI and transcription services
│   └── utils/             # Utilities and logging
├── webapp/                # Web dashboard
│   ├── public/           # Frontend assets
│   └── server.js         # Express server
└── logs/                 # Application logs
```

## License

MIT
