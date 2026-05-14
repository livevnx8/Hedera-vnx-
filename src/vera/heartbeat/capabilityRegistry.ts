/**
 * Vera Enterprise Capability Registry
 *
 * Full-stack capability schema with versioning, hash-based delta detection,
 * and enterprise-grade metadata for HCS heartbeat advertisement.
 */

import { createHash } from 'crypto';

// ─── Capability Schema ─────────────────────────────────────────────────────

export interface HederaCapabilities {
  services: ('hts' | 'hcs' | 'hscs' | 'hip993' | 'hip583' | 'file' | 'schedule')[];
  networks: ('mainnet' | 'testnet' | 'previewnet')[];
  max_tps: number;
  shard_aware: boolean;
  evm_compatible: boolean;
}

export interface AICapabilities {
  providers: ('openai' | 'google' | 'qvx' | 'native' | 'ollama')[];
  models: string[];
  native_tools: boolean;
  multimodal: boolean;
  streaming: boolean;
  tool_calling: boolean;
  max_tokens_per_min: number;
}

export interface DomainCapabilities {
  defi: boolean;
  carbon: boolean;
  compliance: boolean;
  payment_streams: boolean;
  staking: boolean;
  nft: boolean;
  dao: boolean;
  identity: boolean;
  supply_chain: boolean;
}

export interface HardwareCapabilities {
  cpu_cores: number;
  memory_gb: number;
  gpu_enabled: boolean;
  gpu_model?: string;
  gpu_memory_gb?: number;
  disk_gb: number;
  architecture: 'x64' | 'arm64' | 'mixed';
}

export interface ComplianceCapabilities {
  gdpr: boolean;
  soc2: boolean;
  iso27001: boolean;
  hipaa: boolean;
  pci_dss: boolean;
  audit_ready: boolean;
  data_residency?: string[];
}

export interface PerformanceCapabilities {
  avg_response_ms: number;
  uptime_24h: number; // percentage
  tasks_completed_24h: number;
  success_rate: number; // percentage
  latency_p50_ms: number;
  latency_p99_ms: number;
}

export interface EnterpriseCapabilities {
  version: string;
  node_id: string;
  node_type: 'validator' | 'agent' | 'router' | 'coordinator' | 'hybrid';
  hedera: HederaCapabilities;
  ai: AICapabilities;
  domains: DomainCapabilities;
  hardware: HardwareCapabilities;
  compliance: ComplianceCapabilities;
  performance: PerformanceCapabilities;
  updated_at: number;
}

// ─── Default Capabilities ──────────────────────────────────────────────────

export const DEFAULT_ENTERPRISE_CAPABILITIES: EnterpriseCapabilities = {
  version: '1.0.0',
  node_id: 'unknown',
  node_type: 'agent',
  hedera: {
    services: ['hts', 'hcs', 'hscs'],
    networks: ['testnet'],
    max_tps: 10,
    shard_aware: true,
    evm_compatible: true,
  },
  ai: {
    providers: ['native'],
    models: ['qvx-default'],
    native_tools: true,
    multimodal: false,
    streaming: true,
    tool_calling: true,
    max_tokens_per_min: 10000,
  },
  domains: {
    defi: false,
    carbon: false,
    compliance: false,
    payment_streams: false,
    staking: false,
    nft: false,
    dao: false,
    identity: false,
    supply_chain: false,
  },
  hardware: {
    cpu_cores: 4,
    memory_gb: 16,
    gpu_enabled: false,
    disk_gb: 100,
    architecture: 'x64',
  },
  compliance: {
    gdpr: false,
    soc2: false,
    iso27001: false,
    hipaa: false,
    pci_dss: false,
    audit_ready: false,
  },
  performance: {
    avg_response_ms: 0,
    uptime_24h: 100,
    tasks_completed_24h: 0,
    success_rate: 100,
    latency_p50_ms: 0,
    latency_p99_ms: 0,
  },
  updated_at: Date.now(),
};

// ─── Capability Registry Class ─────────────────────────────────────────────

export class CapabilityRegistry {
  private capabilities: EnterpriseCapabilities;
  private capabilityHash: string;
  private lastBroadcast: number;

  constructor(initial?: Partial<EnterpriseCapabilities>) {
    this.capabilities = this.mergeWithDefaults(initial);
    this.capabilityHash = this.computeHash(this.capabilities);
    this.lastBroadcast = 0;
  }

  /**
   * Get current capabilities
   */
  getCapabilities(): EnterpriseCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Get current capability hash
   */
  getCapabilityHash(): string {
    return this.capabilityHash;
  }

  /**
   * Check if capabilities have changed since last broadcast
   */
  hasChanged(): boolean {
    const currentHash = this.computeHash(this.capabilities);
    return currentHash !== this.capabilityHash;
  }

  /**
   * Mark capabilities as broadcasted
   */
  markBroadcasted(): void {
    this.capabilityHash = this.computeHash(this.capabilities);
    this.lastBroadcast = Date.now();
  }

  /**
   * Get time since last broadcast in milliseconds
   */
  getTimeSinceLastBroadcast(): number {
    return Date.now() - this.lastBroadcast;
  }

  /**
   * Update capabilities
   */
  updateCapabilities(updates: Partial<EnterpriseCapabilities>): boolean {
    const oldHash = this.capabilityHash;

    // Update top-level fields
    if (updates.node_type) this.capabilities.node_type = updates.node_type;
    if (updates.hedera) this.capabilities.hedera = { ...this.capabilities.hedera, ...updates.hedera };
    if (updates.ai) this.capabilities.ai = { ...this.capabilities.ai, ...updates.ai };
    if (updates.domains) this.capabilities.domains = { ...this.capabilities.domains, ...updates.domains };
    if (updates.hardware) this.capabilities.hardware = { ...this.capabilities.hardware, ...updates.hardware };
    if (updates.compliance) this.capabilities.compliance = { ...this.capabilities.compliance, ...updates.compliance };
    if (updates.performance) this.capabilities.performance = { ...this.capabilities.performance, ...updates.performance };

    this.capabilities.updated_at = Date.now();

    // Return true if changed
    return this.hasChanged();
  }

  /**
   * Update performance metrics
   */
  updatePerformance(metrics: Partial<PerformanceCapabilities>): void {
    this.capabilities.performance = {
      ...this.capabilities.performance,
      ...metrics,
    };
    this.capabilities.updated_at = Date.now();
  }

  /**
   * Get minimal status (for minimal heartbeats)
   */
  getMinimalStatus(): MinimalCapabilityStatus {
    return {
      version: this.capabilities.version,
      node_type: this.capabilities.node_type,
      status: 'healthy',
      load: this.capabilities.performance.avg_response_ms / 1000, // normalized
      capabilities_hash: this.capabilityHash,
      updated_at: this.capabilities.updated_at,
    };
  }

  /**
   * Find matching capabilities
   */
  matchesQuery(query: CapabilityQuery): boolean {
    const caps = this.capabilities;

    // Check Hedera services
    if (query.hedera_services) {
      for (const svc of query.hedera_services) {
        if (!caps.hedera.services.includes(svc)) return false;
      }
    }

    // Check AI providers
    if (query.ai_providers) {
      for (const provider of query.ai_providers) {
        if (!caps.ai.providers.includes(provider)) return false;
      }
    }

    // Check domains
    if (query.domains) {
      for (const domain of query.domains) {
        if (!caps.domains[domain]) return false;
      }
    }

    // Check compliance
    if (query.compliance) {
      for (const req of query.compliance) {
        if (!caps.compliance[req]) return false;
      }
    }

    // Check hardware requirements
    if (query.min_memory_gb && caps.hardware.memory_gb < query.min_memory_gb) return false;
    if (query.gpu_required && !caps.hardware.gpu_enabled) return false;

    // Check performance
    if (query.min_uptime && caps.performance.uptime_24h < query.min_uptime) return false;
    if (query.min_success_rate && caps.performance.success_rate < query.min_success_rate) return false;

    return true;
  }

  /**
   * Compute hash for delta detection
   */
  private computeHash(caps: EnterpriseCapabilities): string {
    // Hash everything except performance metrics (which change frequently)
    const hashable = {
      node_type: caps.node_type,
      hedera: caps.hedera,
      ai: caps.ai,
      domains: caps.domains,
      hardware: caps.hardware,
      compliance: caps.compliance,
    };

    return 'sha256:' + createHash('sha256')
      .update(JSON.stringify(hashable))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Merge initial values with defaults
   */
  private mergeWithDefaults(initial?: Partial<EnterpriseCapabilities>): EnterpriseCapabilities {
    return {
      ...DEFAULT_ENTERPRISE_CAPABILITIES,
      ...initial,
      hedera: { ...DEFAULT_ENTERPRISE_CAPABILITIES.hedera, ...initial?.hedera },
      ai: { ...DEFAULT_ENTERPRISE_CAPABILITIES.ai, ...initial?.ai },
      domains: { ...DEFAULT_ENTERPRISE_CAPABILITIES.domains, ...initial?.domains },
      hardware: { ...DEFAULT_ENTERPRISE_CAPABILITIES.hardware, ...initial?.hardware },
      compliance: { ...DEFAULT_ENTERPRISE_CAPABILITIES.compliance, ...initial?.compliance },
      performance: { ...DEFAULT_ENTERPRISE_CAPABILITIES.performance, ...initial?.performance },
    };
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MinimalCapabilityStatus {
  version: string;
  node_type: EnterpriseCapabilities['node_type'];
  status: 'healthy' | 'degraded' | 'unhealthy';
  load: number; // 0-1 normalized
  capabilities_hash: string;
  updated_at: number;
}

export interface CapabilityQuery {
  hedera_services?: HederaCapabilities['services'];
  ai_providers?: AICapabilities['providers'];
  domains?: (keyof DomainCapabilities)[];
  compliance?: (keyof ComplianceCapabilities)[];
  min_memory_gb?: number;
  gpu_required?: boolean;
  min_uptime?: number;
  min_success_rate?: number;
  include_unhealthy?: boolean;
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const capabilityRegistry = new CapabilityRegistry();
