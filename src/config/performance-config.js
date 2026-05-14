
// Performance Optimization Configuration
export const PERFORMANCE_CONFIG = {
  // Quantum Duet Optimization
  quantumDuet: {
    pollingInterval: 500,
    batchSize: 250,
    cacheSize: 5000,
    parallelProcessing: true,
    priorityScoring: true
  },
  
  // Caching Optimization
  caching: {
    strategy: 'lru',
    maxSize: 10000,
    ttl: 300000, // 5 minutes
    compression: true
  },
  
  // Parallel Processing
  parallel: {
    maxWorkers: 4,
    queueSize: 1000,
    timeout: 30000
  },
  
  // Resource Management
  resources: {
    maxMemory: '2GB',
    maxCPU: 80,
    gcInterval: 60000
  },
  
  // Load Balancing
  loadBalancing: {
    strategy: 'round-robin',
    healthCheck: 30000,
    failover: true
  },
  
  // Monitoring
  monitoring: {
    metricsInterval: 5000,
    alertThresholds: {
      responseTime: 1000,
      errorRate: 0.05,
      memoryUsage: 0.8
    }
  }
};

export default PERFORMANCE_CONFIG;
