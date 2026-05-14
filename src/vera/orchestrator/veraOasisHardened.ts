/**
 * VeraOasis Hardened - Production-Grade Thinking Engine
 * 
 * Security & Reliability Enhancements:
 * - Rate limiting with token bucket algorithm
 * - Circuit breaker for LLM failures
 * - Input validation & sanitization
 * - Resource quotas and memory limits
 * - Comprehensive audit logging
 * - Graceful degradation chains
 * - Health checks & metrics
 * - DDOS protection
 * 
 * @module vera/orchestrator/veraOasisHardened
 */

import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { sovereignLlmRouter } from '../../llm/sovereignRouter.js';
import { centerConsciousness, ThoughtType, ConsciousnessRequest } from './centerConsciousnessRouter.js';
import { flowerOfLifeOS } from './flowerOfLifeOS.js';

// ─── Security & Rate Limiting Types ─────────────────────────────────────────

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  burstAllowance: number;
  cooldownMs: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxCalls: number;
}

interface ResourceQuota {
  maxConcurrentRequests: number;
  maxMemoryMb: number;
  maxThinkingTimeMs: number;
  maxOutputLength: number;
}

interface SecurityConfig {
  maxInputLength: number;
  forbiddenPatterns: RegExp[];
  requireAuthentication: boolean;
  allowedOrigins: string[];
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  checks: {
    llm: boolean;
    memory: boolean;
    hcs: boolean;
    rateLimit: boolean;
  };
  metrics: {
    requestsPerMinute: number;
    averageLatency: number;
    errorRate: number;
    circuitBreakerState: string;
  };
}

// ─── Rate Limiter (Token Bucket) ────────────────────────────────────────────

class TokenBucketRateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Cleanup old buckets every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  checkLimit(key: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.config.burstAllowance, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time passed (per minute rate)
    const minutesPassed = (now - bucket.lastRefill) / 60000;
    const tokensToAdd = minutesPassed * this.config.maxRequestsPerMinute;
    bucket.tokens = Math.min(this.config.burstAllowance, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if request allowed
    const allowed = bucket.tokens >= 1;
    if (allowed) {
      bucket.tokens -= 1;
    }

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetTime: now + (60000 / this.config.maxRequestsPerMinute) * (1 - bucket.tokens % 1),
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}

// ─── Circuit Breaker ───────────────────────────────────────────────────────

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>, fallback: () => T): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeoutMs) {
        this.state = 'half-open';
        this.halfOpenCalls = 0;
        logger.info('CircuitBreaker', { message: 'Entering half-open state' });
      } else {
        logger.warn('CircuitBreaker', { message: 'Circuit open, using fallback' });
        return fallback();
      }
    }

    if (this.state === 'half-open' && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      logger.warn('CircuitBreaker', { message: 'Half-open limit reached, using fallback' });
      return fallback();
    }

    if (this.state === 'half-open') {
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      return fallback();
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.halfOpenCalls = 0;
      logger.info('CircuitBreaker', { message: 'Circuit closed - service recovered' });
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      logger.error('CircuitBreaker', {
        message: 'Circuit opened - too many failures',
        failureCount: this.failureCount,
      });
    }
  }

  getState(): string {
    return this.state;
  }
}

// ─── Input Sanitizer ───────────────────────────────────────────────────────

class InputSanitizer {
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  sanitize(input: string): { valid: boolean; sanitized: string; errors: string[] } {
    const errors: string[] = [];

    // Check length
    if (input.length > this.config.maxInputLength) {
      errors.push(`Input exceeds maximum length of ${this.config.maxInputLength}`);
      return { valid: false, sanitized: '', errors };
    }

    // Check for empty/null
    if (!input || input.trim().length === 0) {
      errors.push('Input cannot be empty');
      return { valid: false, sanitized: '', errors };
    }

    // Check forbidden patterns
    for (const pattern of this.config.forbiddenPatterns) {
      if (pattern.test(input)) {
        errors.push('Input contains forbidden patterns');
        logger.warn('InputSanitizer', {
          message: 'Forbidden pattern detected',
          pattern: pattern.toString(),
        });
        return { valid: false, sanitized: '', errors };
      }
    }

    // Sanitize: remove control characters, normalize whitespace
    let sanitized = input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Prevent prompt injection attempts
    sanitized = this.preventPromptInjection(sanitized);

    return { valid: true, sanitized, errors };
  }

  private preventPromptInjection(input: string): string {
    // Remove common prompt injection patterns
    const injectionPatterns = [
      /system:\s*override/i,
      /ignore\s+previous\s+instructions/i,
      /you\s+are\s+now/i,
      /new\s+role:/i,
      /DAN\s*mode/i,
      /jailbreak/i,
    ];

    let cleaned = input;
    for (const pattern of injectionPatterns) {
      cleaned = cleaned.replace(pattern, '[REMOVED]');
    }

    return cleaned;
  }
}

// ─── Resource Monitor ───────────────────────────────────────────────────────

class ResourceMonitor {
  private activeRequests = 0;
  private memoryUsage = 0;
  private quota: ResourceQuota;

  constructor(quota: ResourceQuota) {
    this.quota = quota;
    // Monitor memory every 10 seconds
    setInterval(() => this.checkMemory(), 10000);
  }

  acquireSlot(): { allowed: boolean; reason?: string } {
    if (this.activeRequests >= this.quota.maxConcurrentRequests) {
      return { allowed: false, reason: 'Too many concurrent requests' };
    }

    if (this.memoryUsage > this.quota.maxMemoryMb) {
      return { allowed: false, reason: 'Memory quota exceeded' };
    }

    this.activeRequests++;
    return { allowed: true };
  }

  releaseSlot(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  private checkMemory(): void {
    const used = process.memoryUsage();
    this.memoryUsage = Math.round(used.heapUsed / 1024 / 1024);
  }

  getStatus(): { activeRequests: number; memoryUsage: number; quota: ResourceQuota } {
    return {
      activeRequests: this.activeRequests,
      memoryUsage: this.memoryUsage,
      quota: this.quota,
    };
  }
}

// ─── Simple Metrics Tracker ────────────────────────────────────────────────

class SimpleMetrics {
  private data: Map<string, number[]> = new Map();

  record(name: string, value: number): void {
    if (!this.data.has(name)) {
      this.data.set(name, []);
    }
    this.data.get(name)!.push(value);
    
    // Keep last 100 values
    if (this.data.get(name)!.length > 100) {
      this.data.get(name)!.shift();
    }
  }

  getRate(name: string): number {
    const values = this.data.get(name);
    if (!values || values.length < 2) return 0;
    
    const recent = values.slice(-10);
    const sum = recent.reduce((a, b) => a + b, 0);
    return sum / recent.length;
  }

  getAverage(name: string): number {
    const values = this.data.get(name);
    if (!values || values.length === 0) return 0;
    
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  getErrorRate(): number {
    const successes = this.data.get('oasis_think_success')?.length || 0;
    const failures = this.data.get('oasis_think_failure')?.length || 0;
    const total = successes + failures;
    
    return total === 0 ? 0 : failures / total;
  }
}

// ─── Audit Logger ───────────────────────────────────────────────────────────

class AuditLogger {
  private auditBuffer: any[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor() {
    // Flush to HCS every 30 seconds
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }

  log(event: {
    requestId: string;
    userId: string;
    action: string;
    input?: string;
    output?: string;
    metadata?: any;
    timestamp: number;
  }): void {
    this.auditBuffer.push(event);

    // Also log immediately for critical events
    logger.info('VeraOasisAudit', {
      requestId: event.requestId,
      userId: event.userId,
      action: event.action,
      timestamp: event.timestamp,
    });
  }

  private async flush(): Promise<void> {
    if (this.auditBuffer.length === 0) return;

    const batch = this.auditBuffer.splice(0, 100); // Batch size limit

    try {
      const { hcsDomainLogger } = await import('../logging/hcsDomainLogger.js');
      
      for (const event of batch) {
        await hcsDomainLogger.logEvent('auditTopicId', {
          type: 'oasis_audit',
          ...event,
          input: event.input?.substring(0, 500), // Truncate
          output: event.output?.substring(0, 500),
        });
      }
    } catch (error) {
      logger.error('AuditLogger', {
        message: 'Failed to flush audit log',
        error: error instanceof Error ? error.message : String(error),
      });
      // Re-add to buffer for retry
      this.auditBuffer.unshift(...batch);
    }
  }

  stop(): void {
    clearInterval(this.flushInterval);
    this.flush(); // Final flush
  }
}

// ─── Hardened VeraOasis Engine ──────────────────────────────────────────────

export class HardenedVeraOasis extends EventEmitter {
  // Security components
  private rateLimiter: TokenBucketRateLimiter;
  private circuitBreaker: CircuitBreaker;
  private inputSanitizer: InputSanitizer;
  private resourceMonitor: ResourceMonitor;
  private auditLogger: AuditLogger;
  private metrics: SimpleMetrics;

  // Configuration
  private config: {
    rateLimit: RateLimitConfig;
    circuitBreaker: CircuitBreakerConfig;
    quota: ResourceQuota;
    security: SecurityConfig;
  };

  constructor() {
    super();

    // Default hardened configuration
    this.config = {
      rateLimit: {
        maxRequestsPerMinute: 30,
        maxRequestsPerHour: 500,
        burstAllowance: 10,
        cooldownMs: 1000,
      },
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeoutMs: 30000,
        halfOpenMaxCalls: 3,
      },
      quota: {
        maxConcurrentRequests: 20,
        maxMemoryMb: 2048,
        maxThinkingTimeMs: 30000,
        maxOutputLength: 10000,
      },
      security: {
        maxInputLength: 10000,
        forbiddenPatterns: [
          /[<>]/g, // No HTML tags
          /javascript:/gi, // No JS protocols
          /data:/gi, // No data URIs
        ],
        requireAuthentication: false,
        allowedOrigins: ['*'],
      },
    };

    // Initialize security components
    this.rateLimiter = new TokenBucketRateLimiter(this.config.rateLimit);
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
    this.inputSanitizer = new InputSanitizer(this.config.security);
    this.resourceMonitor = new ResourceMonitor(this.config.quota);
    this.auditLogger = new AuditLogger();
    this.metrics = new SimpleMetrics();
  }

  /**
   * Hardened think method with full security pipeline
   */
  async think(userInput: string, context: any, userId: string = 'anonymous'): Promise<any> {
    const requestId = `oasis-hardened-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Stage 1: Rate limiting
      const rateCheck = this.rateLimiter.checkLimit(userId);
      if (!rateCheck.allowed) {
        this.emit('rate_limited', { userId, requestId });
        throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetTime - Date.now()) / 1000)}s`);
      }

      // Stage 2: Resource quota check
      const resourceCheck = this.resourceMonitor.acquireSlot();
      if (!resourceCheck.allowed) {
        throw new Error(`Resource quota exceeded: ${resourceCheck.reason}`);
      }

      // Stage 3: Input sanitization
      const sanitization = this.inputSanitizer.sanitize(userInput);
      if (!sanitization.valid) {
        this.auditLogger.log({
          requestId,
          userId,
          action: 'input_rejected',
          input: userInput,
          metadata: { errors: sanitization.errors },
          timestamp: Date.now(),
        });
        throw new Error(`Input validation failed: ${sanitization.errors.join(', ')}`);
      }

      const cleanInput = sanitization.sanitized;

      // Stage 4: Circuit breaker protected execution
      const result = await this.circuitBreaker.execute(
        async () => {
          // Import and use the original VeraOasis
          const { veraOasis } = await import('./veraOasisThinking.js');
          
          // Add timeout protection
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Thinking timeout')), this.config.quota.maxThinkingTimeMs);
          });

          const thinkPromise = veraOasis.think(cleanInput, context);

          return await Promise.race([thinkPromise, timeoutPromise]);
        },
        () => this.generateGracefulFallback(cleanInput, context)
      );

      // Stage 5: Output validation
      if (result.finalOutput && result.finalOutput.length > this.config.quota.maxOutputLength) {
        result.finalOutput = result.finalOutput.substring(0, this.config.quota.maxOutputLength) + '... [truncated]';
      }

      // Stage 6: Audit logging
      this.auditLogger.log({
        requestId,
        userId,
        action: 'think_complete',
        input: cleanInput,
        output: result.finalOutput,
        metadata: {
          requestType: result.requestType,
          confidence: result.metadata?.confidence,
          duration: Date.now() - startTime,
          circuitBreakerState: this.circuitBreaker.getState(),
        },
        timestamp: Date.now(),
      });

      // Stage 7: Metrics
      this.metrics.record('oasis_think_duration', Date.now() - startTime);
      this.metrics.record('oasis_think_success', 1);

      this.emit('think_complete', { requestId, userId, duration: Date.now() - startTime });

      return {
        ...result,
        requestId,
        security: {
          sanitized: cleanInput !== userInput,
          rateLimited: false,
          circuitBreakerState: this.circuitBreaker.getState(),
        },
      };

    } catch (error) {
      // Log failure
      this.auditLogger.log({
        requestId,
        userId,
        action: 'think_failed',
        input: userInput,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
        timestamp: Date.now(),
      });

      this.metrics.record('oasis_think_failure', 1);
      this.emit('think_failed', { requestId, userId, error });

      throw error;

    } finally {
      this.resourceMonitor.releaseSlot();
    }
  }

  /**
   * Generate graceful fallback when LLM fails
   */
  private generateGracefulFallback(input: string, context: any): any {
    logger.warn('HardenedVeraOasis', {
      message: 'Generating graceful fallback due to circuit breaker',
      input: input.substring(0, 100),
    });

    return {
      requestId: `fallback-${Date.now()}`,
      requestType: 'chat',
      userInput: input,
      steps: [],
      finalOutput: this.getContextualFallback(input),
      thinkingTrace: '[Circuit breaker active - using degraded mode]',
      metadata: {
        totalDuration: 0,
        centerPulses: 0,
        pathTaken: ['fallback'],
        energyConsumed: 0,
        confidence: 0.3,
      },
      sovereignty: {
        sovereign: true,
        provider: 'cache',
        model: 'fallback',
        complexityScore: 0.1,
        routingReason: 'Circuit breaker fallback - LLM unavailable',
      },
    };
  }

  /**
   * Contextual fallback responses
   */
  private getContextualFallback(input: string): string {
    const lower = input.toLowerCase();

    if (lower.match(/\b(hello|hi|hey)\b/)) {
      return "Hello! I'm Vera Oasis, currently operating in degraded mode due to high load. I can still help with basic queries. What would you like to know?";
    }

    if (lower.match(/\b(what|who|how)\b.*\b(you|vera|oasis)\b/)) {
      return "I'm Vera Oasis, an AI assistant. I'm currently running in fallback mode while my primary systems recover. I can still assist with many tasks!";
    }

    if (lower.match(/\b(code|program|function)\b/)) {
      return "I'd love to help you with code! I'm currently in a simplified mode, but I can still provide guidance. What are you trying to build?";
    }

    return "I'm here to help! I'm currently operating in a simplified mode while systems recover. What can I assist you with?";
  }

  /**
   * Get system health status
   */
  getHealth(): HealthStatus {
    const resources = this.resourceMonitor.getStatus();

    return {
      status: this.determineHealthStatus(resources),
      lastCheck: Date.now(),
      checks: {
        llm: this.circuitBreaker.getState() !== 'open',
        memory: resources.memoryUsage < resources.quota.maxMemoryMb * 0.9,
        hcs: true, // Would check actual HCS connection
        rateLimit: true,
      },
      metrics: {
        requestsPerMinute: this.metrics.getRate('oasis_think_duration') || 0,
        averageLatency: this.metrics.getAverage('oasis_think_duration') || 0,
        errorRate: this.metrics.getErrorRate() || 0,
        circuitBreakerState: this.circuitBreaker.getState(),
      },
    };
  }

  private determineHealthStatus(resources: any): 'healthy' | 'degraded' | 'unhealthy' {
    if (this.circuitBreaker.getState() === 'open') return 'degraded';
    if (resources.memoryUsage > resources.quota.maxMemoryMb * 0.95) return 'degraded';
    if (resources.activeRequests > resources.quota.maxConcurrentRequests * 0.9) return 'degraded';
    return 'healthy';
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('HardenedVeraOasis', {
      message: 'Configuration updated',
      config: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): typeof this.config {
    return { ...this.config };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('HardenedVeraOasis', { message: 'Shutting down gracefully...' });
    
    this.auditLogger.stop();
    
    // Wait for active requests to complete (max 10 seconds)
    let attempts = 0;
    while (this.resourceMonitor.getStatus().activeRequests > 0 && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    logger.info('HardenedVeraOasis', { message: 'Shutdown complete' });
  }
}

// Export singleton
export const hardenedVeraOasis = new HardenedVeraOasis();
export default hardenedVeraOasis;
