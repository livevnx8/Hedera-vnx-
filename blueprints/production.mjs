#!/usr/bin/env node
/**
 * AutoScaler - Dynamic agent scaling based on load
 * Phase 6 Implementation
 */

export class AutoScaler {
  constructor(config = {}) {
    this.minAgents = config.minAgents || 1;
    this.maxAgents = config.maxAgents || 10;
    this.scaleUpThreshold = config.scaleUpThreshold || 0.8;
    this.scaleDownThreshold = config.scaleDownThreshold || 0.3;
    this.cooldown = config.cooldown || 300000; // 5 minutes
    
    this.metrics = new Map();
    this.lastScale = 0;
    this.currentScale = this.minAgents;
    this.history = [];
  }
  
  /**
   * Record metrics for an agent
   * @param {string} agentId - Agent identifier
   * @param {Object} metrics - Current metrics
   */
  recordMetrics(agentId, metrics) {
    this.metrics.set(agentId, {
      ...metrics,
      timestamp: Date.now()
    });
    
    // Check if scaling needed
    this.evaluateScaling();
  }
  
  /**
   * Evaluate if scaling is needed
   */
  evaluateScaling() {
    const now = Date.now();
    
    // Check cooldown
    if (now - this.lastScale < this.cooldown) return null;
    
    // Calculate average load
    const loads = Array.from(this.metrics.values()).map(m => m.load || 0);
    const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
    
    let action = null;
    
    // Scale up
    if (avgLoad > this.scaleUpThreshold && this.currentScale < this.maxAgents) {
      action = {
        type: 'SCALE_UP',
        from: this.currentScale,
        to: Math.min(this.currentScale + 1, this.maxAgents),
        reason: `Load at ${Math.round(avgLoad * 100)}%`,
        timestamp: now
      };
    }
    
    // Scale down
    else if (avgLoad < this.scaleDownThreshold && this.currentScale > this.minAgents) {
      action = {
        type: 'SCALE_DOWN',
        from: this.currentScale,
        to: Math.max(this.currentScale - 1, this.minAgents),
        reason: `Load at ${Math.round(avgLoad * 100)}%`,
        timestamp: now
      };
    }
    
    if (action) {
      this.currentScale = action.to;
      this.lastScale = now;
      this.history.push(action);
      return action;
    }
    
    return null;
  }
  
  /**
   * Get current scaling status
   */
  getStatus() {
    const loads = Array.from(this.metrics.values()).map(m => m.load || 0);
    
    return {
      currentScale: this.currentScale,
      minAgents: this.minAgents,
      maxAgents: this.maxAgents,
      avgLoad: loads.length > 0 ? Math.round((loads.reduce((a, b) => a + b, 0) / loads.length) * 100) : 0,
      metricsCount: this.metrics.size,
      lastScale: this.lastScale,
      history: this.history.slice(-5)
    };
  }
  
  /**
   * Manual scaling override
   */
  setScale(target) {
    const clamped = Math.max(this.minAgents, Math.min(target, this.maxAgents));
    
    const action = {
      type: 'MANUAL_SCALE',
      from: this.currentScale,
      to: clamped,
      reason: 'Manual override',
      timestamp: Date.now()
    };
    
    this.currentScale = clamped;
    this.lastScale = Date.now();
    this.history.push(action);
    
    return action;
  }
}

/**
 * WebhookAlertManager - External notification system
 */
export class WebhookAlertManager {
  constructor(config = {}) {
    this.webhooks = new Map();
    this.alertHistory = [];
    this.rateLimiter = new Map();
    this.cooldownMs = config.cooldownMs || 60000; // 1 minute between similar alerts
  }
  
  /**
   * Register a webhook endpoint
   * @param {string} name - Webhook name
   * @param {string} url - Endpoint URL
   * @param {Array<string>} events - Event types to send
   */
  register(name, url, events = ['*']) {
    this.webhooks.set(name, {
      url,
      events,
      registered: Date.now(),
      successCount: 0,
      failCount: 0
    });
    
    return { name, url, events };
  }
  
  /**
   * Send alert to registered webhooks
   * @param {string} type - Alert type
   * @param {Object} data - Alert data
   */
  async sendAlert(type, data) {
    // Rate limiting
    const key = `${type}:${JSON.stringify(data).substring(0, 50)}`;
    const lastSent = this.rateLimiter.get(key);
    
    if (lastSent && Date.now() - lastSent < this.cooldownMs) {
      return { sent: false, reason: 'Rate limited' };
    }
    
    this.rateLimiter.set(key, Date.now());
    
    const alert = {
      id: Math.random().toString(36).substring(7),
      type,
      data,
      timestamp: Date.now(),
      recipients: []
    };
    
    // Send to matching webhooks
    for (const [name, webhook] of this.webhooks) {
      if (webhook.events.includes('*') || webhook.events.includes(type)) {
        try {
          const result = await this.sendToWebhook(webhook, alert);
          alert.recipients.push({ name, success: result.success });
          
          if (result.success) {
            webhook.successCount++;
          } else {
            webhook.failCount++;
          }
        } catch (e) {
          webhook.failCount++;
          alert.recipients.push({ name, success: false, error: e.message });
        }
      }
    }
    
    this.alertHistory.push(alert);
    
    return { sent: true, alertId: alert.id, recipients: alert.recipients.length };
  }
  
  async sendToWebhook(webhook, alert) {
    // In production, this would make actual HTTP request
    // For demo, simulate success
    return { success: true, latency: Math.random() * 500 };
  }
  
  /**
   * Get webhook status
   */
  getStatus() {
    return {
      webhooks: Array.from(this.webhooks.entries()).map(([name, w]) => ({
        name,
        url: w.url,
        events: w.events,
        successRate: w.successCount + w.failCount > 0 
          ? Math.round((w.successCount / (w.successCount + w.failCount)) * 100) 
          : 100
      })),
      recentAlerts: this.alertHistory.slice(-10).map(a => ({
        type: a.type,
        timestamp: a.timestamp,
        recipients: a.recipients.length
      }))
    };
  }
  
  /**
   * Trigger domain-specific alerts
   */
  async triggerDomainAlert(domain, severity, details) {
    const alertTypes = {
      energy: 'ENERGY_ANOMALY',
      defi: 'DEFI_OPPORTUNITY',
      security: 'SECURITY_THREAT',
      carbon: 'CARBON_VALIDATION'
    };
    
    return await this.sendAlert(alertTypes[domain] || 'GENERAL', {
      domain,
      severity,
      details,
      timestamp: Date.now()
    });
  }
}

/**
 * ProductionOrchestrator - Full production system
 */
export class ProductionOrchestrator {
  constructor() {
    this.autoScaler = new AutoScaler({
      minAgents: 2,
      maxAgents: 8,
      scaleUpThreshold: 0.75,
      scaleDownThreshold: 0.25
    });
    
    this.alerts = new WebhookAlertManager({ cooldownMs: 30000 });
    this.running = false;
    this.metrics = {
      cycles: 0,
      alertsSent: 0,
      scales: 0
    };
  }
  
  async initialize() {
    // Register default webhooks
    this.alerts.register('discord', 'https://discord.com/api/webhooks/...', ['SECURITY_THREAT', 'ENERGY_ANOMALY']);
    this.alerts.register('slack', 'https://hooks.slack.com/...', ['*']);
    this.alerts.register('pagerduty', 'https://events.pagerduty.com/...', ['SECURITY_THREAT']);
    
    console.log('✅ Production Orchestrator initialized');
    console.log('   Auto-scaling: 2-8 agents');
    console.log('   Webhooks: 3 registered');
    console.log('   Rate limit: 30s cooldown');
  }
  
  async run() {
    this.running = true;
    
    while (this.running) {
      this.metrics.cycles++;
      
      // Check agent loads and scale if needed
      const scaleAction = this.autoScaler.evaluateScaling();
      if (scaleAction) {
        console.log(`📈 Auto-scale: ${scaleAction.type} (${scaleAction.from} → ${scaleAction.to})`);
        this.metrics.scales++;
      }
      
      // Send periodic health alert
      if (this.metrics.cycles % 10 === 0) {
        await this.alerts.sendAlert('HEALTH_CHECK', {
          cycles: this.metrics.cycles,
          scale: this.autoScaler.getStatus()
        });
        this.metrics.alertsSent++;
      }
      
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  
  getStatus() {
    return {
      running: this.running,
      metrics: this.metrics,
      scaler: this.autoScaler.getStatus(),
      alerts: this.alerts.getStatus()
    };
  }
}

export default {
  AutoScaler,
  WebhookAlertManager,
  ProductionOrchestrator
};
