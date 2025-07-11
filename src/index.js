#!/usr/bin/env node

/**
 * Real-Time Agent Assist Console Application
 * Main entry point for the console-based agent assist system
 */

require('dotenv').config({ path: '../.env' });

// Set log level to debug temporarily
process.env.LOG_LEVEL = 'debug';
process.env.CONSOLE_LOG_LEVEL = 'debug';
const chalk = require('chalk');
const AgentAssistConsole = require('./console/AgentAssistConsole');
const Logger = require('./utils/Logger');
const { validateEnvironment } = require('./utils/EnvValidator');

// Initialize logger
const logger = new Logger('Main');

// ASCII Art Banner
const banner = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║                    REALTIME AGENT ASSIST                     ║
║                                                               ║
║              🎤 Live Transcription & Analysis                 ║
║              🧠 AI-Powered Insights                           ║
║              📊 Real-time Sentiment Tracking                  ║
║              🤖 Intelligent Agent Support                     ║
║                                                               ║
║                         Version 1.0                          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function main() {
  try {
    // Display banner
    console.clear();
    console.log(chalk.cyan(banner));
    console.log(chalk.yellow('Initializing Real-Time Agent Assist System...'));
    console.log('');

    // Validate environment configuration
    logger.info('Validating environment configuration...');
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      logger.error('Environment validation failed:', envValidation.errors);
      process.exit(1);
    }
    logger.info('Environment validation passed');

    // Initialize the console application
    logger.info('Starting Agent Assist Console...');
    const consoleApp = new AgentAssistConsole();
    
    // Start the application
    await consoleApp.start();
    
    logger.info('Agent Assist Console started successfully');

  } catch (error) {
    logger.error('Failed to start Agent Assist Console:', error);
    console.error(chalk.red('❌ Failed to start application:'), error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  console.log(chalk.yellow('\n🔄 Shutting down Agent Assist Console...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  console.log(chalk.yellow('\n🔄 Shutting down Agent Assist Console...'));
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.error(chalk.red('❌ Unhandled Rejection:'), reason);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main();
}

module.exports = { main };
