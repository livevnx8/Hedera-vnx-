/**
 * Security Hardening Module for VeraLattice
 * 
 * Provides comprehensive security measures including headers,
 * CSRF protection, input sanitization, and security monitoring.
 */

import crypto from 'node:crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../monitoring/logger.js';
import { enhancedAuth } from '../auth/enhanced.js';
import { AuthenticatedRequest } from '../auth/middleware.js';

export interface SecurityConfig {
  enableCSP: boolean;
  enableHSTS: boolean;
  enableCSRF: boolean;
  enableRateLimit: boolean;
  enableInputSanitization: boolean;
  enableSecurityMonitoring: boolean;
  trustedOrigins: string[];
  csrfTokenExpiry: number;
  maxRequestSize: number;
  allowedMethods: string[];
  allowedHeaders: string[];
}

export class SecurityHardening {
  private static instance: SecurityHardening;
  private config: SecurityConfig;
  private csrfTokens: Map<string, { token: string; expires: number }> = new Map();

  static getInstance(config?: Partial<SecurityConfig>): SecurityHardening {
    if (!SecurityHardening.instance) {
      SecurityHardening.instance = new SecurityHardening(config);
    }
    return SecurityHardening.instance;
  }

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      enableCSP: true,
      enableHSTS: process.env.NODE_ENV === 'production',
      enableCSRF: true,
      enableRateLimit: true,
      enableInputSanitization: true,
      enableSecurityMonitoring: true,
      trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',') || ['http://localhost:8080'],
      csrfTokenExpiry: 3600000, // 1 hour
      maxRequestSize: 10 * 1024 * 1024, // 10MB
      allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-CSRF-Token'
      ],
      ...config
    };
  }

  // Security headers middleware
  securityHeadersMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    // Prevent clickjacking
    reply.header('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection
    reply.header('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy
    reply.header('Permissions-Policy', 
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), ' +
      'interest-cohort=(), browsing-topics=(), web-share=(), serial=(), hid=(), ' +
      'screen-wake-lock=(), ambient-light-sensor=(), accelerometer=(), gyroscope=()'
    );

    // HSTS in production
    if (this.config.enableHSTS) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Content Security Policy
    if (this.config.enableCSP) {
      const csp = this.buildCSP(request);
      reply.header('Content-Security-Policy', csp);
    }

    // CORS headers
    this.setCORSHeaders(request, reply);

    // Server information hiding
    reply.header('Server', 'VeraLattice');
    reply.removeHeader('X-Powered-By');

    done();
  }

  private buildCSP(request: FastifyRequest): string {
    const isDev = process.env.NODE_ENV !== 'production';
    const origin = request.headers.origin || request.headers.referer;
    
    const csp = [
      "default-src 'self'",
      "script-src 'self'" + (isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self'",
      "connect-src 'self'" + (this.isTrustedOrigin(origin) ? ` ${origin}` : ""),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "media-src 'self'",
      "prefetch-src 'self'"
    ].join('; ');

    return csp;
  }

  private setCORSHeaders(request: FastifyRequest, reply: FastifyReply): void {
    const origin = request.headers.origin;
    
    if (this.isTrustedOrigin(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Methods', this.config.allowedMethods.join(', '));
      reply.header('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
      reply.header('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
      reply.header('Access-Control-Max-Age', '86400'); // 24 hours
    }

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
      return;
    }
  }

  private isTrustedOrigin(origin?: string): boolean {
    if (!origin) return false;
    return this.config.trustedOrigins.some(trusted => {
      if (trusted === '*') return true;
      if (trusted.includes('*')) {
        const regex = new RegExp(trusted.replace('*', '.*'));
        return regex.test(origin);
      }
      return origin === trusted;
    });
  }

  // CSRF protection
  generateCSRFToken(sessionId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + this.config.csrfTokenExpiry;
    
    this.csrfTokens.set(sessionId, { token, expires });
    
    // Clean up expired tokens
    this.cleanupCSRFTokens();
    
    return token;
  }

  validateCSRFToken(sessionId: string, token: string): boolean {
    const storedToken = this.csrfTokens.get(sessionId);
    
    if (!storedToken || storedToken.token !== token) {
      return false;
    }
    
    if (Date.now() > storedToken.expires) {
      this.csrfTokens.delete(sessionId);
      return false;
    }
    
    return true;
  }

  private cleanupCSRFTokens(): void {
    const now = Date.now();
    for (const [sessionId, token] of this.csrfTokens.entries()) {
      if (now > token.expires) {
        this.csrfTokens.delete(sessionId);
      }
    }
  }

  // CSRF middleware
  csrfProtectionMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    if (!this.config.enableCSRF) {
      return done();
    }

    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return done();
    }

    const sessionId = this.getSessionId(request);
    const csrfToken = request.headers['x-csrf-token'] as string || 
                     (request.body as any)?.csrfToken;

    if (!sessionId || !csrfToken || !this.validateCSRFToken(sessionId, csrfToken)) {
      logger.warn('CSRF token validation failed', {
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        sessionId: sessionId ? 'present' : 'missing',
        csrfToken: csrfToken ? 'present' : 'missing'
      });

      reply.code(403).send({
        error: 'CSRF token validation failed',
        message: 'Invalid or missing CSRF token'
      });
      return;
    }

    done();
  }

  private getSessionId(request: FastifyRequest): string | null {
    // Try to get session ID from various sources
    return (request as AuthenticatedRequest).user?.apiKeyId || 
           request.headers['x-session-id'] as string ||
           null;
  }

  // Input sanitization middleware
  inputSanitizationMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    if (!this.config.enableInputSanitization) {
      return done();
    }

    // Sanitize request body
    if (request.body && typeof request.body === 'object') {
      this.sanitizeObject(request.body);
    }

    // Sanitize query parameters
    if (request.query && typeof request.query === 'object') {
      this.sanitizeObject(request.query);
    }

    // Sanitize path parameters
    if (request.params && typeof request.params === 'object') {
      this.sanitizeObject(request.params);
    }

    done();
  }

  private sanitizeObject(obj: any): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    // Remove dangerous prototype properties
    const dangerousProps = ['__proto__', 'constructor', 'prototype'];
    for (const prop of dangerousProps) {
      if (prop in obj) {
        delete obj[prop];
      }
    }

    // Recursively sanitize nested objects
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        if (typeof value === 'string') {
          // XSS prevention
          obj[key] = this.sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
          this.sanitizeObject(value);
        }
      }
    }
  }

  private sanitizeString(str: string): string {
    return str
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'");
  }

  // Request size limiting
  requestSizeLimitMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    const contentLength = request.headers['content-length'];
    
    if (contentLength && parseInt(contentLength) > this.config.maxRequestSize) {
      logger.warn('Request size limit exceeded', {
        method: request.method,
        url: request.url,
        ip: request.ip,
        contentLength: parseInt(contentLength),
        maxSize: this.config.maxRequestSize
      });

      reply.code(413).send({
        error: 'Request too large',
        message: `Request size exceeds maximum allowed size of ${this.config.maxRequestSize / 1024 / 1024}MB`
      });
      return;
    }

    done();
  }

  // Method validation
  methodValidationMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    if (!this.config.allowedMethods.includes(request.method)) {
      logger.warn('Method not allowed', {
        method: request.method,
        url: request.url,
        ip: request.ip
      });

      reply.code(405).header('Allow', this.config.allowedMethods.join(', ')).send({
        error: 'Method not allowed',
        message: `Allowed methods: ${this.config.allowedMethods.join(', ')}`
      });
      return;
    }

    done();
  }

  // Security monitoring middleware
  securityMonitoringMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    if (!this.config.enableSecurityMonitoring) {
      return done();
    }

    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /<script/i,  // XSS attempt
      /javascript:/i,  // JavaScript protocol
      /union.*select/i,  // SQL injection attempt
      /cmd\.exe/i,  // Command injection
      /powershell/i,  // PowerShell injection
      /\$\(/,  // Shell command
      /eval\(/i,  // Code eval
      /base64_decode/i,  // Base64 decode (common in attacks)
    ];

    const requestString = JSON.stringify({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
      query: request.query,
      params: request.params
    });

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestString));

    if (isSuspicious) {
      logger.warn('Suspicious request detected', {
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        customerId: (request as AuthenticatedRequest).user?.customerId,
        patterns: suspiciousPatterns.filter(pattern => pattern.test(requestString))
      });

      // Log security event
      enhancedAuth.logAudit({
        customerId: (request as AuthenticatedRequest).user?.customerId,
        apiKeyId: (request as AuthenticatedRequest).user?.apiKeyId,
        eventType: 'security_event',
        action: 'suspicious_request',
        resourceType: 'endpoint',
        resourceId: request.url,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: 'Suspicious request pattern detected',
        context: {
          method: request.method,
          url: request.url,
          detectedPatterns: suspiciousPatterns.filter(pattern => pattern.test(requestString))
        }
      });
    }

    done();
  }

  // Rate limiting for security events
  securityRateLimitMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
    const ip = request.ip;
    const key = `security_rate_limit:${ip}`;
    
    // This would integrate with the distributed rate limiter
    // For now, just log the request for monitoring
    logger.debug('Security rate limit check', {
      ip,
      method: request.method,
      url: request.url
    });

    done();
  }

  // IP whitelisting/blacklisting
  ipFilterMiddleware(whitelist: string[] = [], blacklist: string[] = []) {
    return (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
      const ip = request.ip;

      // Check blacklist first
      if (blacklist.length > 0 && blacklist.includes(ip)) {
        logger.warn('Blacklisted IP attempted access', {
          ip,
          method: request.method,
          url: request.url,
          userAgent: request.headers['user-agent']
        });

        reply.code(403).send({
          error: 'Access denied',
          message: 'Your IP address has been blocked'
        });
        return;
      }

      // Check whitelist (if configured)
      if (whitelist.length > 0 && !whitelist.includes(ip)) {
        logger.warn('Non-whitelisted IP attempted access', {
          ip,
          method: request.method,
          url: request.url,
          userAgent: request.headers['user-agent']
        });

        reply.code(403).send({
          error: 'Access denied',
          message: 'Your IP address is not authorized'
        });
        return;
      }

      done();
    };
  }

  // Security headers for API responses
  setSecurityHeaders(reply: FastifyReply, additionalHeaders: Record<string, string> = {}): void {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Server', 'VeraLattice');

    // Add additional headers
    for (const [key, value] of Object.entries(additionalHeaders)) {
      reply.header(key, value);
    }
  }

  // Security audit logging
  async logSecurityEvent(event: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    request: FastifyRequest;
    additionalData?: Record<string, any>;
  }): Promise<void> {
    const logEntry = {
      type: event.type,
      severity: event.severity,
      description: event.description,
      ip: event.request.ip,
      userAgent: event.request.headers['user-agent'],
      method: event.request.method,
      url: event.request.url,
      customerId: (event.request as AuthenticatedRequest).user?.customerId,
      apiKeyId: (event.request as AuthenticatedRequest).user?.apiKeyId,
      timestamp: new Date().toISOString(),
      ...event.additionalData
    };

    logger.warn('Security event', logEntry);

    // Also log to audit system
    await enhancedAuth.logAudit({
      customerId: (event.request as AuthenticatedRequest).user?.customerId,
      apiKeyId: (event.request as AuthenticatedRequest).user?.apiKeyId,
      eventType: 'security_event',
      action: event.type,
      resourceType: 'security',
      ipAddress: event.request.ip,
      userAgent: event.request.headers['user-agent'],
      success: false,
      errorMessage: event.description,
      context: logEntry
    });
  }

  // Get security configuration
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  // Update security configuration
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Security configuration updated', { config: this.config });
  }
}

// Export singleton instance
export const securityHardening = SecurityHardening.getInstance();

// Export middleware functions
export const {
  securityHeadersMiddleware,
  csrfProtectionMiddleware,
  inputSanitizationMiddleware,
  requestSizeLimitMiddleware,
  methodValidationMiddleware,
  securityMonitoringMiddleware,
  securityRateLimitMiddleware,
  ipFilterMiddleware,
  setSecurityHeaders,
  logSecurityEvent
} = securityHardening;
