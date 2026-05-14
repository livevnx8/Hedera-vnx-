/**
 * Vera Hot Topics Radar - Type Definitions
 *
 * Core types for the high-volume workflow detection and monitoring system.
 */

export type WorkflowType =
  | 'McLaren-carbon-audit'
  | 'McLaren-telemetry'
  | 'FedEx-route-optim'
  | 'FedEx-compliance'
  | 'FedEx-package-track'
  | 'DeFi-whale-spike'
  | 'DeFi-swap-activity'
  | 'DeFi-liquidity-move'
  | 'NFT-mint-surge'
  | 'HCS-consensus-heavy'
  | 'unknown';

export type ActionFlag = 'monitor' | 'alert' | 'investigate' | 'ignore';

export interface HotTopicEntry {
  topicId: string;
  msgsHour: number;
  delta: number;
  deltaFormatted: string;
  workflow: WorkflowType;
  action: ActionFlag;
  lastSeen: string;
  metadata?: Record<string, unknown>;
}

export interface NewTopicDiscovery {
  topicId: string;
  discoveredAt: string;
  initialVolume: number;
  classification: WorkflowType;
  confidence: number;
  source: 'auto-discovery' | 'manual' | 'agent-report';
}

export interface HotTopicsScanResult {
  type: 'hot-scan' | 'hot-init' | 'hot-alert';
  scanTime: string;
  scanTimestamp: number;
  highVolume: HotTopicEntry[];
  newTopics: NewTopicDiscovery[];
  summary: string;
  threshold: number;
  alertThreshold: number;
  totalMonitored: number;
  metrics?: {
    scanDurationMs: number;
    topicsChecked: number;
    mirrorCalls: number;
    errors: number;
  };
}

export interface HotTopicsConfig {
  topicId?: string | null;
  pollIntervalMs: number;
  volumeThreshold: number;
  alertThreshold: number;
  maxMonitored: number;
  autoDiscovery: boolean;
  autoDiscoveryIntervalHours: number;
  mirrorNodeUrls: string[];
  monitoredTopics: string[];
  workflowPatterns: WorkflowPattern[];
  backoffMs: number;
  maxBackoffMs: number;
  // Mirror node config inherited from main config
  MIRROR_NODE_BASE_URL?: string;
}

export interface WorkflowPattern {
  pattern: RegExp;
  workflow: WorkflowType;
  confidence: number;
  keywords: string[];
}

export interface VolumeDelta {
  topicId: string;
  previousCount: number;
  currentCount: number;
  delta: number;
  timeWindowHours: number;
}

export interface TopicClassification {
  topicId: string;
  workflow: WorkflowType;
  confidence: number;
  matchedPatterns: string[];
  samplePayloads: unknown[];
}

export interface HotTopicsCursor {
  topicId: string;
  lastSequenceNumber: number;
  lastPollTime: number;
  messageCount: number;
  volumeHistory: Array<{ timestamp: number; count: number }>;
  classification?: TopicClassification;
}

export interface MirrorFetchResult {
  topicId: string;
  messages: Array<{
    sequenceNumber: number;
    consensusTimestamp: string;
    payload: unknown;
    decoded: string | null;
  }>;
  nextCursor: string | null;
  fetchedAt: number;
}

export interface VolumeSpikeEvent {
  topicId: string;
  previousVolume: number;
  currentVolume: number;
  spikeFactor: number;
  timestamp: number;
  classification: WorkflowType;
}

// Default configuration values
export const DEFAULT_HOT_TOPICS_CONFIG: Partial<HotTopicsConfig> = {
  pollIntervalMs: 300000, // 5 minutes
  volumeThreshold: 100, // msgs/hour
  alertThreshold: 200, // msgs/hour for alert
  maxMonitored: 50,
  autoDiscovery: true,
  autoDiscoveryIntervalHours: 168, // 1 week
  mirrorNodeUrls: [
    'https://mainnet-public.mirrornode.hedera.com',
    'https://mainnet.mirrornode.hedera.com',
  ],
  backoffMs: 30000, // 30 seconds
  maxBackoffMs: 300000, // 5 minutes
};

// Default workflow patterns for classification
export const DEFAULT_WORKFLOW_PATTERNS: WorkflowPattern[] = [
  {
    pattern: /carbon|emission|co2|offset/i,
    workflow: 'McLaren-carbon-audit',
    confidence: 0.9,
    keywords: ['carbon', 'emission', 'co2', 'offset', 'audit'],
  },
  {
    pattern: /telemetry|sensor|mclaren|racing/i,
    workflow: 'McLaren-telemetry',
    confidence: 0.85,
    keywords: ['telemetry', 'sensor', 'mclaren', 'racing', 'f1'],
  },
  {
    pattern: /fedex|route|delivery|logistics/i,
    workflow: 'FedEx-route-optim',
    confidence: 0.9,
    keywords: ['fedex', 'route', 'delivery', 'logistics', 'shipping'],
  },
  {
    pattern: /fedex|compliance|regulatory|customs/i,
    workflow: 'FedEx-compliance',
    confidence: 0.85,
    keywords: ['fedex', 'compliance', 'regulatory', 'customs', 'border'],
  },
  {
    pattern: /fedex|package|tracking|parcel/i,
    workflow: 'FedEx-package-track',
    confidence: 0.8,
    keywords: ['fedex', 'package', 'tracking', 'parcel', 'shipment'],
  },
  {
    pattern: /defi|whale|large.*transfer|swap.*big/i,
    workflow: 'DeFi-whale-spike',
    confidence: 0.85,
    keywords: ['defi', 'whale', 'large', 'transfer', 'swap'],
  },
  {
    pattern: /defi|swap|dex|liquidity.*pool/i,
    workflow: 'DeFi-swap-activity',
    confidence: 0.8,
    keywords: ['defi', 'swap', 'dex', 'liquidity', 'pool'],
  },
  {
    pattern: /defi|liquidity|move|migrate/i,
    workflow: 'DeFi-liquidity-move',
    confidence: 0.75,
    keywords: ['defi', 'liquidity', 'move', 'migrate', 'bridge'],
  },
  {
    pattern: /nft|mint|collection|drop/i,
    workflow: 'NFT-mint-surge',
    confidence: 0.8,
    keywords: ['nft', 'mint', 'collection', 'drop', 'tokenize'],
  },
  {
    pattern: /hcs|consensus|message.*heavy|topic.*load/i,
    workflow: 'HCS-consensus-heavy',
    confidence: 0.7,
    keywords: ['hcs', 'consensus', 'message', 'topic', 'heavy'],
  },
];

// Initial monitored topics from the plan
export const INITIAL_MONITORED_TOPICS: string[] = [
  '0.0.10414316', // McLaren carbon audit
  '0.0.10414355', // FedEx route optimization
];
