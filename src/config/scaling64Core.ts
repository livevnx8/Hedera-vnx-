/**
 * Vera 64-Core Scaling Configuration
 * Resource requirements for 5000-agent deployment
 */

export const SCALING_CONFIG_64_CORE = {
  // Compute Resources
  CPU: {
    totalCores: 64,
    reservedForSystem: 2,
    availableForAgents: 62,
    coresPerAgent: 0.0124, // 62 / 5000
  },

  // Memory Resources  
  MEMORY: {
    totalGB: 128,
    reservedForSystem: 8,
    availableForAgents: 120,
    memoryPerAgentMB: 24, // 120GB / 5000 = 24MB
    maxPerAgentMB: 128,
  },

  // Storage
  STORAGE: {
    databaseGB: 100,
    logsGB: 200,
    cacheGB: 50,
    totalGB: 350,
    type: 'NVMe',
  },

  // Network
  NETWORK: {
    bandwidthGbps: 10,
    hcsTargetTps: 100,
    mirrorNodeTimeoutMs: 5000,
  },

  // Agent Distribution
  AGENTS: {
    total: 5000,
    perShard: 100,
    totalShards: 50,
    regions: ['us-east', 'us-west', 'eu-west', 'ap-south', 'global'],
    agentsPerRegion: 1000,
    shardsPerRegion: 10,
  },

  // HCS Throughput Planning
  HCS: {
    messagesPerAgentPerMinute: 1,
    totalMessagesPerMinute: 5000,
    messagesPerSecond: 83.3,
    batchSize: 20,
    flushIntervalMs: 2000,
    topicCount: 50, // Sharded topics
  },

  // Connection Pooling
  CONNECTIONS: {
    hederaClients: 50,
    redisConnections: 100,
    maxConcurrentHcs: 100,
    maxConcurrentMirrorQueries: 50,
  },

  // Caching Strategy
  CACHE: {
    falconKeyCacheSize: 10000,
    falconKeyTtlSeconds: 86400, // 24 hours
    agentStateCacheSize: 5000,
    agentStateTtlSeconds: 300, // 5 minutes
    mirrorNodeCacheTtlSeconds: 30,
  },

  // Performance Targets
  TARGETS: {
    aiResponseTimeMs: 100,
    apiResponseTimeMs: 50,
    hcsLatencyMs: 200,
    falconHandshakeMs: 5,
    healthCheckIntervalMs: 30000,
    recoveryTimeMs: 60000,
  },

  // Cost Estimates (monthly)
  COSTS: {
    compute: 400, // USD for 64-core instance
    hcsMessages: 20, // HBAR estimate
    storage: 50, // USD
    totalEstimate: 470, // USD + HBAR
  },
};

// Docker resource limits for 64-core deployment
export const DOCKER_RESOURCES_64_CORE = {
  vera_app: {
    limits: {
      memory: '120G',
      cpus: '62',
    },
    reservations: {
      memory: '32G',
      cpus: '16',
    },
    environment: {
      NODE_OPTIONS: '--max-old-space-size=122880', // 120GB
      UV_THREADPOOL_SIZE: '128',
    },
  },
  qvx_server: {
    limits: {
      memory: '32G',
      cpus: '16',
    },
    reservations: {
      memory: '8G',
      cpus: '4',
    },
  },
  redis: {
    limits: {
      memory: '8G',
      cpus: '2',
    },
  },
};

// Validation function
export function validate64CoreConfig(): boolean {
  const config = SCALING_CONFIG_64_CORE;
  
  // Check agent math
  const totalAgents = config.AGENTS.regions.length * config.AGENTS.agentsPerRegion;
  if (totalAgents !== config.AGENTS.total) {
    throw new Error(`Agent count mismatch: ${totalAgents} !== ${config.AGENTS.total}`);
  }
  
  // Check core math
  const usedCores = config.AGENTS.total * config.CPU.coresPerAgent;
  if (usedCores > config.CPU.availableForAgents) {
    throw new Error(`Insufficient cores: ${usedCores} > ${config.CPU.availableForAgents}`);
  }
  
  // Check memory math
  const usedMemory = config.AGENTS.total * config.MEMORY.memoryPerAgentMB;
  if (usedMemory > config.MEMORY.availableForAgents * 1024) {
    throw new Error(`Insufficient memory: ${usedMemory}MB > ${config.MEMORY.availableForAgents}GB`);
  }
  
  console.log('✅ 64-core configuration validated');
  console.log(`   Agents: ${config.AGENTS.total}`);
  console.log(`   Shards: ${config.AGENTS.totalShards}`);
  console.log(`   CPU: ${config.CPU.availableForAgents} cores available`);
  console.log(`   Memory: ${config.MEMORY.availableForAgents}GB available`);
  
  return true;
}
