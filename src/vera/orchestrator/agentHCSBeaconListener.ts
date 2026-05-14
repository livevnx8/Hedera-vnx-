/**
 * Agent HCS Beacon Listener
 * 
 * Subscribes to HCS topic and processes beacon messages from other agents.
 * Provides real-time agent discovery and health monitoring.
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Message deduplication
 * - Agent health tracking with timeout detection
 * - Event-driven architecture
 */

import { TopicMessageQuery } from '@hashgraph/sdk';
import { getClient } from '../../hedera/tools/client.js';
import { logger } from '../../monitoring/logger.js';
import { BeaconMessage, AgentDiscoveryInfo, AgentHCSBeacon } from './agentHCSBeacon.js';

export interface BeaconListenerConfig {
  topicId: string;
  reconnectIntervalMs?: number;
  maxReconnectDelayMs?: number;
  agentTimeoutMs?: number;
  enableDedup?: boolean;
  dedupWindowMs?: number;
  enableAutoCleanup?: boolean;
  cleanupIntervalMs?: number;
  enableRecoveryTracking?: boolean;
  recoveryAttemptsBeforeAlert?: number;
}

export interface BeaconListenerEvents {
  onAgentDiscovered?: (agent: AgentDiscoveryInfo) => void;
  onAgentUpdated?: (agent: AgentDiscoveryInfo) => void;
  onAgentTimeout?: (agentId: string) => void;
  onSOS?: (message: BeaconMessage) => void;
  onMessage?: (message: BeaconMessage) => void;
  onError?: (error: Error) => void;
  onReconnect?: (attempt: number) => void;
}

export class AgentHCSBeaconListener {
  private topicId: string;
  private reconnectIntervalMs: number;
  private maxReconnectDelayMs: number;
  private agentTimeoutMs: number;
  private enableDedup: boolean;
  private dedupWindowMs: number;
  
  private enableAutoCleanup: boolean;
  private cleanupIntervalMs: number;
  private enableRecoveryTracking: boolean;
  private recoveryAttemptsBeforeAlert: number;
  
  private recoveryAttempts = new Map<string, number>();
  private agentHealthScores = new Map<string, number>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  private events: BeaconListenerEvents;
  private discoveredAgents = new Map<string, AgentDiscoveryInfo>();
  private seenSequences = new Map<string, number>(); // agentId -> last sequence
  private seenTimestamps = new Map<string, number>(); // For dedup
  private isRunning = false;
  private isConnecting = false;
  private unsubscribe: (() => void) | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private timeoutCheckTimer: NodeJS.Timeout | null = null;
  private beaconRefs: Map<string, AgentHCSBeacon> = new Map();
  
  constructor(
    config: BeaconListenerConfig,
    events: BeaconListenerEvents = {}
  ) {
    this.topicId = config.topicId;
    this.reconnectIntervalMs = config.reconnectIntervalMs || 5000;
    this.maxReconnectDelayMs = config.maxReconnectDelayMs || 60000;
    this.agentTimeoutMs = config.agentTimeoutMs || 300000; // 5 min default
    this.enableDedup = config.enableDedup !== false;
    this.dedupWindowMs = config.dedupWindowMs || 60000; // 1 min dedup window
    this.enableAutoCleanup = config.enableAutoCleanup ?? true;
    this.cleanupIntervalMs = config.cleanupIntervalMs || 60000;
    this.enableRecoveryTracking = config.enableRecoveryTracking ?? true;
    this.recoveryAttemptsBeforeAlert = config.recoveryAttemptsBeforeAlert || 3;
    this.events = events;
  }
  
  /**
   * Start listening for beacon messages
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.reconnectAttempt = 0;
    
    await this.connect();
    this.startTimeoutChecker();
    this.startCleanupTimer();
    
    logger.info('AgentHCSBeaconListener', {
      message: 'Beacon listener started',
      topicId: this.topicId
    });
  }
  
  /**
   * Stop listening
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.timeoutCheckTimer) {
      clearInterval(this.timeoutCheckTimer);
      this.timeoutCheckTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    logger.info('AgentHCSBeaconListener', {
      message: 'Beacon listener stopped'
    });
  }
  
  /**
   * Register a local beacon to receive its own messages
   */
  registerBeacon(beacon: AgentHCSBeacon): void {
    // Access agentId through a getter or public property
    const beaconId = (beacon as any).agentId || 'unknown';
    this.beaconRefs.set(beaconId, beacon);
  }
  
  /**
   * Get all discovered agents
   */
  getDiscoveredAgents(): AgentDiscoveryInfo[] {
    return Array.from(this.discoveredAgents.values())
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }
  
  /**
   * Get healthy agents only
   */
  getHealthyAgents(): AgentDiscoveryInfo[] {
    return this.getDiscoveredAgents().filter(a => a.healthy);
  }
  
  /**
   * Get agents by type
   */
  getAgentsByType(type: string): AgentDiscoveryInfo[] {
    return this.getDiscoveredAgents().filter(a => a.agentType === type);
  }
  
  /**
   * Get agents with specific capability
   */
  getAgentsByCapability(capability: string): AgentDiscoveryInfo[] {
    return this.getDiscoveredAgents().filter(a => 
      a.capabilities.includes(capability)
    );
  }
  
  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentDiscoveryInfo | undefined {
    return this.discoveredAgents.get(agentId);
  }
  
  /**
   * Check if agent is healthy
   */
  isAgentHealthy(agentId: string): boolean {
    const agent = this.discoveredAgents.get(agentId);
    if (!agent) return false;
    return agent.healthy && (Date.now() - agent.lastSeen) < this.agentTimeoutMs;
  }
  
  /**
   * Find best agent for a task based on capabilities and health
   */
  findBestAgent(
    requiredCapabilities: string[],
    options: { excludeAgentId?: string; maxLoad?: number } = {}
  ): AgentDiscoveryInfo | null {
    const candidates = this.getHealthyAgents()
      .filter(a => a.agentId !== options.excludeAgentId)
      .filter(a => requiredCapabilities.every(cap => a.capabilities.includes(cap)));
    
    if (candidates.length === 0) return null;
    
    // Sort by load (assuming we track this in future) and last seen
    return candidates.sort((a, b) => {
      // Prefer agents we've seen more recently
      return b.lastSeen - a.lastSeen;
    })[0];
  }
  
  /**
   * Connect to HCS topic
   */
  private async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;
    
    try {
      const client = getClient();
      
      const query = new TopicMessageQuery()
        .setTopicId(this.topicId)
        .setStartTime(0); // From beginning
      
      // Subscribe to messages
      const handle = query.subscribe(
        client,
        (message) => {
          try {
            const contents = message.contents.toString();
            const beaconMessage: BeaconMessage = JSON.parse(contents);
            this.processMessage(beaconMessage);
          } catch (error) {
            logger.warn('AgentHCSBeaconListener', {
              message: 'Failed to parse beacon message',
              error: error instanceof Error ? error.message : String(error)
            });
          }
        },
        (error) => {
          // Sometimes the SDK passes message data to error callback
          // Check if this is actually a message
          if (error && typeof error === 'object' && 'contents' in error && 'consensusTimestamp' in error) {
            try {
              const msg = error as any;
              const contents = msg.contents.toString();
              const beaconMessage: BeaconMessage = JSON.parse(contents);
              this.processMessage(beaconMessage);
              return; // Don't treat as error
            } catch {
              // Failed to parse as message, treat as actual error
            }
          }
          
          const errorMsg = typeof error === 'object' && error !== null 
            ? JSON.stringify(error).slice(0, 200)
            : String(error);
          logger.error('AgentHCSBeaconListener', {
            message: 'HCS subscription error',
            error: errorMsg
          });
          this.handleError(new Error(errorMsg));
        }
      );
      
      // Store unsubscribe function
      this.unsubscribe = () => {
        try {
          handle.unsubscribe();
        } catch {
          // Ignore unsubscribe errors
        }
      };
      
      this.reconnectAttempt = 0;
      
      logger.info('AgentHCSBeaconListener', {
        message: 'Connected to HCS topic',
        topicId: this.topicId
      });
      
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isConnecting = false;
    }
  }
  
  /**
   * Process incoming beacon message
   */
  private processMessage(message: BeaconMessage): void {
    // Dedup check
    if (this.enableDedup) {
      const dedupKey = `${message.agentId}:${message.timestamp}`;
      const lastSeen = this.seenTimestamps.get(dedupKey);
      
      if (lastSeen && (Date.now() - lastSeen) < this.dedupWindowMs) {
        return; // Duplicate, skip
      }
      
      this.seenTimestamps.set(dedupKey, Date.now());
      
      // Cleanup old dedup entries
      if (this.seenTimestamps.size > 10000) {
        const cutoff = Date.now() - this.dedupWindowMs;
        for (const [key, ts] of this.seenTimestamps.entries()) {
          if (ts < cutoff) this.seenTimestamps.delete(key);
        }
      }
    }
    
    // Sequence check
    const lastSequence = this.seenSequences.get(message.agentId);
    if (lastSequence && message.sequence <= lastSequence) {
      // Out of order or duplicate sequence
      logger.debug('AgentHCSBeaconListener', {
        message: 'Out of order beacon received',
        agentId: message.agentId,
        expected: lastSequence + 1,
        received: message.sequence
      });
    }
    this.seenSequences.set(message.agentId, message.sequence);
    
    // Update discovery registry
    const existing = this.discoveredAgents.get(message.agentId);
    const wasNew = !existing;
    
    const agentInfo: AgentDiscoveryInfo = {
      agentId: message.agentId,
      agentType: message.agentType,
      lastSeen: message.timestamp,
      healthy: message.status.healthy,
      capabilities: message.capabilities || [],
      endpoint: message.endpoint,
      messageCount: existing ? existing.messageCount + 1 : 1
    };
    
    this.discoveredAgents.set(message.agentId, agentInfo);
    
    // Forward to registered beacon if exists
    const beacon = this.beaconRefs.get(message.agentId);
    if (beacon) {
      beacon.processIncomingMessage(message);
    }
    
    // Emit events
    if (this.events.onMessage) {
      this.events.onMessage(message);
    }
    
    if (wasNew && this.events.onAgentDiscovered) {
      this.events.onAgentDiscovered(agentInfo);
    } else if (!wasNew && this.events.onAgentUpdated) {
      this.events.onAgentUpdated(agentInfo);
    }
    
    // Handle SOS
    if (message.type === 'sos' && message.sos && this.events.onSOS) {
      this.events.onSOS(message);
    }
    
    // Log discovery
    if (wasNew) {
      logger.info('AgentHCSBeaconListener', {
        message: 'New agent discovered via HCS',
        agentId: message.agentId,
        agentType: message.agentType,
        capabilities: message.capabilities
      });
    }
  }
  
  /**
   * Handle connection error with exponential backoff
   */
  private handleError(error: Error): void {
    if (this.events.onError) {
      this.events.onError(error);
    }
    
    if (!this.isRunning) return;
    
    // Clear any pending reconnect to avoid multiple simultaneous connections
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.reconnectAttempt++;
    const delay = Math.min(
      this.reconnectIntervalMs * Math.pow(2, this.reconnectAttempt - 1),
      this.maxReconnectDelayMs
    );
    
    logger.warn('AgentHCSBeaconListener', {
      message: 'Connection lost, scheduling reconnect',
      attempt: this.reconnectAttempt,
      delayMs: delay
    });
    
    if (this.events.onReconnect) {
      this.events.onReconnect(this.reconnectAttempt);
    }
    
    this.reconnectTimer = setTimeout(() => {
      if (this.isRunning && !this.isConnecting) {
        this.connect();
      }
    }, delay);
  }
  
  /**
   * Start periodic timeout checker with recovery tracking
   */
  private startTimeoutChecker(): void {
    this.timeoutCheckTimer = setInterval(() => {
      const now = Date.now();
      
      for (const [agentId, agent] of this.discoveredAgents.entries()) {
        const timeSinceLastSeen = now - agent.lastSeen;
        
        if (timeSinceLastSeen > this.agentTimeoutMs) {
          // Agent timed out - track recovery attempts
          if (this.enableRecoveryTracking) {
            const attempts = this.recoveryAttempts.get(agentId) || 0;
            this.recoveryAttempts.set(agentId, attempts + 1);
            
            if (attempts + 1 >= this.recoveryAttemptsBeforeAlert) {
              logger.error('AgentHCSBeaconListener', {
                message: 'Agent recovery threshold exceeded',
                agentId,
                recoveryAttempts: attempts + 1,
                action: 'Consider manual intervention'
              });
            }
          }
          
          logger.warn('AgentHCSBeaconListener', {
            message: 'Agent timed out',
            agentId,
            lastSeen: new Date(agent.lastSeen).toISOString(),
            recoveryAttempts: this.recoveryAttempts.get(agentId) || 0
          });
          
          if (this.events.onAgentTimeout) {
            this.events.onAgentTimeout(agentId);
          }
        } else if (timeSinceLastSeen < this.agentTimeoutMs && agent.healthy) {
          // Agent is healthy - reset recovery attempts
          if (this.enableRecoveryTracking && this.recoveryAttempts.has(agentId)) {
            this.recoveryAttempts.delete(agentId);
          }
          
          // Calculate health score based on responsiveness
          const healthScore = Math.max(0, 1 - (timeSinceLastSeen / this.agentTimeoutMs));
          this.agentHealthScores.set(agentId, healthScore);
        }
      }
    }, 30000);
  }

  /**
   * Start periodic cleanup of stale agents
   */
  private startCleanupTimer(): void {
    if (!this.enableAutoCleanup) return;
    
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [agentId, agent] of this.discoveredAgents.entries()) {
        // Remove agents that have been offline for 2x timeout
        if (now - agent.lastSeen > this.agentTimeoutMs * 2) {
          this.discoveredAgents.delete(agentId);
          this.recoveryAttempts.delete(agentId);
          this.agentHealthScores.delete(agentId);
          cleaned++;
          
          logger.info('AgentHCSBeaconListener', {
            message: 'Stale agent cleaned up',
            agentId,
            offlineDuration: Math.round((now - agent.lastSeen) / 1000) + 's'
          });
        }
      }
      
      if (cleaned > 0) {
        logger.info('AgentHCSBeaconListener', {
          message: 'Auto-cleanup completed',
          agentsRemoved: cleaned,
          remainingAgents: this.discoveredAgents.size
        });
      }
    }, this.cleanupIntervalMs);
  }

  /**
   * Get agent health score (0-1, higher is healthier)
   */
  getAgentHealthScore(agentId: string): number {
    return this.agentHealthScores.get(agentId) || 0;
  }

  /**
   * Get recovery attempts for an agent
   */
  getAgentRecoveryAttempts(agentId: string): number {
    return this.recoveryAttempts.get(agentId) || 0;
  }

  /**
   * Get system health overview
   */
  getSystemHealth(): {
    totalAgents: number;
    healthyAgents: number;
    avgHealthScore: number;
    agentsNeedingRecovery: number;
  } {
    const agents = Array.from(this.discoveredAgents.values());
    const healthy = agents.filter(a => a.healthy);
    const healthScores = Array.from(this.agentHealthScores.values());
    const avgScore = healthScores.length > 0 
      ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length 
      : 0;
    const needingRecovery = Array.from(this.recoveryAttempts.entries())
      .filter(([_, attempts]) => attempts > 0).length;
    
    return {
      totalAgents: agents.length,
      healthyAgents: healthy.length,
      avgHealthScore: avgScore,
      agentsNeedingRecovery: needingRecovery
    };
  }
}

// Export singleton creator
export const createBeaconListener = (
  config: BeaconListenerConfig,
  events?: BeaconListenerEvents
) => new AgentHCSBeaconListener(config, events);
