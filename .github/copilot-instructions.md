# Agent Assist Copilot Instructions

## Architecture Overview

This is a **dual-mode contact center agent assist system** with two main entry points:
- **Console Mode**: Terminal-based interface (`src/index.js`) with blessed UI components
- **Web Mode**: Browser dashboard (`webapp/server.js`) with Socket.IO real-time communication

### Core Components

1. **AgentAssistWebApp** (`webapp/server.js`): Express + Socket.IO server handling web dashboard
2. **AgentAssistConsole** (`src/console/`): Terminal UI using blessed library
3. **Service Layer** (`src/services/`): Shared business logic (Analytics, Audio, Chatbot, Transcription)
4. **Logger** (`src/utils/Logger.js`): Winston-based logging with file rotation

## Development Patterns

### Socket.IO Event Flow
The webapp uses specific event patterns - always follow these conventions:
```javascript
// Server-side event handlers in webapp/server.js
socket.on('registerAgent', (agentData) => { ... });
socket.on('startCall', async (callData) => { ... });
socket.on('newTranscript', async (data) => { ... });
socket.emit('analyticsUpdate', { sentiment, callReason, escalationRisk, insights });
```

### Azure OpenAI Integration
- Use `AzureOpenAI` class from `openai` package (not `@azure/openai`)
- Services expect config object with `{ endpoint, apiKey, apiVersion, deployment }`
- **Real-time Speech**: Optional feature requiring `AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT`
- **Fallback Pattern**: Always handle missing realtime deployment gracefully

### Logger Usage
```javascript
const Logger = require('../src/utils/Logger');
const logger = new Logger('ServiceName');
logger.info('Message');  // Use logger.info, not console.log
```

### Session Management
- Active calls stored in `Map` objects: `activeCalls`, `activeAgents`, `realtimeConnections`
- Session IDs format: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
- Manual cleanup required on disconnect/endCall

## Key Files and Responsibilities

- `webapp/server.js`: Main web server, Socket.IO handlers, Azure OpenAI integration
- `webapp/public/app.js`: Frontend Socket.IO client, DOM manipulation, state management
- `src/services/AnalyticsService.js`: Sentiment analysis, call reason detection, escalation monitoring
- `src/utils/Logger.js`: Centralized logging configuration
- `src/utils/EnvValidator.js`: Environment variable validation

## Development Workflow

### Running the System
```bash
# Web dashboard (primary mode)
cd webapp && node server.js

# Console mode (alternative)
npm start  # or node src/index.js
```

### Environment Setup
Required variables in `.env`:
```bash
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your-api-key
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4-deployment-name
```

### Frontend-Backend Communication
- Frontend state in `webapp/public/app.js` uses `elements` object for DOM references
- Real-time updates via Socket.IO events (not HTTP requests)
- Bootstrap 5 grid system: `col-md-3` (left), `col-md-6` (middle), `col-md-3` (right)

## Critical Integration Points

### Azure OpenAI Service Calls
Services use async/await pattern with try-catch error handling:
```javascript
const response = await this.azureOpenAI.chat.completions.create({
  model: process.env.AZURE_OPENAI_LLM_DEPLOYMENT,
  messages: [{ role: 'system', content: '...' }],
  max_tokens: 150,
  temperature: 0.3
});
```

### Speaker Detection
- Manual assignment via radio buttons (Customer/Agent)
- Auto-detection available but requires additional setup
- Transcript entries have `speaker` field and optional `manuallyAssigned` flag

### Error Handling
- Services extend `EventEmitter` for async error propagation
- Socket.IO errors sent via `socket.emit('error', { message })`
- Winston logger handles both console and file output

## Common Tasks

**Adding new Socket.IO events**: Add handler in `webapp/server.js` setupSocketHandlers() method
**Modifying analytics**: Edit `src/services/AnalyticsService.js` and update prompt templates
**UI changes**: Bootstrap 5 classes in `webapp/public/index.html`, custom CSS in `styles.css`
**Adding insights**: Modify `generateInsights()` method in webapp/server.js
**Logging**: Use Logger instance, not console.log - logs go to `logs/` directory
