/**
 * Monitoring and Metrics for VeraLattice
 * 
 * Tracks performance, errors, and usage statistics
 */

import { createPrometheusMetrics, PrometheusMetrics } from './prometheus.js';
import { logger } from './logger.js';

export interface MetricData {
  timestamp: Date;
  userId?: string;
  sessionId: string;
  type: 'request' | 'tool_execution' | 'error' | 'wallet_operation';
  duration?: number;
  success: boolean;
  details: Record<string, any>;
}

export class MetricsCollector {
  private metrics: Map<string, MetricData> = new Map();
  private prometheus: PrometheusMetrics;
  
  constructor() {
    this.prometheus = createPrometheusMetrics();
  }

  trackRequest(data: Omit<MetricData, 'type'> & { endpoint: string; method: string }) {
    const metricData: MetricData = {
      ...data,
      type: 'request',
      details: {
        endpoint: data.endpoint,
        method: data.method,
        ...data.details
      }
    };
    
    this.recordMetric(metricData);
    this.prometheus.recordRequest(data.endpoint, data.method, data.duration || 0, data.success);
  }

  trackToolExecution(data: Omit<MetricData, 'type'> & { toolName: string; args: Record<string, any> }) {
    const metricData: MetricData = {
      ...data,
      type: 'tool_execution',
      details: {
        toolName: data.toolName,
        args: this.sanitizeArgs(data.args),
        ...data.details
      }
    };
    
    this.recordMetric(metricData);
    this.prometheus.recordToolExecution(data.toolName, data.duration || 0, data.success);
  }

  trackError(data: Omit<MetricData, 'type'> & { error: string; stack?: string }) {
    const metricData: MetricData = {
      ...data,
      type: 'error',
      success: false,
      details: {
        error: data.error,
        stack: data.stack,
        ...data.details
      }
    };
    
    this.recordMetric(metricData);
    this.prometheus.recordError(data.error);
    logger.error('Application error', metricData);
  }

  trackWalletOperation(data: Omit<MetricData, 'type'> & { operation: string; accountId?: string }) {
    const metricData: MetricData = {
      ...data,
      type: 'wallet_operation',
      details: {
        operation: data.operation,
        accountId: data.accountId,
        ...data.details
      }
    };
    
    this.recordMetric(metricData);
    this.prometheus.recordWalletOperation(data.operation, data.duration || 0, data.success);
  }

  private recordMetric(data: MetricData) {
    const key = `${data.type}_${data.sessionId}`;
    this.metrics.set(key, data);
    
    // Keep only last 1000 metrics in memory
    if (this.metrics.size > 1000) {
      const oldestKey = this.metrics.keys().next().value;
      if (oldestKey) {
        this.metrics.delete(oldestKey);
      }
    }
  }

  private sanitizeArgs(args: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(args)) {
      // Redact sensitive information
      if (key.toLowerCase().includes('private') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  getMetrics(timeRange?: { start: Date; end: Date }) {
    let metrics = Array.from(this.metrics.values());
    
    if (timeRange) {
      metrics = metrics.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }
    
    return {
      total: metrics.length,
      byType: this.groupByType(metrics),
      bySuccess: this.groupBySuccess(metrics),
      averageDuration: this.calculateAverageDuration(metrics),
      recent: metrics.slice(-10)
    };
  }

  private groupByType(metrics: MetricData[]) {
    const groups: Record<string, number> = {};
    
    for (const metric of metrics) {
      groups[metric.type] = (groups[metric.type] || 0) + 1;
    }
    
    return groups;
  }

  private groupBySuccess(metrics: MetricData[]) {
    const successful = metrics.filter(m => m.success).length;
    const failed = metrics.length - successful;
    
    return { successful, failed, successRate: metrics.length > 0 ? successful / metrics.length : 0 };
  }

  private calculateAverageDuration(metrics: MetricData[]) {
    const withDuration = metrics.filter(m => m.duration !== undefined);
    if (withDuration.length === 0) return 0;
    
    const total = withDuration.reduce((sum, m) => sum + (m.duration || 0), 0);
    return total / withDuration.length;
  }

  // Prometheus endpoint
  async getPrometheusMetrics(): Promise<string> {
    return this.prometheus.getMetrics();
  }
}

// Global metrics instance
export const metrics = new MetricsCollector();
