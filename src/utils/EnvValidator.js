const Logger = require('./Logger');

class EnvValidator {
  constructor() {
    this.logger = new Logger('EnvValidator');
    this.requiredVars = [
      'AZURE_OPENAI_ENDPOINT',
      'AZURE_OPENAI_KEY',
      'AZURE_OPENAI_API_VERSION',
      'AZURE_OPENAI_LLM_DEPLOYMENT',
      'AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT'
    ];
    
    this.optionalVars = [
      'AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT',
      'AZURE_SPEECH_ENDPOINT',
      'AZURE_SPEECH_KEY',
      'AZURE_SPEECH_REGION',
      'AZURE_SPEECH_VOICE',
      'LOG_LEVEL',
      'CONSOLE_LOG_LEVEL'
    ];
  }

  validateEnvironment() {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      config: {}
    };

    try {
      // Debug: Log all environment variables that start with AZURE_
      this.logger.debug('Environment variables loaded:');
      Object.keys(process.env)
        .filter(key => key.startsWith('AZURE_'))
        .forEach(key => {
          this.logger.debug(`  ${key}: ${process.env[key] ? '[SET]' : '[NOT SET]'}`);
        });

      // Check required variables
      for (const varName of this.requiredVars) {
        const value = process.env[varName];
        
        if (!value) {
          result.valid = false;
          result.errors.push(`Missing required environment variable: ${varName}`);
          this.logger.error(`Missing: ${varName}`);
        } else {
          result.config[varName] = this.maskSensitiveValue(varName, value);
          this.logger.debug(`Found: ${varName} = ${this.maskSensitiveValue(varName, value)}`);
          
          // Validate specific formats
          const validation = this.validateVarFormat(varName, value);
          if (!validation.valid) {
            result.valid = false;
            result.errors.push(`Invalid format for ${varName}: ${validation.error}`);
          }
        }
      }

      // Check optional variables
      for (const varName of this.optionalVars) {
        const value = process.env[varName];
        
        if (value) {
          result.config[varName] = this.maskSensitiveValue(varName, value);
          
          // Validate format if present
          const validation = this.validateVarFormat(varName, value);
          if (!validation.valid) {
            result.warnings.push(`Invalid format for optional ${varName}: ${validation.error}`);
          }
        } else {
          result.warnings.push(`Optional environment variable not set: ${varName}`);
        }
      }

      // Log validation results
      if (result.valid) {
        this.logger.info('Environment validation passed', {
          requiredVars: this.requiredVars.length,
          optionalVars: this.optionalVars.filter(v => process.env[v]).length,
          warnings: result.warnings.length
        });
      } else {
        this.logger.error('Environment validation failed', {
          errors: result.errors.length,
          warnings: result.warnings.length
        });
      }

      return result;

    } catch (error) {
      this.logger.error('Error during environment validation:', error);
      return {
        valid: false,
        errors: [`Environment validation error: ${error.message}`],
        warnings: [],
        config: {}
      };
    }
  }

  validateVarFormat(varName, value) {
    try {
      switch (varName) {
        case 'AZURE_OPENAI_ENDPOINT':
          return this.validateUrl(value);
        
        case 'AZURE_OPENAI_KEY':
          return this.validateAzureKey(value);
        
        case 'AZURE_OPENAI_API_VERSION':
          return this.validateApiVersion(value);
        
        case 'AZURE_OPENAI_LLM_DEPLOYMENT':
        case 'AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT':
        case 'AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT':
          return this.validateDeploymentName(value);
        
        case 'AZURE_SPEECH_ENDPOINT':
          return this.validateUrl(value);
        
        case 'AZURE_SPEECH_KEY':
          return this.validateAzureKey(value);
        
        case 'AZURE_SPEECH_REGION':
          return this.validateRegion(value);
        
        case 'LOG_LEVEL':
        case 'CONSOLE_LOG_LEVEL':
          return this.validateLogLevel(value);
        
        default:
          return { valid: true };
      }
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  validateAzureKey(key) {
    if (!key || key.length < 32) {
      return { valid: false, error: 'Azure key appears to be too short' };
    }
    
    if (!/^[a-zA-Z0-9]+$/.test(key)) {
      return { valid: false, error: 'Azure key contains invalid characters' };
    }
    
    return { valid: true };
  }

  validateApiVersion(version) {
    if (!/^\d{4}-\d{2}-\d{2}(-preview)?$/.test(version)) {
      return { valid: false, error: 'API version must be in format YYYY-MM-DD or YYYY-MM-DD-preview' };
    }
    
    return { valid: true };
  }

  validateDeploymentName(name) {
    if (!name || name.length < 1) {
      return { valid: false, error: 'Deployment name cannot be empty' };
    }
    
    if (!/^[a-zA-Z0-9-_.]+$/.test(name)) {
      return { valid: false, error: 'Deployment name contains invalid characters' };
    }
    
    return { valid: true };
  }

  validateRegion(region) {
    const validRegions = [
      'eastus', 'eastus2', 'westus', 'westus2', 'westus3',
      'centralus', 'northcentralus', 'southcentralus',
      'westcentralus', 'canadacentral', 'canadaeast',
      'brazilsouth', 'northeurope', 'westeurope',
      'uksouth', 'ukwest', 'francecentral', 'francesouth',
      'germanywestcentral', 'norwayeast', 'switzerlandnorth',
      'swedencentral', 'southafricanorth', 'uaenorth',
      'eastasia', 'southeastasia', 'australiaeast',
      'australiasoutheast', 'centralindia', 'southindia',
      'westindia', 'japaneast', 'japanwest', 'koreacentral',
      'koreasouth'
    ];
    
    if (!validRegions.includes(region.toLowerCase())) {
      return { valid: false, error: `Invalid Azure region: ${region}` };
    }
    
    return { valid: true };
  }

  validateLogLevel(level) {
    const validLevels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];
    
    if (!validLevels.includes(level.toLowerCase())) {
      return { valid: false, error: `Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}` };
    }
    
    return { valid: true };
  }

  maskSensitiveValue(varName, value) {
    const sensitiveVars = ['AZURE_OPENAI_KEY', 'AZURE_SPEECH_KEY'];
    
    if (sensitiveVars.includes(varName) && value.length > 8) {
      return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
    }
    
    return value;
  }

  getConfigSummary() {
    const validation = this.validateEnvironment();
    
    return {
      isValid: validation.valid,
      azureOpenAI: {
        endpoint: validation.config.AZURE_OPENAI_ENDPOINT,
        apiVersion: validation.config.AZURE_OPENAI_API_VERSION,
        llmDeployment: validation.config.AZURE_OPENAI_LLM_DEPLOYMENT,
        realtimeDeployment: validation.config.AZURE_OPENAI_LLM_REALTIME_SPEECH_DEPLOYMENT
      },
      azureSpeech: {
        endpoint: validation.config.AZURE_SPEECH_ENDPOINT,
        region: validation.config.AZURE_SPEECH_REGION,
        voice: validation.config.AZURE_SPEECH_VOICE
      },
      logging: {
        level: validation.config.LOG_LEVEL || 'info',
        consoleLevel: validation.config.CONSOLE_LOG_LEVEL || 'info'
      },
      errors: validation.errors,
      warnings: validation.warnings
    };
  }

  checkConnectivity() {
    // This would typically test actual connectivity to Azure services
    // For now, we'll just return a basic check
    return {
      azureOpenAI: 'Not tested',
      azureSpeech: 'Not tested',
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance and class
const envValidator = new EnvValidator();

module.exports = {
  validateEnvironment: () => envValidator.validateEnvironment(),
  getConfigSummary: () => envValidator.getConfigSummary(),
  checkConnectivity: () => envValidator.checkConnectivity(),
  EnvValidator
};
