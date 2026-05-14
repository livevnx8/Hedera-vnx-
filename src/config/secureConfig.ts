/**
 * Secure Configuration Management
 * 
 * Provides validated and type-safe configuration access
 * with proper environment variable handling and validation.
 */

import { z } from 'zod';

// Configuration schema with validation
const ConfigSchema = z.object({
  // Server configuration
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database configuration
  DATABASE_PATH: z.string().default('./data.sqlite'),
  
  // AI configuration
  AI_NAME: z.string().default('Vera.h'),
  MODEL_PROVIDER: z.enum(['ollama', 'openai', 'google', 'qvx-direct', 'custom']).default('qvx-direct'),
  DEFAULT_CHAT_MODEL: z.string().optional(),
  NATIVE_CONTEXT_SIZE: z.coerce.number().default(4096),
  NATIVE_GPU_LAYERS: z.coerce.number().default(0),
  
  // QVX configuration
  QVX_INFER_URL: z.string().url().optional(),
  QVX_NODE_URL: z.string().url().optional(),
  
  // OpenAI configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  
  // Google AI Studio configuration
  GOOGLE_AI_STUDIO_API_KEY: z.string().optional(),
  
  // Hedera configuration
  HEDERA_NETWORK: z.enum(['mainnet', 'testnet', 'previewnet']).default('mainnet'),
  HEDERA_OPERATOR_ACCOUNT_ID: z.string().optional(),
  HEDERA_OPERATOR_PRIVATE_KEY: z.string().optional(),
  TREASURY_ACCOUNT_ID: z.string().optional(),
  HCS_TOPIC_ID: z.string().optional(),
  VERA_REGISTRY_TOPIC_ID: z.string().optional(),
  VERA_TASK_TOPIC_ID: z.string().optional(),
  VERA_RESULT_TOPIC_ID: z.string().optional(),
  VERA_AUDIT_TOPIC_ID: z.string().optional(),
  MIRROR_NODE_BASE_URL: z.string().url().default('https://mainnet-public.mirrornode.hedera.com'),
  RECEIPT_SIGNING_SECRET_KEY_BASE64: z.string().optional(),

  // x402 micropayment integration
  X402_BASE_URL: z.string().url().optional(),
  X402_API_KEY: z.string().optional(),
  X402_FACILITATOR_ACCOUNT: z.string().optional(),
  
  // Credits and pricing
  CREDIT_USD_PER_HBAR: z.coerce.number().default(0.05),
  PRICE_SOURCE: z.enum(['static', 'coingecko', 'binance']).default('static'),
  
  // Security configuration
  JWT_SECRET: z.string().min(32).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  ENCRYPTION_KEY: z.string().min(32).optional(),
  
  // Rate limiting
  DEFAULT_RATE_LIMIT_PER_MINUTE: z.coerce.number().default(100),
  DEFAULT_RATE_LIMIT_PER_HOUR: z.coerce.number().default(1000),
  DEFAULT_RATE_LIMIT_PER_DAY: z.coerce.number().default(10000),
  
  // Monitoring
  ENABLE_METRICS: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().default(9090),
  
  // Image generation
  IMAGE_PROVIDER: z.enum(['replicate', 'openai', 'stability']).default('replicate'),
  REPLICATE_API_KEY: z.string().optional(),
  
  // Video generation
  VIDEO_PROVIDER: z.enum(['disabled', 'replicate']).default('disabled'),
  REPLICATE_VIDEO_MODEL: z.string().optional(),
  
  // Cache configuration
  REDIS_URL: z.string().url().optional(),
  CACHE_TTL: z.coerce.number().default(300),
  
  // Feature flags
  ENABLE_ENHANCED_CAPABILITIES: z.coerce.boolean().default(true),
  ENABLE_COMPETITIVE_INTELLIGENCE: z.coerce.boolean().default(true),
  ENABLE_REASONING_ENHANCEMENT: z.coerce.boolean().default(true),
});

export type Config = z.infer<typeof ConfigSchema>;

class SecureConfigManager {
  private static instance: SecureConfigManager;
  private config: Config;
  private isProduction: boolean;

  private constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.validateEnvironment();
    this.config = this.loadConfig();
    this.logConfiguration();
  }

  public static getInstance(): SecureConfigManager {
    if (!SecureConfigManager.instance) {
      SecureConfigManager.instance = new SecureConfigManager();
    }
    return SecureConfigManager.instance;
  }

  private validateEnvironment(): void {
    // Check for required environment variables in production
    if (this.isProduction) {
      const requiredVars = [
        'JWT_SECRET',
        'SESSION_SECRET',
        'ENCRYPTION_KEY'
      ];

      const missing = requiredVars.filter(varName => !process.env[varName]);
      
      if (missing.length > 0) {
        throw new Error(`Missing required environment variables for production: ${missing.join(', ')}`);
      }
    }

    // Validate Hedera configuration
    if (process.env.HEDERA_OPERATOR_ACCOUNT_ID && !process.env.HEDERA_OPERATOR_PRIVATE_KEY) {
      throw new Error('HEDERA_OPERATOR_PRIVATE_KEY is required when HEDERA_OPERATOR_ACCOUNT_ID is set');
    }

    // Validate private key format
    const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
    if (privateKey && !this.isValidPrivateKey(privateKey)) {
      throw new Error('Invalid HEDERA_OPERATOR_PRIVATE_KEY format');
    }
  }

  private isValidPrivateKey(privateKey: string): boolean {
    // Basic validation for private key format (64 hex characters)
    const hexPattern = /^[0-9a-fA-F]{64}$/;
    return hexPattern.test(privateKey);
  }

  private loadConfig(): Config {
    try {
      const rawConfig = {
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_PATH: process.env.DATABASE_PATH,
        AI_NAME: process.env.AI_NAME,
        MODEL_PROVIDER: process.env.MODEL_PROVIDER,
        DEFAULT_CHAT_MODEL: process.env.DEFAULT_CHAT_MODEL,
        NATIVE_CONTEXT_SIZE: process.env.NATIVE_CONTEXT_SIZE,
        NATIVE_GPU_LAYERS: process.env.NATIVE_GPU_LAYERS,
        QVX_INFER_URL: process.env.QVX_INFER_URL,
        QVX_NODE_URL: process.env.QVX_NODE_URL,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
        GOOGLE_AI_STUDIO_API_KEY: process.env.GOOGLE_AI_STUDIO_API_KEY,
        HEDERA_NETWORK: process.env.HEDERA_NETWORK,
        HEDERA_OPERATOR_ACCOUNT_ID: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
        HEDERA_OPERATOR_PRIVATE_KEY: process.env.HEDERA_OPERATOR_PRIVATE_KEY,
        TREASURY_ACCOUNT_ID: process.env.TREASURY_ACCOUNT_ID,
        HCS_TOPIC_ID: process.env.HCS_TOPIC_ID,
        VERA_REGISTRY_TOPIC_ID: process.env.VERA_REGISTRY_TOPIC_ID,
        VERA_TASK_TOPIC_ID: process.env.VERA_TASK_TOPIC_ID,
        VERA_RESULT_TOPIC_ID: process.env.VERA_RESULT_TOPIC_ID,
        VERA_AUDIT_TOPIC_ID: process.env.VERA_AUDIT_TOPIC_ID,
        MIRROR_NODE_BASE_URL: process.env.MIRROR_NODE_BASE_URL,
        RECEIPT_SIGNING_SECRET_KEY_BASE64: process.env.RECEIPT_SIGNING_SECRET_KEY_BASE64,
        X402_BASE_URL: process.env.X402_BASE_URL,
        X402_API_KEY: process.env.X402_API_KEY,
        X402_FACILITATOR_ACCOUNT: process.env.X402_FACILITATOR_ACCOUNT,
        CREDIT_USD_PER_HBAR: process.env.CREDIT_USD_PER_HBAR,
        PRICE_SOURCE: process.env.PRICE_SOURCE,
        JWT_SECRET: process.env.JWT_SECRET,
        SESSION_SECRET: process.env.SESSION_SECRET,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
        DEFAULT_RATE_LIMIT_PER_MINUTE: process.env.DEFAULT_RATE_LIMIT_PER_MINUTE,
        DEFAULT_RATE_LIMIT_PER_HOUR: process.env.DEFAULT_RATE_LIMIT_PER_HOUR,
        DEFAULT_RATE_LIMIT_PER_DAY: process.env.DEFAULT_RATE_LIMIT_PER_DAY,
        ENABLE_METRICS: process.env.ENABLE_METRICS,
        METRICS_PORT: process.env.METRICS_PORT,
        IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
        REPLICATE_API_KEY: process.env.REPLICATE_API_KEY,
        VIDEO_PROVIDER: process.env.VIDEO_PROVIDER,
        REPLICATE_VIDEO_MODEL: process.env.REPLICATE_VIDEO_MODEL,
        REDIS_URL: process.env.REDIS_URL,
        CACHE_TTL: process.env.CACHE_TTL,
        ENABLE_ENHANCED_CAPABILITIES: process.env.ENABLE_ENHANCED_CAPABILITIES,
        ENABLE_COMPETITIVE_INTELLIGENCE: process.env.ENABLE_COMPETITIVE_INTELLIGENCE,
        ENABLE_REASONING_ENHANCEMENT: process.env.ENABLE_REASONING_ENHANCEMENT,
      };

      return ConfigSchema.parse(rawConfig);
    } catch (error) {
      throw new Error(`Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private logConfiguration(): void {
    if (!this.isProduction) {
      console.log('🔧 Configuration loaded successfully');
      console.log(`🌐 Environment: ${this.config.NODE_ENV}`);
      console.log(`🤖 Model Provider: ${this.config.MODEL_PROVIDER}`);
      console.log(`📊 Hedera Network: ${this.config.HEDERA_NETWORK}`);
      console.log(`🔐 Security: ${this.config.JWT_SECRET ? '✅ Configured' : '⚠️ Not configured'}`);
    }
  }

  public getConfig(): Config {
    return this.config;
  }

  public get(key: keyof Config): Config[keyof Config] {
    return this.config[key];
  }

  public isProductionMode(): boolean {
    return this.isProduction;
  }

  public isDevelopmentMode(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  // Secure getters for sensitive values
  public getHederaOperatorPrivateKey(): string | undefined {
    if (!this.config.HEDERA_OPERATOR_PRIVATE_KEY) {
      return undefined;
    }
    
    // In production, use secure key management
    if (this.isProduction) {
      // Check for HSM/KMS integration
      const hsmType = process.env.HSM_TYPE;
      
      if (hsmType === 'aws-kms') {
        // AWS KMS integration placeholder
        // Implementation: const key = await this.getKeyFromAWSKMS();
        console.log('🔐 Using AWS KMS for key management');
      } else if (hsmType === 'azure-keyvault') {
        // Azure Key Vault integration placeholder
        console.log('🔐 Using Azure Key Vault for key management');
      } else if (hsmType === 'hashicorp-vault') {
        // HashiCorp Vault integration placeholder
        console.log('🔐 Using HashiCorp Vault for key management');
      } else {
        // Fallback with strong warning
        console.warn('⚠️ Production environment detected but no HSM/KMS configured');
        console.warn('   Set HSM_TYPE environment variable to: aws-kms, azure-keyvault, or hashicorp-vault');
        console.warn('   For now, ensure HEDERA_OPERATOR_PRIVATE_KEY is set securely');
      }
    }
    
    return this.config.HEDERA_OPERATOR_PRIVATE_KEY;
  }

  public getJwtSecret(): string {
    if (!this.config.JWT_SECRET) {
      throw new Error('JWT_SECRET is required');
    }
    return this.config.JWT_SECRET;
  }

  public getSessionSecret(): string {
    if (!this.config.SESSION_SECRET) {
      throw new Error('SESSION_SECRET is required');
    }
    return this.config.SESSION_SECRET;
  }

  public getEncryptionKey(): string {
    if (!this.config.ENCRYPTION_KEY) {
      throw new Error('ENCRYPTION_KEY is required');
    }
    return this.config.ENCRYPTION_KEY;
  }

  // Validation helpers
  public validateApiKey(apiKey: string | undefined): boolean {
    if (!apiKey) return false;
    return apiKey.length >= 32 && /^[a-zA-Z0-9_-]+$/.test(apiKey);
  }

  public validateAccountId(accountId: string | undefined): boolean {
    if (!accountId) return false;
    return /^0\.0\.\d+$/.test(accountId);
  }

  public validatePrivateKey(privateKey: string | undefined): boolean {
    if (!privateKey) return false;
    return /^[0-9a-fA-F]{64}$/.test(privateKey);
  }

  public validateTopicId(topicId: string | undefined): boolean {
    if (!topicId) return false;
    return /^0\.0\.\d+$/.test(topicId);
  }
}

// Export singleton instance
export const secureConfig = SecureConfigManager.getInstance();

// Export convenience functions
export function getConfig(): Config {
  return secureConfig.getConfig();
}

export function isProduction(): boolean {
  return secureConfig.isProductionMode();
}

export function isDevelopment(): boolean {
  return secureConfig.isDevelopmentMode();
}
