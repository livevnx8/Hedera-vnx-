
// Enhanced Memory System with Quantum Integration
import { qvxQuantumDuetEngine } from '../superintelligence/qvx/QVXQuantumDuetEngine.js';

class EnhancedMemorySystem {
  constructor() {
    this.quantumEngine = qvxQuantumDuetEngine;
    this.memoryCache = new Map();
    this.persistentMemory = new Map();
    this.learningHistory = [];
    this.performance = {
      hitRate: 0,
      retrievalTime: 0,
      storageEfficiency: 0
    };
  }

  async storeQuantumMemory(key, data, context = {}) {
    const memoryEntry = {
      key,
      data,
      context,
      quantumMetrics: this.quantumEngine.getCurrentQuantumMetrics(),
      timestamp: new Date().toISOString(),
      type: 'quantum-enhanced'
    };
    
    this.memoryCache.set(key, memoryEntry);
    
    // Store in persistent memory for important data
    if (context.persistent || context.importance > 0.8) {
      this.persistentMemory.set(key, memoryEntry);
    }
    
    return memoryEntry;
  }

  async retrieveQuantumMemory(key, options = {}) {
    const startTime = Date.now();
    
    // Check cache first
    let memory = this.memoryCache.get(key);
    
    if (!memory && options.checkPersistent) {
      memory = this.persistentMemory.get(key);
    }
    
    if (memory) {
      // Update performance metrics
      this.performance.hitRate = (this.performance.hitRate * 0.9) + (0.1 * 1); // Moving average
      this.performance.retrievalTime = Date.now() - startTime;
      
      // Enhance with current quantum context
      if (options.enhanceWithQuantum) {
        const quantumContext = this.quantumEngine.getCurrentQuantumMetrics();
        memory.quantumContext = quantumContext;
      }
      
      return memory;
    }
    
    // Update miss rate
    this.performance.hitRate = (this.performance.hitRate * 0.9) + (0.1 * 0);
    this.performance.retrievalTime = Date.now() - startTime;
    
    return null;
  }

  async intelligentSearch(query, options = {}) {
    const results = [];
    
    // Search through memory cache
    for (const [key, memory] of this.memoryCache) {
      if (this.matchesQuery(memory, query, options)) {
        results.push({
          key,
          memory,
          relevance: this.calculateRelevance(memory, query),
          source: 'cache'
        });
      }
    }
    
    // Search through persistent memory if needed
    if (options.includePersistent) {
      for (const [key, memory] of this.persistentMemory) {
        if (this.matchesQuery(memory, query, options) && !results.find(r => r.key === key)) {
          results.push({
            key,
            memory,
            relevance: this.calculateRelevance(memory, query),
            source: 'persistent'
          });
        }
      }
    }
    
    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    
    return results.slice(0, options.limit || 10);
  }

  matchesQuery(memory, query, options) {
    const searchText = query.toLowerCase();
    const memoryText = JSON.stringify(memory).toLowerCase();
    
    // Simple text matching
    if (memoryText.includes(searchText)) {
      return true;
    }
    
    // Semantic matching (simplified)
    if (options.semanticSearch) {
      return this.semanticMatch(memory, query);
    }
    
    return false;
  }

  semanticMatch(memory, query) {
    // Simplified semantic matching
    const memoryKeywords = this.extractKeywords(memory);
    const queryKeywords = this.extractKeywords({ query });
    
    const intersection = memoryKeywords.filter(k => queryKeywords.includes(k));
    return intersection.length > 0;
  }

  extractKeywords(obj) {
    const text = JSON.stringify(obj).toLowerCase();
    const keywords = text.match(/\b\w+\b/g) || [];
    return [...new Set(keywords)];
  }

  calculateRelevance(memory, query) {
    let relevance = 0;
    
    // Time relevance (more recent = higher relevance)
    const age = Date.now() - new Date(memory.timestamp).getTime();
    const timeScore = Math.max(0, 1 - (age / (24 * 60 * 60 * 1000))); // 1 day = 0 relevance
    relevance += timeScore * 0.3;
    
    // Content relevance
    const contentScore = this.calculateContentRelevance(memory, query);
    relevance += contentScore * 0.5;
    
    // Quantum relevance (if quantum metrics available)
    if (memory.quantumMetrics) {
      const quantumScore = memory.quantumMetrics.duet_efficiency || 0.5;
      relevance += quantumScore * 0.2;
    }
    
    return Math.min(1, relevance);
  }

  calculateContentRelevance(memory, query) {
    const memoryText = JSON.stringify(memory).toLowerCase();
    const queryText = query.toLowerCase();
    
    // Simple relevance calculation
    const matches = (memoryText.match(new RegExp(queryText, 'g')) || []).length;
    const maxLength = Math.max(memoryText.length, queryText.length);
    
    return matches / maxLength;
  }

  async getMemoryPerformance() {
    const totalMemory = this.memoryCache.size + this.persistentMemory.size;
    const cacheSize = this.memoryCache.size;
    const persistentSize = this.persistentMemory.size;
    
    return {
      totalEntries: totalMemory,
      cacheEntries: cacheSize,
      persistentEntries: persistentSize,
      hitRate: this.performance.hitRate,
      retrievalTime: this.performance.retrievalTime,
      storageEfficiency: this.calculateStorageEfficiency()
    };
  }

  calculateStorageEfficiency() {
    // Simple efficiency calculation based on hit rate and storage usage
    return this.performance.hitRate * (1 - (this.memoryCache.size / 10000)); // Assume 10k cache limit
  }

  async cleanup() {
    // Clean up old or low-relevance memories
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    for (const [key, memory] of this.memoryCache) {
      const age = now - new Date(memory.timestamp).getTime();
      if (age > maxAge && memory.context.importance < 0.5) {
        this.memoryCache.delete(key);
      }
    }
    
    this.performance.storageEfficiency = this.calculateStorageEfficiency();
  }
}

export default EnhancedMemorySystem;
