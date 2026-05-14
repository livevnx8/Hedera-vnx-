/**
 * Vera Slack/Discord Notification System
 *
 * Alerts operators when:
 * - Human escalation required
 * - Training completes
 * - System anomalies detected
 * - Model checkpoints saved
 * - Quantum/Lattice health issues
 */

import { config } from '../../config.js';

export interface NotificationPayload {
  level: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  footer?: string;
}

export interface EscalationAlert {
  escalationId: string;
  taskId: string;
  serviceType: string;
  description: string;
  triggeredRules: string[];
  meridianConfidence?: number;
  meridianRecommendation?: string;
  timestamp: string;
}

export interface TrainingAlert {
  modelName: string;
  epoch: number;
  totalEpochs: number;
  loss: number;
  evalLoss?: number;
  checkpointPath?: string;
  status: 'in_progress' | 'completed' | 'failed';
  durationHours?: number;
}

export interface SystemHealthAlert {
  component: 'meridian' | 'quantum' | 'lattice' | 'hcs' | 'proof_kernel' | 'training';
  status: 'healthy' | 'degraded' | 'critical';
  message: string;
  metrics?: Record<string, unknown>;
}

export class SlackNotifier {
  private webhookUrl?: string;
  private enabled = false;
  private lastNotificationTime: Record<string, number> = {};
  private readonly cooldownMs = 60000; // 1 minute cooldown per notification type

  constructor() {
    this.webhookUrl = config.SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    this.enabled = !!this.webhookUrl;

    if (this.enabled) {
      console.log('🔔 Slack notifier initialized');
    } else {
      console.log('🔕 Slack notifier disabled (no webhook configured)');
    }
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send raw notification to Slack
   */
  async send(payload: NotificationPayload): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) {
      console.log('[Slack] Would send:', payload.title, '-', payload.message);
      return false;
    }

    // Cooldown check
    const key = `${payload.level}:${payload.title}`;
    const lastSent = this.lastNotificationTime[key] || 0;
    if (Date.now() - lastSent < this.cooldownMs) {
      return false; // In cooldown
    }
    this.lastNotificationTime[key] = Date.now();

    try {
      const color = this.getColorForLevel(payload.level);
      const slackPayload = {
        attachments: [
          {
            color,
            title: payload.title,
            text: payload.message,
            fields: payload.metadata
              ? Object.entries(payload.metadata).map(([title, value]) => ({
                  title,
                  value: String(value).substring(0, 100), // Limit length
                  short: true,
                }))
              : [],
            footer: payload.footer || 'Vera Lattice',
            ts: Math.floor(Date.parse(payload.timestamp) / 1000),
          },
        ],
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        console.error('[Slack] Failed to send notification:', response.statusText);
        return false;
      }

      console.log('🔔 Slack notification sent:', payload.title);
      return true;
    } catch (error) {
      console.error('[Slack] Notification error:', error);
      return false;
    }
  }

  /**
   * Alert when human escalation is required
   */
  async notifyEscalation(alert: EscalationAlert): Promise<boolean> {
    return this.send({
      level: 'warning',
      title: '⚠️ Human Escalation Required',
      message: `Task "${alert.description.substring(0, 50)}..." requires human review`,
      metadata: {
        'Escalation ID': alert.escalationId,
        'Task ID': alert.taskId,
        'Service Type': alert.serviceType,
        'Triggered Rules': alert.triggeredRules.join(', '),
        'Meridian Confidence': alert.meridianConfidence?.toFixed(3) || 'N/A',
        'Recommendation': alert.meridianRecommendation || 'None',
      },
      timestamp: alert.timestamp,
      footer: 'Vera Proof Kernel',
    });
  }

  /**
   * Alert on training progress/completion
   */
  async notifyTraining(alert: TrainingAlert): Promise<boolean> {
    const level = alert.status === 'failed' ? 'error' : alert.status === 'completed' ? 'success' : 'info';
    const emoji = alert.status === 'failed' ? '❌' : alert.status === 'completed' ? '✅' : '📊';

    return this.send({
      level,
      title: `${emoji} Training ${alert.status.replace('_', ' ').toUpperCase()}: ${alert.modelName}`,
      message: alert.status === 'completed'
        ? `Model training completed after ${alert.durationHours?.toFixed(1)} hours`
        : `Epoch ${alert.epoch}/${alert.totalEpochs} - Loss: ${alert.loss.toFixed(4)}`,
      metadata: {
        'Model': alert.modelName,
        'Epoch': `${alert.epoch}/${alert.totalEpochs}`,
        'Loss': alert.loss.toFixed(4),
        'Eval Loss': alert.evalLoss?.toFixed(4) || 'N/A',
        'Checkpoint': alert.checkpointPath || 'N/A',
        'Duration': alert.durationHours ? `${alert.durationHours.toFixed(1)}h` : 'N/A',
      },
      timestamp: new Date().toISOString(),
      footer: 'Vera Meridian Training',
    });
  }

  /**
   * Alert on system health issues
   */
  async notifySystemHealth(alert: SystemHealthAlert): Promise<boolean> {
    const level = alert.status === 'critical' ? 'error' : alert.status === 'degraded' ? 'warning' : 'info';
    const emoji = alert.status === 'critical' ? '🚨' : alert.status === 'degraded' ? '⚡' : '✓';

    return this.send({
      level,
      title: `${emoji} ${alert.component.toUpperCase()} ${alert.status.toUpperCase()}`,
      message: alert.message,
      metadata: alert.metrics || {},
      timestamp: new Date().toISOString(),
      footer: 'Vera Health Monitor',
    });
  }

  /**
   * Notify when model checkpoint is saved
   */
  async notifyCheckpoint(
    modelName: string,
    checkpointPath: string,
    epoch: number,
    loss: number
  ): Promise<boolean> {
    return this.send({
      level: 'success',
      title: '💾 Checkpoint Saved',
      message: `${modelName} checkpoint saved after epoch ${epoch}`,
      metadata: {
        'Model': modelName,
        'Epoch': epoch.toString(),
        'Loss': loss.toFixed(4),
        'Path': checkpointPath,
      },
      timestamp: new Date().toISOString(),
      footer: 'Vera Meridian Training',
    });
  }

  /**
   * Notify on quantum/lattice anomalies
   */
  async notifyQuantumAnomaly(
    component: 'quantum' | 'lattice',
    issue: string,
    metrics: Record<string, unknown>
  ): Promise<boolean> {
    return this.send({
      level: 'warning',
      title: `🔮 ${component === 'quantum' ? 'Quantum' : 'Lattice'} Anomaly Detected`,
      message: issue,
      metadata: metrics,
      timestamp: new Date().toISOString(),
      footer: 'Vera Quantum Monitor',
    });
  }

  /**
   * Send test notification to verify webhook
   */
  async sendTest(): Promise<boolean> {
    return this.send({
      level: 'info',
      title: '🔔 Vera Notification Test',
      message: 'Slack notifications are configured correctly!',
      metadata: {
        'Environment': process.env.NODE_ENV || 'development',
        'Version': process.env.npm_package_version || '1.0.0',
        'Timestamp': new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      footer: 'Vera Lattice',
    });
  }

  private getColorForLevel(level: NotificationPayload['level']): string {
    switch (level) {
      case 'error': return '#FF0000';
      case 'warning': return '#FFA500';
      case 'success': return '#00FF00';
      case 'info': return '#0066CC';
      default: return '#808080';
    }
  }
}

// Global notifier instance
export const slackNotifier = new SlackNotifier();
