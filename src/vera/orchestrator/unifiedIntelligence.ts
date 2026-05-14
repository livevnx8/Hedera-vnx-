/**
 * Vera Unified Intelligence Orchestrator
 * 
 * Integrates all Vera systems into a cohesive intelligence layer:
 * - Agent Dispatcher (automatic routing)
 * - Hybrid Memory (Qdrant + Local RAG)
 * - Kùzu Graph (conversation context)
 * - Quantum Layer (session entanglement)
 * - vLLM (fast inference)
 * - crewAI (multi-agent crews)
 * 
 * @module vera/orchestrator/unifiedIntelligence
 */

import { EventEmitter } from 'events';
import { agentDispatcher, AgentIntent, DispatchResult } from '../agents/agentDispatcher.js';
import { hybridMemory, MemorySearchResult } from '../memory/hybridMemory.js';
import { kuzuEngine } from '../graph/kuzuEngine.js';
import { quantumLayer } from '../quantum/quantumLayer.js';
import { sovereignLlmRouter } from '../../llm/sovereignRouter.js';

export interface UnifiedRequest {
  message: string;
  sessionId: string;
  userId: string;
  context?: Record<string, any>;
  useAgents?: boolean;
  useMemory?: boolean;
  useGraph?: boolean;
  useQuantum?: boolean;
}

export interface UnifiedResponse {
  message: string;
  agentResult?: DispatchResult;
  memoryResults?: MemorySearchResult[];
  graphContext?: any;
  quantumState?: any;
  thinkingTrace: string[];
  metadata: {
    durationMs: number;
    provider: string;
    model: string;
    tokensUsed: number;
    sovereign: boolean;
    agentTriggered: boolean;
    memoryUsed: boolean;
    graphQueried: boolean;
    quantumEntangled: boolean;
  };
}

export class UnifiedIntelligence extends EventEmitter {
  private initialized = false;
  private sessionEntanglements = new Map<string, string[]>();

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[UnifiedIntelligence] Initializing...');

    // Initialize subsystems
    await Promise.all([
      agentDispatcher.initialize(),
      hybridMemory.initialize?.().catch(() => {}),
      kuzuEngine.initialize().catch(() => {}),
      quantumLayer.initialize().catch(() => {}),
    ]);

    this.initialized = true;
    this.emit('initialized');
    console.log('[UnifiedIntelligence] Ready');
  }

  /**
   * Process message through unified intelligence pipeline
   */
  async process(req: UnifiedRequest): Promise<UnifiedResponse> {
    const startTime = Date.now();
    const trace: string[] = [];

    // Step 1: Agent Detection & Dispatch
    trace.push('🔍 Detecting intent...');
    const intent = agentDispatcher.detectIntent(req.message);
    let agentResult: DispatchResult | undefined;

    if (req.useAgents !== false && intent.confidence > 0.3 && intent.crewName) {
      trace.push(`🤖 Dispatching to ${intent.crewName} (confidence: ${Math.round(intent.confidence * 100)}%)`);
      agentResult = await agentDispatcher.dispatch(req.message, req.context);
      trace.push(agentResult.usedAgent ? '✅ Agent team completed' : '⚠️ Agent dispatch failed');
    } else {
      trace.push('ℹ️ No agent dispatch (confidence too low or disabled)');
    }

    // Step 2: Memory Retrieval
    trace.push('💾 Querying hybrid memory...');
    let memoryResults: MemorySearchResult[] = [];
    if (req.useMemory !== false) {
      try {
        memoryResults = await hybridMemory.search(req.message, 5);
        trace.push(`✅ Retrieved ${memoryResults.length} relevant memories`);
        
        // Store this interaction
        await hybridMemory.addDocument({
          id: `chat-${Date.now()}`,
          content: `User: ${req.message}`,
          metadata: { 
            title: `Chat ${req.sessionId}`,
            source: req.userId,
            category: 'conversation' as const,
            createdAt: new Date().toISOString()
          }
        });
      } catch (e) {
        trace.push('⚠️ Memory query failed');
      }
    }

    // Step 3: Graph Context
    trace.push('🕸️ Querying knowledge graph...');
    let graphContext: any;
    if (req.useGraph !== false && intent.type !== 'none') {
      try {
        // Find related nodes by intent type
        const nodes = await kuzuEngine.execute(
          `MATCH (n:LatticeNode) WHERE n.frequency = $freq RETURN n`,
          { freq: this.intentToFrequency(intent.type) }
        );
        graphContext = { relatedNodes: nodes.rows?.length || 0, intent: intent.type };
        trace.push(`✅ Found ${nodes.rows?.length || 0} resonant nodes`);
      } catch (e) {
        trace.push('⚠️ Graph query failed');
      }
    }

    // Step 4: Quantum Session Management
    trace.push('⚛️ Checking quantum state...');
    let quantumState: any;
    if (req.useQuantum !== false) {
      try {
        // Entangle session with similar sessions
        const entangled = this.sessionEntanglements.get(req.sessionId) || [];
        
        // Create or get session node in quantum layer
        const sessionNodeId = `session-${req.sessionId}`;
        quantumLayer.entangle('core', sessionNodeId, 0.5);
        
        quantumState = quantumLayer.getState(sessionNodeId);
        trace.push(`✅ Session entangled (coherence: ${Math.round((quantumState?.coherence || 0) * 100)}%)`);
      } catch (e) {
        trace.push('⚠️ Quantum layer unavailable');
      }
    }

    const duration = Date.now() - startTime;
    trace.push(`✅ Intelligence pipeline complete (${duration}ms)`);

    this.emit('processed', {
      sessionId: req.sessionId,
      intent: intent.type,
      agentUsed: agentResult?.usedAgent || false,
      duration,
    });

    // Build enhanced context for the caller to use with LLM
    const context = this.buildEnhancedContext(req, agentResult, memoryResults, graphContext, trace);

    return {
      message: context, // The enhanced prompt/context for LLM
      agentResult,
      memoryResults: memoryResults.length > 0 ? memoryResults : undefined,
      graphContext,
      quantumState,
      thinkingTrace: trace,
      metadata: {
        durationMs: duration,
        provider: 'unified',
        model: 'intelligence-layer',
        tokensUsed: 0,
        sovereign: true,
        agentTriggered: agentResult?.usedAgent || false,
        memoryUsed: memoryResults.length > 0,
        graphQueried: !!graphContext,
        quantumEntangled: !!quantumState,
      },
    };
  }

  /**
   * Build enhanced context with all intelligence
   */
  private buildEnhancedContext(
    req: UnifiedRequest,
    agentResult?: DispatchResult,
    memories?: MemorySearchResult[],
    graphContext?: any,
    trace?: string[]
  ): string {
    const parts: string[] = [];

    // System context
    parts.push(`You are Vera, an AI assistant with access to specialized agents, memory, and a knowledge graph.`);
    parts.push(`Session: ${req.sessionId} | User: ${req.userId}`);
    parts.push('');

    // Agent context
    if (agentResult?.usedAgent) {
      parts.push(`Agent Analysis (${agentResult.intent.type}):`);
      parts.push(agentResult.response.substring(0, 500));
      parts.push('');
    }

    // Memory context
    if (memories && memories.length > 0) {
      parts.push('Relevant Context from Memory:');
      memories.slice(0, 3).forEach(m => {
        parts.push(`- ${m.content.substring(0, 100)}... (score: ${Math.round(m.score * 100)}%)`);
      });
      parts.push('');
    }

    // Graph context
    if (graphContext) {
      parts.push(`Knowledge Graph: ${graphContext.relatedNodes} related nodes found for intent "${graphContext.intent}"`);
      parts.push('');
    }

    // User message
    parts.push(`User: ${req.message}`);
    parts.push('Vera:');

    return parts.join('\n');
  }

  /**
   * Map intent to sacred frequency
   */
  private intentToFrequency(intent: string): number {
    const map: Record<string, number> = {
      carbon: 528,    // Love, healing
      defi: 432,      // Natural harmony
      compliance: 444, // Angelic frequency
      strategy: 963,   // Divine consciousness
      resonance: 528,
      code: 432,
      analysis: 444,
      none: 528,
    };
    return map[intent] || 528;
  }

  /**
   * Get system status
   */
  getStatus(): {
    initialized: boolean;
    subsystems: Record<string, boolean>;
  } {
    return {
      initialized: this.initialized,
      subsystems: {
        agentDispatcher: true,
        hybridMemory: true,
        kuzuEngine: kuzuEngine.initialized,
        quantumLayer: true,
      },
    };
  }
}

// Singleton
export const unifiedIntelligence = new UnifiedIntelligence();
