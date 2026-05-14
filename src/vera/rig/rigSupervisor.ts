import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { rigState } from './rigState.js';

export interface ManagedRigService {
  name: string;
  description: string;
  start: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
  status?: () => Record<string, unknown>;
  healthCheck?: () => Promise<{ healthy: boolean; issues?: string[] }> | { healthy: boolean; issues?: string[] };
}

export interface ManagedRigServiceStatus {
  name: string;
  description: string;
  state: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  registeredAt: number;
  lastActionAt: number | null;
  lastError: string | null;
  health: 'healthy' | 'degraded' | 'unknown';
  issues: string[];
  details: Record<string, unknown>;
}

export class RigSupervisor extends EventEmitter {
  private services = new Map<string, ManagedRigService>();
  private statuses = new Map<string, ManagedRigServiceStatus>();

  registerService(service: ManagedRigService): void {
    this.services.set(service.name, service);
    const existing = this.statuses.get(service.name);
    this.statuses.set(service.name, {
      name: service.name,
      description: service.description,
      state: existing?.state ?? 'stopped',
      registeredAt: existing?.registeredAt ?? Date.now(),
      lastActionAt: existing?.lastActionAt ?? null,
      lastError: existing?.lastError ?? null,
      health: existing?.health ?? 'unknown',
      issues: existing?.issues ?? [],
      details: existing?.details ?? {},
    });
  }

  hasService(name: string): boolean {
    return this.services.has(name);
  }

  async startService(name: string): Promise<ManagedRigServiceStatus> {
    const service = this.requireService(name);
    this.updateStatus(name, { state: 'starting', lastActionAt: Date.now(), lastError: null });

    try {
      await service.start();
      const status = await this.checkService(name);
      this.updateStatus(name, { state: 'running', lastActionAt: Date.now() });
      this.emit('service_started', status);
      return this.getServiceStatus(name)!;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus(name, {
        state: 'error',
        lastActionAt: Date.now(),
        lastError: message,
        health: 'degraded',
        issues: [message],
      });
      this.emit('service_failed', { name, error: message });
      throw error;
    }
  }

  async stopService(name: string): Promise<ManagedRigServiceStatus> {
    const service = this.requireService(name);
    this.updateStatus(name, { state: 'stopping', lastActionAt: Date.now() });

    try {
      await service.stop?.();
      this.updateStatus(name, {
        state: 'stopped',
        lastActionAt: Date.now(),
        health: 'unknown',
        issues: [],
      });
      const status = this.getServiceStatus(name)!;
      this.emit('service_stopped', status);
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus(name, {
        state: 'error',
        lastActionAt: Date.now(),
        lastError: message,
        health: 'degraded',
        issues: [message],
      });
      this.emit('service_failed', { name, error: message });
      throw error;
    }
  }

  async restartService(name: string): Promise<ManagedRigServiceStatus> {
    const service = this.requireService(name);
    if (service.stop) {
      await this.stopService(name);
    }
    return this.startService(name);
  }

  async checkService(name: string): Promise<ManagedRigServiceStatus> {
    const service = this.requireService(name);
    const current = this.getServiceStatus(name)!;
    const details = service.status?.() ?? {};

    try {
      const healthResult = service.healthCheck ? await service.healthCheck() : null;
      const health = healthResult
        ? healthResult.healthy ? 'healthy' : 'degraded'
        : current.state === 'running' ? 'healthy' : current.health;
      const issues = healthResult?.issues ?? current.issues;

      this.updateStatus(name, { details, health, issues });
    } catch (error) {
      this.updateStatus(name, {
        details,
        health: 'degraded',
        issues: [error instanceof Error ? error.message : String(error)],
      });
    }

    const status = this.getServiceStatus(name)!;
    this.emit('service_checked', status);
    return status;
  }

  async checkAllServices(): Promise<ManagedRigServiceStatus[]> {
    return Promise.all(Array.from(this.services.keys()).map((name) => this.checkService(name)));
  }

  listServices(): ManagedRigServiceStatus[] {
    return Array.from(this.statuses.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getServiceStatus(name: string): ManagedRigServiceStatus | null {
    return this.statuses.get(name) ?? null;
  }

  async getSummary() {
    const services = await this.checkAllServices();
    const snapshot = rigState.getSnapshot();
    return {
      timestamp: Date.now(),
      rig: snapshot,
      counts: {
        total: services.length,
        running: services.filter((service) => service.state === 'running').length,
        degraded: services.filter((service) => service.health === 'degraded').length,
        stopped: services.filter((service) => service.state === 'stopped').length,
      },
      services,
    };
  }

  private requireService(name: string): ManagedRigService {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Unknown rig service: ${name}`);
    }
    return service;
  }

  private updateStatus(name: string, patch: Partial<ManagedRigServiceStatus>): void {
    const current = this.statuses.get(name);
    if (!current) return;
    this.statuses.set(name, { ...current, ...patch });
    logger.debug('RigSupervisor', {
      message: 'Rig service state updated',
      service: name,
      state: this.statuses.get(name)?.state,
      health: this.statuses.get(name)?.health,
    });
  }
}

export const rigSupervisor = new RigSupervisor();
