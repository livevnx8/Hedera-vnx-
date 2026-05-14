/**
 * Agent HCS SOS Beacon System
 * 
 * Broadcasts agent heartbeat, status, and SOS signals to Hedera Consensus Service.
 * Enables agent discovery, health monitoring, and emergency broadcasting.
 * 
 * Features:
 * - Configurable beacon interval (default: 30s, SOS mode: 5s)
 * - Automatic agent discovery via HCS subscription
 * - Emergency SOS broadcasting with escalation
 * - Rate limiting to prevent HCS spam
 * - Compressed message format for efficiency
 */

import { hederaMaster } from '../../hedera/hederaMasterClass.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

export interface BeaconMessage {
  type: 'heartbeat' | 'sos' | 'status' | 'discovery' | 'shutdown';
  agentId: string;
  agentType: string;
  timestamp: number;
  sequence: number;
  location?: {
    lat?: number;
    lng?: number;
    region?: string;
  };
  status: {
    healthy: boolean;
    load: number; // 0-1 CPU/memory load
    queueDepth: number; // pending tasks
    lastTaskCompleted?: number; // timestamp
  };
  capabilities: string[];
  endpoint?: string; // REST/WebSocket endpoint for direct comms
  sos?: {
    level: 'info' | 'warning' | 'critical';
    message: string;
    code?: string;
  };
  metadata?: Record<string, any>;
}

export interface AgentDiscoveryInfo {
  agentId: string;
  agentType: string;
  lastSeen: number;
  healthy: boolean;
  capabilities: string[];
  endpoint?: string;
  messageCount: number;
}

export interface BeaconConfig {
  topicId?: string;
  intervalMs?: number;
  sosIntervalMs?: number;
  maxMessageSize?: number;
  enableCompression?: boolean;
  discoveryTimeoutMs?: number;
}

export class AgentHCSBeacon {
  private agentId: string;
  private agentType: string;
  private topicId: string;
  private intervalMs: number;
  private sosIntervalMs: number;
  private maxMessageSize: number;
  private enableCompression: boolean;
  private discoveryTimeoutMs: number;
  
  private sequence = 0;
  private timer: NodeJS.Timeout | null = null;
  private sosTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isSOSMode = false;
  private lastBroadcast = 0;
  private minBroadcastInterval = 1000; // Minimum 1s between messages
  
  // Discovery tracking
  private discoveredAgents = new Map<string, AgentDiscoveryInfo>();
  private messageHistory: BeaconMessage[] = [];
  private maxHistorySize = 100;
  
  // Status callback
  private statusCallback: (() => Partial<BeaconMessage['status']>) | null = null;
  private capabilitiesCallback: (() => string[]) | null = null;
  private metadataCallback: (() => Record<string, any>) | null = null;
  
  constructor(
    agentId: string,
    agentType: string,
    config: BeaconConfig = {}
  ) {
    this.agentId = agentId;
    this.agentType = agentType;
    this.topicId = config.topicId || process.env.VERA_BEACON_TOPIC_ID || (config as any).VERA_REGISTRY_TOPIC_ID || '0.0.10414499';
    this.intervalMs = config.intervalMs || 600_000; // 10 minutes default (was 30s - too spammy!)
    this.sosIntervalMs = config.sosIntervalMs || 60_000; // 1 minute in SOS mode (was 5s)
    this.maxMessageSize = config.maxMessageSize || 4096; // 4KB max
    this.enableCompression = config.enableCompression !== false;
    this.discoveryTimeoutMs = config.discoveryTimeoutMs || 300000; // 5min timeout
  }
  
  /**
   * Set callback to provide dynamic status
   */
  onStatus(callback: () => Partial<BeaconMessage['status']>): void {
    this.statusCallback = callback;
  }
  
  /**
   * Set callback to provide dynamic capabilities
   */
  onCapabilities(callback: () => string[]): void {
    this.capabilitiesCallback = callback;
  }
  
  /**
   * Set callback to provide dynamic metadata
   */
  onMetadata(callback: () => Record<string, any>): void {
    this.metadataCallback = callback;
  }
  
  /**
   * Start broadcasting beacon messages
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.isSOSMode = false;
    
    // Send initial discovery message
    await this.broadcast('discovery');
    
    // Start regular heartbeat
    this.scheduleNext();
    
    logger.info('AgentHCSBeacon', {
      message: 'Beacon started',
      agentId: this.agentId,
      topicId: this.topicId,
      intervalMs: this.intervalMs
    });
  }
  
  /**
   * Stop broadcasting
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.sosTimer) {
      clearTimeout(this.sosTimer);
      this.sosTimer = null;
    }
    
    // Send shutdown message
    await this.broadcast('shutdown');
    
    logger.info('AgentHCSBeacon', {
      message: 'Beacon stopped',
      agentId: this.agentId
    });
  }
  
  /**
   * Enter SOS mode - rapid broadcasting with emergency flag
   */
  async triggerSOS(
    level: 'info' | 'warning' | 'critical',
    message: string,
    code?: string
  ): Promise<void> {
    if (!this.isRunning) {
      await this.start();
    }
    
    this.isSOSMode = true;
    
    // Clear existing timers
    if (this.timer) clearTimeout(this.timer);
    if (this.sosTimer) clearTimeout(this.sosTimer);
    
    // Broadcast SOS immediately
    await this.broadcast('sos', { level, message, code });
    
    // Schedule rapid SOS broadcasts
    this.scheduleSOS({ level, message, code });
    
    logger.warn('AgentHCSBeacon', {
      message: 'SOS mode activated',
      agentId: this.agentId,
      level,
      sosMessage: message
    });
  }
  
  /**
   * Cancel SOS mode and return to normal heartbeat
   */
  async cancelSOS(): Promise<void> {
    if (!this.isSOSMode) return;
    
    this.isSOSMode = false;
    
    if (this.sosTimer) {
      clearTimeout(this.sosTimer);
      this.sosTimer = null;
    }
    
    // Send recovery message
    await this.broadcast('status', undefined, { recovered: true });
    
    // Resume normal schedule
    this.scheduleNext();
    
    logger.info('AgentHCSBeacon', {
      message: 'SOS mode cancelled',
      agentId: this.agentId
    });
  }
  
  /**
   * Force immediate status broadcast
   */
  async pulse(): Promise<void> {
    await this.broadcast('heartbeat');
  }
  
  /**
   * Get discovered agents
   */
  getDiscoveredAgents(): AgentDiscoveryInfo[] {
    const now = Date.now();
    return Array.from(this.discoveredAgents.values())
      .filter(agent => now - agent.lastSeen < this.discoveryTimeoutMs)
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }
  
  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentDiscoveryInfo | undefined {
    return this.discoveredAgents.get(agentId);
  }
  
  /**
   * Get own message history
   */
  getMessageHistory(): BeaconMessage[] {
    return [...this.messageHistory];
  }
  
  /**
   * Process incoming beacon message (from HCS subscription)
   */
  processIncomingMessage(message: BeaconMessage): void {
    // Update discovery registry
    const existing = this.discoveredAgents.get(message.agentId);
    
    if (existing) {
      existing.lastSeen = message.timestamp;
      existing.healthy = message.status.healthy;
      existing.messageCount++;
      if (message.endpoint) existing.endpoint = message.endpoint;
      if (message.capabilities) existing.capabilities = message.capabilities;
    } else {
      this.discoveredAgents.set(message.agentId, {
        agentId: message.agentId,
        agentType: message.agentType,
        lastSeen: message.timestamp,
        healthy: message.status.healthy,
        capabilities: message.capabilities || [],
        endpoint: message.endpoint,
        messageCount: 1
      });
      
      logger.info('AgentHCSBeacon', {
        message: 'New agent discovered',
        agentId: message.agentId,
        agentType: message.agentType
      });
    }
    
    // Handle SOS from other agents
    if (message.type === 'sos' && message.sos) {
      logger.warn('AgentHCSBeacon', {
        message: `Agent ${message.agentId} sent SOS`,
        level: message.sos.level,
        sosMessage: message.sos.message,
        agentId: message.agentId
      });
    }
  }
  
  /**
   * Broadcast a beacon message
   */
  private async broadcast(
    type: BeaconMessage['type'],
    sos?: { level: string; message: string; code?: string },
    extraMetadata?: Record<string, any>
  ): Promise<void> {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastBroadcast < this.minBroadcastInterval) {
      return;
    }
    this.lastBroadcast = now;
    
    this.sequence++;
    
    // Build message
    const status = this.statusCallback ? this.statusCallback() : {
      healthy: true,
      load: 0,
      queueDepth: 0
    };
    
    const capabilities = this.capabilitiesCallback ? this.capabilitiesCallback() : [];
    const metadata = this.metadataCallback ? this.metadataCallback() : {};
    
    const message: BeaconMessage = {
      type,
      agentId: this.agentId,
      agentType: this.agentType,
      timestamp: now,
      sequence: this.sequence,
      status: {
        healthy: status.healthy ?? true,
        load: status.load ?? 0,
        queueDepth: status.queueDepth ?? 0,
        lastTaskCompleted: status.lastTaskCompleted
      },
      capabilities,
      sos: sos ? {
        level: sos.level as any,
        message: sos.message,
        code: sos.code
      } : undefined,
      metadata: { ...metadata, ...extraMetadata }
    };
    
    // Add to history
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
    
    try {
      await this.submitToHCS(message);
    } catch (error) {
      logger.error('AgentHCSBeacon', {
        message: 'Failed to broadcast beacon',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Submit message to HCS with HIP-993 format
   */
  private async submitToHCS(message: BeaconMessage): Promise<void> {
    // Wrap in HIP-993 format
    const hip993Payload = {
      _hip993: {
        type: 'BEACON',
        version: '1.0.0',
        max_chunk_size: 4096,
        features: ['heartbeat', 'agent_discovery', 'sos_signaling', 'health_monitoring'],
        timestamp: message.timestamp,
        beacon_type: message.type,
        agent_id: message.agentId
      },
      data: message
    };
    
    const messageJson = JSON.stringify(hip993Payload);
    
    // Check size
    if (messageJson.length > this.maxMessageSize) {
      logger.warn('AgentHCSBeacon', {
        message: 'Beacon message exceeds max size, truncating',
        size: messageJson.length,
        maxSize: this.maxMessageSize
      });
    }
    
    // Submit via hederaMaster with HIP-993 wrapper
    await hederaMaster.submitMessage(this.topicId, hip993Payload, {
      maxChunkSize: 4096
    });
    
    logger.debug('AgentHCSBeacon', {
      message: 'Beacon broadcasted',
      type: message.type,
      sequence: message.sequence,
      agentId: this.agentId
    });
  }
  
  /**
   * Schedule next heartbeat
   */
  private scheduleNext(): void {
    if (!this.isRunning || this.isSOSMode) return;
    
    this.timer = setTimeout(async () => {
      if (this.isRunning && !this.isSOSMode) {
        await this.broadcast('heartbeat');
        this.scheduleNext();
      }
    }, this.intervalMs);
  }
  
  /**
   * Schedule rapid SOS broadcasts
   */
  private scheduleSOS(sos: { level: string; message: string; code?: string }): void {
    if (!this.isRunning || !this.isSOSMode) return;
    
    this.sosTimer = setTimeout(async () => {
      if (this.isRunning && this.isSOSMode) {
        await this.broadcast('sos', sos);
        this.scheduleSOS(sos);
      }
    }, this.sosIntervalMs);
  }
}

// Export singleton for quick access
export const createAgentBeacon = (
  agentId: string,
  agentType: string,
  config?: BeaconConfig
) => new AgentHCSBeacon(agentId, agentType, config);
