const winston = require('winston');
const path = require('path');

class Logger {
  constructor(service = 'AgentAssist') {
    this.service = service;
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ level, message, timestamp, service, stack }) => {
          const serviceName = service || this.service;
          const logMessage = `${timestamp} [${level.toUpperCase()}] [${serviceName}] ${message}`;
          return stack ? `${logMessage}\n${stack}` : logMessage;
        })
      ),
      transports: [
        // Console transport
        new winston.transports.Console({
          level: process.env.CONSOLE_LOG_LEVEL || 'info',
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({
              format: 'HH:mm:ss'
            }),
            winston.format.printf(({ level, message, timestamp, service }) => {
              const serviceName = service || this.service;
              return `${timestamp} [${level}] [${serviceName}] ${message}`;
            })
          )
        }),
        // File transport for all logs
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'agent-assist.log'),
          maxsize: 10485760, // 10MB
          maxFiles: 5,
          tailable: true
        }),
        // Error log file
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'agent-assist-error.log'),
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 5,
          tailable: true
        })
      ]
    });

    // Create logs directory if it doesn't exist
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    const fs = require('fs');
    const logDir = path.join(process.cwd(), 'logs');
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  info(message, meta = {}) {
    this.logger.info(message, { service: this.service, ...meta });
  }

  warn(message, meta = {}) {
    this.logger.warn(message, { service: this.service, ...meta });
  }

  error(message, error = null, meta = {}) {
    if (error instanceof Error) {
      this.logger.error(message, { 
        service: this.service, 
        error: error.message, 
        stack: error.stack,
        ...meta 
      });
    } else {
      this.logger.error(message, { service: this.service, ...meta });
    }
  }

  debug(message, meta = {}) {
    this.logger.debug(message, { service: this.service, ...meta });
  }

  verbose(message, meta = {}) {
    this.logger.verbose(message, { service: this.service, ...meta });
  }

  silly(message, meta = {}) {
    this.logger.silly(message, { service: this.service, ...meta });
  }

  // Performance logging
  startTimer(label) {
    const timer = {
      label,
      startTime: Date.now(),
      service: this.service
    };
    
    timer.end = () => {
      const duration = Date.now() - timer.startTime;
      this.info(`${label} completed in ${duration}ms`, { 
        performance: true, 
        duration,
        service: this.service 
      });
      return duration;
    };
    
    return timer;
  }

  // Log with custom service name
  withService(serviceName) {
    return new Logger(serviceName);
  }

  // Log application events
  logEvent(eventType, eventData = {}) {
    this.info(`Event: ${eventType}`, {
      event: true,
      eventType,
      eventData,
      service: this.service
    });
  }

  // Log API calls
  logApiCall(method, url, statusCode, duration, meta = {}) {
    const level = statusCode >= 400 ? 'error' : 'info';
    this.logger[level](`API ${method} ${url} - ${statusCode}`, {
      api: true,
      method,
      url,
      statusCode,
      duration,
      service: this.service,
      ...meta
    });
  }

  // Log transcription events
  logTranscription(speaker, text, confidence, meta = {}) {
    this.info(`Transcription: [${speaker}] ${text}`, {
      transcription: true,
      speaker,
      text,
      confidence,
      service: this.service,
      ...meta
    });
  }

  // Log sentiment analysis
  logSentiment(speaker, sentiment, score, meta = {}) {
    this.info(`Sentiment: [${speaker}] ${sentiment} (${score})`, {
      sentiment: true,
      speaker,
      sentiment,
      score,
      service: this.service,
      ...meta
    });
  }

  // Log escalation events
  logEscalation(type, reason, severity, meta = {}) {
    this.warn(`Escalation: ${type} - ${reason} (${severity})`, {
      escalation: true,
      type,
      reason,
      severity,
      service: this.service,
      ...meta
    });
  }

  // Log chatbot interactions
  logChatbot(query, response, duration, meta = {}) {
    this.info(`Chatbot: Q="${query}" A="${response.substring(0, 100)}..."`, {
      chatbot: true,
      query,
      response,
      duration,
      service: this.service,
      ...meta
    });
  }

  // Get current log level
  getLevel() {
    return this.logger.level;
  }

  // Set log level
  setLevel(level) {
    this.logger.level = level;
    this.info(`Log level changed to: ${level}`);
  }

  // Flush logs (useful for testing)
  async flush() {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
}

module.exports = Logger;
