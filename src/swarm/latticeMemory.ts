/**
 * Vera Lattice Memory Layer
 * 
 * Geometric recall system using HCS as persistent lattice storage.
 * Agents "remember" by projecting past events into half-spaces.
 * 
 * Key Features:
 * - Lattice recall: intersect intent vectors to find relevant memories
 * - HCS as persistent grid: compressed lattice diffs stored immutably
 * - Meet-based querying: find memories by constraint intersection
 * - No drift: geometric representation stays stable over time
 */

import { logger } from '../monitoring/logger.js';
import { veraHCS } from '../dovu/veraHCS.js';
import { LatticeNode } from './latticeSwarm.js';

// Memory entry in the lattice
export interface LatticeMemory {
  id: string;
  embedding: number[];    // Concept vector
  timestamp: number;
  intent: string;         // What this memory represents
  context: any;           // Full context (compressed)
  agentId: string;        // Which agent created this
  hcsSequence: number;    // HCS sequence number for verification
}

// Query for geometric recall
export interface LatticeQuery {
  intent: string;
  embedding: number[];    // Query point
  threshold: number;      // Minimum similarity
  timeWindow?: number;    // Look back this many ms
  agentFilter?: string[]; // Specific agents
}

// Recall result with meet scores
export interface RecallResult {
  memories: LatticeMemory[];
  meetScores: number[];   // How well each memory matches query
  aggregatedIntent: string; // Join of all matching intents
}

/**
 * Vera Lattice Memory - Geometric recall system
 */
export class VeraLatticeMemory {
  private memories: Map<string, LatticeMemory> = new Map();
  private intentIndex: Map<string, Set<string>> = new Map(); // Intent -> memory IDs
  private embeddingDim: number = 128;
  private hcsTopicId: string | null = null;

  async initialize(): Promise<void> {
    logger.info('VeraLatticeMemory', { message: 'Initializing geometric memory layer...' });

    // Initialize HCS
    await veraHCS.initialize();

    logger.info('VeraLatticeMemory', {
      memories: this.memories.size,
      message: 'Lattice memory ready'
    });
  }

  /**
   * Store memory as lattice point
   * Compresses full context to delta shift, logs to HCS
   */
  async storeMemory(
    agentId: string,
    intent: string,
    embedding: number[],
    context: any
  ): Promise<string> {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const memory: LatticeMemory = {
      id,
      embedding: [...embedding], // Copy
      timestamp: Date.now(),
      intent,
      context: this.compressContext(context),
      agentId,
      hcsSequence: 0 // Will be updated after HCS submit
    };

    // Store locally
    this.memories.set(id, memory);
    this.indexIntent(intent, id);

    // Log to HCS as lattice diff
    const hcsSequence = await this.logToHCS('store', {
      id,
      agentId,
      intent,
      embedding: embedding.slice(0, 5), // Compressed
      timestamp: memory.timestamp
    });
    
    memory.hcsSequence = hcsSequence || 0;

    logger.debug('VeraLatticeMemory', { id, intent, agentId, message: 'Memory stored' });
    return id;
  }

  /**
   * Geometric recall: Find memories by intersecting intent vectors
   * Uses meet operation to find overlapping constraints
   */
  async recall(query: LatticeQuery): Promise<RecallResult> {
    const candidates = this.findCandidates(query);
    const scored = this.scoreByMeet(query, candidates);
    
    // Filter by threshold
    const matches = scored.filter(s => s.score >= query.threshold);
    
    // Sort by meet score (highest first)
    matches.sort((a, b) => b.score - a.score);

    // Get full memory objects
    const memories = matches.map(m => this.memories.get(m.memoryId)!);
    
    // Join intents of all matches
    const aggregatedIntent = this.joinIntents(memories.map(m => m.intent));

    logger.debug('VeraLatticeMemory', {
      query: query.intent,
      candidates: candidates.length,
      matches: matches.length,
      message: 'Geometric recall completed'
    });

    return {
      memories,
      meetScores: matches.map(m => m.score),
      aggregatedIntent
    };
  }

  /**
   * Recall by example: "Find memories similar to this event"
   */
  async recallByExample(
    exampleEmbedding: number[],
    threshold: number = 0.7
  ): Promise<RecallResult> {
    return this.recall({
      intent: 'similarity_search',
      embedding: exampleEmbedding,
      threshold
    });
  }

  /**
   * Recall by intent intersection: "Find security-related memories"
   */
  async recallByIntent(
    intentQuery: string,
    threshold: number = 0.6
  ): Promise<RecallResult> {
    // Generate embedding for intent query
    const queryEmbedding = this.intentToEmbedding(intentQuery);
    
    return this.recall({
      intent: intentQuery,
      embedding: queryEmbedding,
      threshold
    });
  }

  /**
   * Meet-based aggregation: Combine multiple memories
   */
  meetMemories(memoryIds: string[]): LatticeNode | null {
    const nodes = memoryIds
      .map(id => this.memories.get(id))
      .filter((m): m is LatticeMemory => !!m);

    if (nodes.length === 0) return null;

    // Calculate element-wise minimum (intersection)
    const resultEmbedding = nodes[0].embedding.map((_, i) => 
      Math.min(...nodes.map(n => n.embedding[i]))
    );

    return {
      id: `meet-${Date.now()}`,
      role: 'analyst',
      tier: 2,
      embedding: resultEmbedding,
      extent: Array.from({ length: this.embeddingDim }, () => 0.5),
      intent: `meet_${nodes.map(n => n.intent).join('_')}`,
      confidence: this.averageSimilarity(nodes.map(n => n.embedding)),
      timestamp: Date.now(),
      children: memoryIds
    };
  }

  /**
   * Join-based aggregation: Union of multiple memories
   */
  joinMemories(memoryIds: string[]): LatticeNode | null {
    const nodes = memoryIds
      .map(id => this.memories.get(id))
      .filter((m): m is LatticeMemory => !!m);

    if (nodes.length === 0) return null;

    // Calculate element-wise maximum (union)
    const resultEmbedding = nodes[0].embedding.map((_, i) => 
      Math.max(...nodes.map(n => n.embedding[i]))
    );

    return {
      id: `join-${Date.now()}`,
      role: 'planner',
      tier: 3,
      embedding: resultEmbedding,
      extent: Array.from({ length: this.embeddingDim }, () => 0.8),
      intent: `join_${nodes.map(n => n.intent).join('_')}`,
      confidence: Math.max(...nodes.map(n => 
        this.cosineSimilarity(n.embedding, resultEmbedding)
      )),
      timestamp: Date.now(),
      children: memoryIds
    };
  }

  /**
   * Temporal lattice query: "What happened in last X hours?"
   */
  async recallTemporal(
    timeWindowMs: number,
    intentFilter?: string
  ): Promise<RecallResult> {
    const cutoff = Date.now() - timeWindowMs;
    
    let candidates = Array.from(this.memories.values())
      .filter(m => m.timestamp >= cutoff);

    if (intentFilter) {
      candidates = candidates.filter(m => 
        m.intent.includes(intentFilter) || intentFilter.includes(m.intent)
      );
    }

    // Create query embedding from temporal context
    const queryEmbedding = this.generateTemporalEmbedding(cutoff);
    
    const matches = candidates.map(m => ({
      memory: m,
      score: this.cosineSimilarity(queryEmbedding, m.embedding)
    })).filter(m => m.score > 0.5);

    matches.sort((a, b) => b.score - a.score);

    return {
      memories: matches.map(m => m.memory),
      meetScores: matches.map(m => m.score),
      aggregatedIntent: `temporal_recall_${cutoff}`
    };
  }

  // Private helpers

  private findCandidates(query: LatticeQuery): LatticeMemory[] {
    let candidates: LatticeMemory[] = [];

    // If we have specific intents to search
    if (this.intentIndex.has(query.intent)) {
      const ids = this.intentIndex.get(query.intent)!;
      candidates = Array.from(ids)
        .map(id => this.memories.get(id))
        .filter((m): m is LatticeMemory => !!m);
    }

    // Filter by time window
    if (query.timeWindow) {
      const cutoff = Date.now() - query.timeWindow;
      candidates = candidates.filter(m => m.timestamp >= cutoff);
    }

    // Filter by agent
    if (query.agentFilter && query.agentFilter.length > 0) {
      candidates = candidates.filter(m => 
        query.agentFilter!.includes(m.agentId)
      );
    }

    // If no intent matches, search all memories
    if (candidates.length === 0) {
      candidates = Array.from(this.memories.values());
    }

    return candidates;
  }

  private scoreByMeet(
    query: LatticeQuery,
    candidates: LatticeMemory[]
  ): Array<{ memoryId: string; score: number }> {
    return candidates.map(memory => {
      // Meet score = similarity between query and memory
      const score = this.cosineSimilarity(query.embedding, memory.embedding);
      return { memoryId: memory.id, score };
    });
  }

  private indexIntent(intent: string, memoryId: string): void {
    if (!this.intentIndex.has(intent)) {
      this.intentIndex.set(intent, new Set());
    }
    this.intentIndex.get(intent)!.add(memoryId);
  }

  private compressContext(context: any): any {
    // Compress full JSON to essential lattice points
    return {
      keys: Object.keys(context),
      summary: JSON.stringify(context).slice(0, 200), // Truncate
      compressed: true
    };
  }

  private async logToHCS(type: string, data: any): Promise<number | undefined> {
    try {
      const latticeDiff = {
        type: `MEMORY_${type.toUpperCase()}`,
        timestamp: Date.now(),
        delta: data,
        hash: this.hashData(data)
      };

      // Log via achievement system
      await veraHCS.logAchievement(`lattice_memory_${type}`, latticeDiff);
      
      // Return mock sequence for now
      return Date.now();
    } catch (error) {
      logger.debug('VeraLatticeMemory', { error, message: 'HCS log failed' });
      return undefined;
    }
  }

  private hashData(data: any): string {
    return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16);
  }

  private intentToEmbedding(intent: string): number[] {
    // Generate deterministic embedding from intent string
    const hash = this.hashData(intent);
    return Array.from({ length: this.embeddingDim }, (_, i) => {
      const charCode = hash.charCodeAt(i % hash.length) || 128;
      return (charCode % 256) / 256;
    });
  }

  private joinIntents(intents: string[]): string {
    // Remove duplicates and join
    const unique = [...new Set(intents)];
    return `join_${unique.join('_')}`;
  }

  private generateTemporalEmbedding(cutoff: number): number[] {
    // Temporal context as embedding
    const timeFactor = cutoff / Date.now();
    return Array.from({ length: this.embeddingDim }, (_, i) => 
      Math.max(0, Math.min(1, timeFactor + (Math.random() - 0.5) * 0.1))
    );
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  private averageSimilarity(embeddings: number[][]): number {
    if (embeddings.length < 2) return 1.0;
    
    let totalSim = 0;
    let count = 0;
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        totalSim += this.cosineSimilarity(embeddings[i], embeddings[j]);
        count++;
      }
    }
    return count > 0 ? totalSim / count : 1.0;
  }

  // Public API
  getMemoryStats(): any {
    return {
      totalMemories: this.memories.size,
      uniqueIntents: this.intentIndex.size,
      memoryIds: Array.from(this.memories.keys()).slice(0, 10) // Sample
    };
  }

  getMemoryById(id: string): LatticeMemory | undefined {
    return this.memories.get(id);
  }
}

// Export singleton
export const veraLatticeMemory = new VeraLatticeMemory();
