const chalk = require('chalk');
const readline = require('readline');
const EventEmitter = require('events');
const Logger = require('../utils/Logger');
const TranscriptionService = require('../services/TranscriptionService');
const AnalyticsService = require('../services/AnalyticsService');
const ChatbotService = require('../services/ChatbotService');

class AgentAssistConsole extends EventEmitter {
  constructor() {
    super();
    this.logger = new Logger('Console');
    this.rl = null;
    this.services = {};
    this.isRunning = false;
    this.currentCall = null;
    this.transcriptHistory = [];
    this.sentimentHistory = [];
    this.callReasons = [];
    this.escalations = [];
  }

  async start() {
    try {
      this.logger.info('Starting Agent Assist Console...');
      
      // Initialize services
      await this.initializeServices();
      
      // Create console interface
      this.createInterface();
      
      // Start services
      await this.startServices();
      
      this.isRunning = true;
      this.logger.info('Agent Assist Console started successfully');
      
      // Show welcome message and start interactive prompt
      this.showWelcome();
      this.startInteractivePrompt();
      
    } catch (error) {
      this.logger.error('Failed to start console:', error);
      throw error;
    }
  }

  async initializeServices() {
    // Initialize Transcription Service with Azure OpenAI
    this.services.transcription = new TranscriptionService({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      realtimeDeployment: process.env.AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT,
      realtimeModel: process.env.AZURE_OPENAI_LLM_REALTIME_SPEECH_MODEL
    });

    // Initialize Analytics Service with Azure OpenAI GPT-4.1
    this.services.analytics = new AnalyticsService({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      deployment: process.env.AZURE_OPENAI_LLM_DEPLOYMENT
    });

    // Initialize Chatbot Service with Azure OpenAI GPT-4.1
    this.services.chatbot = new ChatbotService({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      deployment: process.env.AZURE_OPENAI_LLM_DEPLOYMENT
    });

    // Connect services
    this.connectServices();
  }

  connectServices() {
    // Connect transcription to analytics
    this.services.transcription.on('transcription', (transcript) => {
      this.handleTranscription(transcript);
    });

    // Connect analytics events
    this.services.analytics.on('sentimentAnalyzed', (sentiment) => {
      this.handleSentiment(sentiment);
    });

    this.services.analytics.on('callReasonDetected', (reason) => {
      this.handleCallReason(reason);
    });

    this.services.analytics.on('escalationRequired', (escalation) => {
      this.handleEscalation(escalation);
    });
  }

  createInterface() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  showWelcome() {
    console.log('\n' + chalk.green('🚀 Agent Assist Console Ready!'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.yellow('Available Commands:'));
    console.log(chalk.white('  simulate <text>  - Simulate customer/agent speech'));
    console.log(chalk.white('  test             - Run sentiment analysis test'));
    console.log(chalk.white('  escalation       - Test escalation detection'));
    console.log(chalk.white('  status           - Show service status'));
    console.log(chalk.white('  insights         - Show current insights'));
    console.log(chalk.white('  help             - Show this help'));
    console.log(chalk.white('  exit             - Exit application'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log('');
  }

  startInteractivePrompt() {
    this.rl.setPrompt(chalk.cyan('Agent Assist> '));
    this.rl.prompt();

    this.rl.on('line', async (input) => {
      await this.handleCommand(input.trim());
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      console.log(chalk.yellow('\n👋 Goodbye!'));
      process.exit(0);
    });
  }

  async handleCommand(input) {
    const [command, ...args] = input.split(' ');
    const text = args.join(' ');

    switch (command.toLowerCase()) {
      case 'simulate':
        if (text) {
          await this.simulateTranscript(text);
        } else {
          console.log(chalk.red('Usage: simulate <text>'));
        }
        break;

      case 'test':
        await this.runSentimentTest();
        break;

      case 'escalation':
        await this.testEscalation();
        break;

      case 'status':
        this.showStatus();
        break;

      case 'insights':
        this.showInsights();
        break;

      case 'help':
        this.showWelcome();
        break;

      case 'exit':
        this.rl.close();
        break;

      default:
        console.log(chalk.red(`Unknown command: ${command}`));
        console.log(chalk.yellow('Type "help" for available commands'));
    }
  }

  async simulateTranscript(text) {
    console.log(chalk.blue(`\n📝 Simulating: "${text}"`));
    
    const transcriptData = {
      text: text,
      timestamp: new Date().toISOString(),
      speaker: text.toLowerCase().includes('thank you for calling') ? 'Agent' : 'Customer',
      confidence: 0.95
    };

    await this.services.analytics.processTranscript(transcriptData);
  }

  async runSentimentTest() {
    console.log(chalk.blue('\n🧪 Running sentiment analysis test...'));
    
    const testPhrases = [
      "Thank you so much! You've been really helpful.",
      "I'm extremely frustrated with this service!",
      "Can you please check my account balance?",
      "This is unacceptable! I want to speak to a manager!"
    ];

    for (const phrase of testPhrases) {
      console.log(chalk.gray(`Testing: "${phrase}"`));
      const result = await this.services.analytics.analyzeSentiment(phrase);
      console.log(chalk.green(`Result: ${result.sentiment} (confidence: ${result.confidence})`));
    }
  }

  async testEscalation() {
    console.log(chalk.blue('\n⚠️ Testing escalation detection...'));
    
    const escalationPhrase = "This is terrible service! I want to speak to your manager right now!";
    console.log(chalk.gray(`Testing: "${escalationPhrase}"`));
    
    const result = await this.services.analytics.checkEscalation(escalationPhrase);
    console.log(chalk.green(`Escalation needed: ${result.shouldEscalate} (confidence: ${result.confidence})`));
    console.log(chalk.yellow(`Reasoning: ${result.reasoning}`));
  }

  showStatus() {
    console.log(chalk.blue('\n📊 Service Status:'));
    console.log(chalk.green(`  ✅ Transcription Service: ${this.services.transcription.isRunning ? 'Running' : 'Stopped'}`));
    console.log(chalk.green(`  ✅ Analytics Service: ${this.services.analytics.isRunning ? 'Running' : 'Stopped'}`));
    console.log(chalk.green(`  ✅ Chatbot Service: ${this.services.chatbot.isRunning ? 'Running' : 'Stopped'}`));
  }

  showInsights() {
    console.log(chalk.blue('\n💡 Current Insights:'));
    const insights = this.services.analytics.getInsights();
    console.log(chalk.yellow(`  Call Reasons: ${insights.callReasons.join(', ') || 'None detected'}`));
    console.log(chalk.yellow(`  Customer Mood: ${insights.currentMood}`));
    console.log(chalk.yellow(`  Recent Issues: ${insights.recentIssues.length} detected`));
    console.log(chalk.yellow(`  Call Summary: ${insights.callSummary || 'No summary available'}`));
  }

  handleTranscription(transcript) {
    this.transcriptHistory.push(transcript);
    console.log(chalk.magenta(`\n🎤 [${transcript.speaker}]: ${transcript.text}`));
  }

  handleSentiment(sentiment) {
    const color = sentiment.sentiment === 'positive' ? 'green' : 
                  sentiment.sentiment === 'negative' ? 'red' : 'yellow';
    console.log(chalk[color](`😊 Sentiment: ${sentiment.sentiment} (${sentiment.confidence})`));
  }

  handleCallReason(reason) {
    console.log(chalk.cyan(`📋 Call Reason: ${reason}`));
  }

  handleEscalation(escalation) {
    console.log(chalk.red(`🚨 ESCALATION REQUIRED!`));
    console.log(chalk.red(`   Reason: ${escalation.reasoning}`));
    console.log(chalk.red(`   Confidence: ${escalation.confidence}`));
  }

  async startServices() {
    // Start analytics and chatbot services (skip transcription for now)
    await this.services.analytics.start();
    await this.services.chatbot.start();
    
    // TODO: Enable transcription service when endpoint is fixed
    // await this.services.transcription.start();
    this.logger.info('Transcription service temporarily disabled - using simulation mode');
  }

  async stop() {
    this.logger.info('Stopping Agent Assist Console...');
    this.isRunning = false;
    
    if (this.rl) {
      this.rl.close();
    }
    
    // Stop all services
    for (const service of Object.values(this.services)) {
      if (service && typeof service.stop === 'function') {
        await service.stop();
      }
    }
    
    this.logger.info('Agent Assist Console stopped');
  }
}

module.exports = AgentAssistConsole;
