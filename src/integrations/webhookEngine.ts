/**
 * Webhook Engine
 *
 * HMAC-signed webhook delivery with exponential backoff retry,
 * dead-letter queue, and event subscription registry.
 * Enables Zapier/Make.com/n8n integrations without custom code.
 */

import { createHmac } from 'crypto';
import { logger } from '../monitoring/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];           // e.g. ["carbon.retired", "agent.joined"]
  secret: string;             // HMAC key
  active: boolean;
  maxRetries: number;
  createdAt: number;
  deliveredCount: number;
  failedCount: number;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed' | 'dlq';
  attempts: number;
  lastAttemptAt: number;
  nextAttemptAt: number;
  responseStatus?: number;
  responseBody?: string;
}

// ─── In-Memory Stores (swap for Redis/DB in prod) ───────────────────────────

const subscriptions = new Map<string, WebhookSubscription>();
const deliveryQueue: WebhookDelivery[] = [];
const deadLetterQueue: WebhookDelivery[] = [];
let schedulerRunning = false;
let schedulerTimer: NodeJS.Timeout | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

export function registerSubscription(sub: Omit<WebhookSubscription, 'createdAt' | 'deliveredCount' | 'failedCount'>): WebhookSubscription {
  const full: WebhookSubscription = {
    ...sub,
    createdAt: Date.now(),
    deliveredCount: 0,
    failedCount: 0,
  };
  subscriptions.set(full.id, full);
  logger.info('WebhookEngine', { message: 'Subscription registered', id: full.id, url: full.url, events: full.events });
  return full;
}

export function unregisterSubscription(id: string): boolean {
  return subscriptions.delete(id);
}

export function getSubscription(id: string): WebhookSubscription | undefined {
  return subscriptions.get(id);
}

export function listSubscriptions(event?: string): WebhookSubscription[] {
  const all = Array.from(subscriptions.values()).filter((s) => s.active);
  if (!event) return all;
  return all.filter((s) => s.events.includes(event) || s.events.includes('*'));
}

export function getDeliveryQueue(): WebhookDelivery[] {
  return [...deliveryQueue];
}

export function getDeadLetterQueue(): WebhookDelivery[] {
  return [...deadLetterQueue];
}

// ─── Event Dispatch ─────────────────────────────────────────────────────────

export function dispatchEvent(event: string, payload: Record<string, unknown>): void {
  const targets = listSubscriptions(event);
  if (targets.length === 0) return;

  for (const sub of targets) {
    const delivery: WebhookDelivery = {
      id: generateId(),
      subscriptionId: sub.id,
      event,
      payload: { ...payload, _event: event, _timestamp: Date.now() },
      status: 'pending',
      attempts: 0,
      lastAttemptAt: 0,
      nextAttemptAt: Date.now(),
    };
    deliveryQueue.push(delivery);
  }

  if (!schedulerRunning) {
    startScheduler();
  }
}

// ─── HMAC Signature ─────────────────────────────────────────────────────────

function signPayload(secret: string, payload: Record<string, unknown>): string {
  const body = JSON.stringify(payload);
  return createHmac('sha256', secret).update(body).digest('hex');
}

function verifySignature(secret: string, payload: Record<string, unknown>, signature: string): boolean {
  return signPayload(secret, payload) === signature;
}

// ─── Delivery Worker ────────────────────────────────────────────────────────

async function attemptDelivery(delivery: WebhookDelivery): Promise<void> {
  const sub = subscriptions.get(delivery.subscriptionId);
  if (!sub || !sub.active) {
    delivery.status = 'failed';
    return;
  }

  const signature = signPayload(sub.secret, delivery.payload);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vera-Webhook-Signature': `sha256=${signature}`,
        'X-Vera-Event': delivery.event,
        'X-Vera-Delivery-Id': delivery.id,
        'User-Agent': 'VeraLattice-Webhook/1.0',
      },
      body: JSON.stringify(delivery.payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    delivery.responseStatus = response.status;
    delivery.responseBody = await response.text().catch(() => '');
    delivery.lastAttemptAt = Date.now();
    delivery.attempts += 1;

    if (response.ok) {
      delivery.status = 'delivered';
      sub.deliveredCount += 1;
      logger.info('WebhookEngine', { message: 'Delivered', deliveryId: delivery.id, event: delivery.event, url: sub.url });
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    delivery.lastAttemptAt = Date.now();
    delivery.attempts += 1;

    if (delivery.attempts >= sub.maxRetries) {
      delivery.status = 'dlq';
      deadLetterQueue.push(delivery);
      sub.failedCount += 1;
      logger.warn('WebhookEngine', {
        message: 'Delivery failed — moved to DLQ',
        deliveryId: delivery.id,
        event: delivery.event,
        attempts: delivery.attempts,
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      // Exponential backoff: 2^attempts seconds (max 5 min)
      const backoffMs = Math.min(1000 * Math.pow(2, delivery.attempts), 300000);
      delivery.nextAttemptAt = Date.now() + backoffMs;
      delivery.status = 'pending';
      logger.info('WebhookEngine', {
        message: 'Delivery scheduled for retry',
        deliveryId: delivery.id,
        attempt: delivery.attempts,
        nextAttemptMs: backoffMs,
      });
    }
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

function startScheduler(): void {
  if (schedulerRunning) return;
  schedulerRunning = true;

  async function tick() {
    const now = Date.now();
    const ready = deliveryQueue.filter((d) => d.status === 'pending' && d.nextAttemptAt <= now);

    for (const delivery of ready) {
      await attemptDelivery(delivery);
    }

    // Remove delivered items
    for (let i = deliveryQueue.length - 1; i >= 0; i--) {
      if (deliveryQueue[i].status === 'delivered') {
        deliveryQueue.splice(i, 1);
      }
    }

    // Continue if there are pending items
    const hasPending = deliveryQueue.some((d) => d.status === 'pending');
    if (!hasPending) {
      schedulerRunning = false;
      schedulerTimer = null;
      return;
    }

    schedulerTimer = setTimeout(tick, 1000);
  }

  schedulerTimer = setTimeout(tick, 1000);
}

export function stopScheduler(): void {
  schedulerRunning = false;
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

// ─── Replay DLQ ─────────────────────────────────────────────────────────────

export function replayDeadLetter(deliveryId: string): boolean {
  const idx = deadLetterQueue.findIndex((d) => d.id === deliveryId);
  if (idx === -1) return false;

  const delivery = deadLetterQueue[idx];
  delivery.status = 'pending';
  delivery.attempts = 0;
  delivery.nextAttemptAt = Date.now();
  deliveryQueue.push(delivery);
  deadLetterQueue.splice(idx, 1);

  if (!schedulerRunning) startScheduler();
  return true;
}

// ─── Utility ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Fastify Route Helpers ──────────────────────────────────────────────────

export function getWebhookStats(): Record<string, unknown> {
  return {
    subscriptions: subscriptions.size,
    activeSubscriptions: Array.from(subscriptions.values()).filter((s) => s.active).length,
    pendingDeliveries: deliveryQueue.filter((d) => d.status === 'pending').length,
    deliveredCount: Array.from(subscriptions.values()).reduce((sum, s) => sum + s.deliveredCount, 0),
    failedCount: Array.from(subscriptions.values()).reduce((sum, s) => sum + s.failedCount, 0),
    dlqSize: deadLetterQueue.length,
  };
}
