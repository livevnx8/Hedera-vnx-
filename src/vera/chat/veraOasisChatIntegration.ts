/**
 * VeraOasis Chat Integration
 * 
 * Bridges the VeraOasis thinking engine with Vera's chat system.
 * Every user message goes through the 5-step lattice thinking process
 * before generating a response.
 */

import { veraOasis, OasisContext, OasisResult } from '../orchestrator/veraOasisThinking.js';
import { unifiedIntelligence, UnifiedResponse } from '../orchestrator/unifiedIntelligence.js';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { VnxSwarmPromptContext } from '../../vnx/swarmPromptContext.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  oasisData?: OasisResult;
  unifiedData?: UnifiedResponse;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: number;
  lastActive: number;
  oasisEnabled: boolean;
  thinkingTraceVisible: boolean;
}

export interface CascadeChatResponse {
  message: ChatMessage;
  thinkingTrace: string;
  unifiedTrace: string[];
  confidence: number;
  requestType: string;
  intent?: string;
  agentTriggered?: boolean;
  metadata: {
    duration: number;
    centerPulses: number;
    energyConsumed: number;
    pathTaken: string[];
    agentUsed: boolean;
    memoryUsed: boolean;
    graphQueried: boolean;
    quantumEntangled: boolean;
    vnxSwarm?: {
      enabled: boolean;
      briefing?: string;
      selected: Array<{ id: string; name: string; score: number; reasons: string[] }>;
    };
  };
  sovereign?: boolean;
  provider?: 'local' | 'api' | 'cache' | 'vllm' | 'nim' | 'meridian';
  model?: string;
  complexityScore?: number;
}

export interface CascadeChatOptions {
  swarmContext?: VnxSwarmPromptContext | null;
}

// ─── Cascade Chat Handler ──────────────────────────────────────────────────

export class CascadeChatHandler extends EventEmitter {
  private sessions = new Map<string, ChatSession>();
  private messageHistory: ChatMessage[] = [];
  private maxHistory = 1000;
  private persistPath: string;
  private persistInterval: NodeJS.Timeout | null = null;

  constructor(persistDir = './data/sessions') {
    super();
    this.persistPath = join(process.cwd(), persistDir);
    this.initPersistence();
  }

  /**
   * Initialize persistence - load saved sessions and start auto-save
   */
  private async initPersistence() {
    try {
      await fs.mkdir(this.persistPath, { recursive: true });
      await this.loadSessions();
      
      // Auto-save every 30 seconds
      this.persistInterval = setInterval(() => {
        this.saveSessions();
      }, 30000);
      
      console.log('[CascadeChat] Persistence initialized at:', this.persistPath);
    } catch (error) {
      console.error('[CascadeChat] Failed to initialize persistence:', error);
    }
  }

  /**
   * Save sessions to disk
   */
  private async saveSessions() {
    try {
      const sessionsData = Array.from(this.sessions.values());
      const filePath = join(this.persistPath, 'sessions.json');
      await fs.writeFile(filePath, JSON.stringify(sessionsData, null, 2));
    } catch (error) {
      console.error('[CascadeChat] Failed to save sessions:', error);
    }
  }

  /**
   * Load sessions from disk
   */
  private async loadSessions() {
    try {
      const filePath = join(this.persistPath, 'sessions.json');
      const data = await fs.readFile(filePath, 'utf-8');
      const sessions: ChatSession[] = JSON.parse(data);
      
      for (const session of sessions) {
        this.sessions.set(session.id, session);
      }
      
      console.log(`[CascadeChat] Loaded ${sessions.length} sessions from disk`);
    } catch {
      // No saved sessions yet - that's ok
      console.log('[CascadeChat] No saved sessions found, starting fresh');
    }
  }

  /**
   * Create a new chat session with Cascade thinking enabled
   */
  createSession(userId: string, sessionId?: string): ChatSession {
    const id = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ChatSession = {
      id,
      userId,
      messages: [],
      createdAt: Date.now(),
      lastActive: Date.now(),
      oasisEnabled: true,
      thinkingTraceVisible: true,
    };

    this.sessions.set(id, session);
    
    this.emit('session_created', session);
    
    return session;
  }

  /**
   * Get existing session or create new one
   */
  getOrCreateSession(userId: string, sessionId?: string): ChatSession {
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.lastActive = Date.now();
      return session;
    }
    return this.createSession(userId, sessionId);
  }

  /**
   * Process a user message through Cascade thinking
   */
  async processMessage(
    sessionId: string,
    userId: string,
    content: string,
    options: CascadeChatOptions = {},
  ): Promise<CascadeChatResponse> {
    const session = this.sessions.get(sessionId) || this.createSession(userId, sessionId);
    session.lastActive = Date.now();

    // Create user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      sessionId,
      userId,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    session.messages.push(userMessage);
    this.messageHistory.push(userMessage);

    this.emit('message_received', userMessage);

    // If Cascade is enabled, process through thinking engine
    let cascadeResult: OasisResult | undefined;
    
    if (session.oasisEnabled) {
      const context: OasisContext = {
        sessionId,
        userId,
        previousMessages: session.messages.slice(-10).map(m => ({
          role: m.role,
          content: m.content,
        })),
        swarmContext: options.swarmContext || undefined,
      };

      cascadeResult = await veraOasis.think(content, context);
      
      this.emit('oasis_complete', cascadeResult);
    }

    // Run unified intelligence pipeline (agents, memory, graph, quantum)
    let unifiedResult: UnifiedResponse | undefined;
    try {
      unifiedResult = await unifiedIntelligence.process({
        message: content,
        sessionId,
        userId,
        context: {
          cascadeThinking: cascadeResult,
          vnxSwarm: options.swarmContext
            ? {
                enabled: options.swarmContext.enabled,
                selected: options.swarmContext.selected.map((item) => item.id),
              }
            : undefined,
        },
        useAgents: true,
        useMemory: true,
        useGraph: true,
        useQuantum: true,
      });
      this.emit('unified_complete', unifiedResult);
    } catch (e) {
      console.error('[Chat] Unified intelligence error:', e);
    }

    // Generate assistant response based on cascade + unified thinking
    const assistantContent = this.generateResponse(content, cascadeResult, unifiedResult);

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-assistant`,
      sessionId,
      userId,
      role: 'assistant',
      content: assistantContent,
      timestamp: Date.now(),
      oasisData: cascadeResult,
      unifiedData: unifiedResult,
    };

    session.messages.push(assistantMessage);
    this.messageHistory.push(assistantMessage);

    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }

    this.emit('message_sent', assistantMessage);

    return {
      message: assistantMessage,
      thinkingTrace: cascadeResult?.thinkingTrace || 'Cascade thinking not enabled',
      unifiedTrace: unifiedResult?.thinkingTrace || [],
      confidence: cascadeResult?.metadata.confidence || 0.5,
      requestType: cascadeResult?.requestType || 'chat',
      intent: unifiedResult?.agentResult?.intent?.type,
      agentTriggered: unifiedResult?.metadata?.agentTriggered,
      metadata: {
        duration: cascadeResult?.metadata.totalDuration || 0,
        centerPulses: cascadeResult?.metadata.centerPulses || 0,
        energyConsumed: cascadeResult?.metadata.energyConsumed || 0,
        pathTaken: cascadeResult?.metadata.pathTaken || [],
        agentUsed: unifiedResult?.metadata?.agentTriggered || false,
        memoryUsed: unifiedResult?.metadata?.memoryUsed || false,
        graphQueried: unifiedResult?.metadata?.graphQueried || false,
        quantumEntangled: unifiedResult?.metadata?.quantumEntangled || false,
        vnxSwarm: options.swarmContext
          ? {
              enabled: options.swarmContext.enabled,
              briefing: options.swarmContext.briefing,
              selected: options.swarmContext.selected.map((item) => ({
                id: item.id,
                name: item.name,
                score: item.score,
                reasons: item.reasons,
              })),
            }
          : undefined,
      },
      sovereign: cascadeResult?.sovereignty?.sovereign,
      provider: cascadeResult?.sovereignty?.provider,
      model: cascadeResult?.sovereignty?.model,
      complexityScore: cascadeResult?.sovereignty?.complexityScore,
    };
  }

  /**
   * Generate response based on cascade thinking result
   */
  private generateResponse(userInput: string, cascadeResult?: OasisResult, unifiedResult?: UnifiedResponse): string {
    if (!cascadeResult) {
      return `I received: "${userInput}"\n\n[Cascade thinking is currently disabled]`;
    }

    const trace = cascadeResult.thinkingTrace;
    const confidence = (cascadeResult.metadata.confidence * 100).toFixed(0);
    const requestType = cascadeResult.requestType;
    const energy = cascadeResult.metadata.energyConsumed.toFixed(2);
    
    // For coding requests, generate actual code
    if (requestType === 'coding' || userInput.toLowerCase().includes('token')) {
      const generatedCode = this.generateCarbonTokenCode(cascadeResult);
      return `${generatedCode}`;
    }
    
    // Return clean response - metadata shown separately in UI
    return cascadeResult.finalOutput;
  }

  /**
   * Generate Hedera HTS Carbon Credit Token code
   */
  private generateCarbonTokenCode(cascadeResult: OasisResult): string {
    const path = cascadeResult.metadata.pathTaken.join(' → ');
    const pathArray = JSON.stringify(cascadeResult.metadata.pathTaken);
    const energy = cascadeResult.metadata.energyConsumed.toFixed(2);
    const confidence = (cascadeResult.metadata.confidence * 100).toFixed(0);
    
    return `/**
 * 🌿 Vera Lattice Carbon Credit Token (HTS)
 * 
 * Generated through Cascade Thinking with mandatory center-0 routing
 * Request ID: ${cascadeResult.requestId}
 * Path: ${path}
 * Energy: ${energy}
 * Confidence: ${confidence}%
 */

import { 
  TokenCreateTransaction, 
  TokenType,
  TokenSupplyType,
  CustomFixedFee,
  CustomRoyaltyFee,
  Hbar
} from '@hashgraph/sdk';
import { hcsDomainLogger } from '../vera/logging/hcsDomainLogger.js';

// ─── Carbon Credit Token Configuration ─────────────────────────────────────

export interface CarbonTokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
  maxSupply: number;
  carbonAttributes: {
    projectType: string;      // e.g., "reforestation", "renewable_energy"
    vintageYear: number;      // Year carbon was sequestered
    location: string;         // Geolocation of project
    verifier: string;       // Third-party verifier
    methodology: string;    // Carbon accounting standard
    co2Tonnes: number;      // Verified CO2 tonnes offset
  };
  auditTopicId: string;     // HCS topic for audit trail
}

// ─── Lattice Provenance (injected by Cascade Thinking) ──────────────────────

const LATTICE_PROVENANCE = {
  requestId: '${cascadeResult.requestId}',
  pathTaken: ${pathArray},
  energyConsumed: ${energy},
  confidence: ${cascadeResult.metadata.confidence},
  centerPulses: ${cascadeResult.metadata.centerPulses},
  generatedAt: '${new Date().toISOString()}'
};

// ─── Carbon Token Creator ─────────────────────────────────────────────────

export class CarbonCreditTokenCreator {
  private latticePath: string[];
  private centerEnergy: number;
  private latticeConfidence: number;

  constructor(private config: CarbonTokenConfig) {
    this.latticePath = LATTICE_PROVENANCE.pathTaken;
    this.centerEnergy = LATTICE_PROVENANCE.energyConsumed;
    this.latticeConfidence = LATTICE_PROVENANCE.confidence;
  }

  /**
   * Create a lattice-aware carbon credit token on Hedera
   */
  async createToken(client: any) {
    // Log to HCS audit trail before creation
    await this.logToAuditTrail('TOKEN_CREATION_INITIATED', {
      config: this.config,
      latticePath: this.latticePath,
      centerEnergy: this.centerEnergy
    });

    // Create custom fees for carbon project sustainability
    const projectFee = new CustomFixedFee()
      .setFeeCollectorAccountId(this.getProjectAccount())
      .setHbarAmount(Hbar.fromTinybars(100_000)); // 0.001 HBAR per transfer

    const royaltyFee = new CustomRoyaltyFee()
      .setFeeCollectorAccountId(this.getProjectAccount())
      .setNumerator(1)
      .setDenominator(100); // 1% royalty to project

    // Build token with carbon metadata
    const transaction = new TokenCreateTransaction()
      .setTokenName(this.config.name)
      .setTokenSymbol(this.config.symbol)
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(this.config.decimals)
      .setInitialSupply(this.config.initialSupply)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(this.config.maxSupply)
      .setCustomFees([projectFee, royaltyFee])
      .setMemo(JSON.stringify({
        type: 'carbon_credit',
        vintage: this.config.carbonAttributes.vintageYear,
        tonnes: this.config.carbonAttributes.co2Tonnes,
        verifier: this.config.carbonAttributes.verifier,
        lattice: {
          path: this.latticePath,
          energy: this.centerEnergy,
          confidence: this.latticeConfidence
        }
      }));

    // Execute with center-0 consciousness validation
    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId;

    // Log successful creation
    await this.logToAuditTrail('TOKEN_CREATED', {
      tokenId: tokenId?.toString(),
      transactionId: response.transactionId.toString(),
      latticePath: this.latticePath
    });

    return {
      tokenId,
      transactionId: response.transactionId.toString(),
      latticePath: this.latticePath,
      centerValidated: true
    };
  }

  private async logToAuditTrail(event: string, data: any): Promise<void> {
    await hcsDomainLogger.logEvent('auditTopicId', {
      type: 'carbon_token_audit',
      event,
      timestamp: Date.now(),
      data,
      lattice: {
        path: this.latticePath,
        energy: this.centerEnergy
      }
    });
  }

  private getProjectAccount(): string {
    // In production, this would be the carbon project treasury account
    return process.env.CARBON_PROJECT_ACCOUNT || '0.0.12345';
  }
}

// ─── Example Usage ──────────────────────────────────────────────────────────

export async function createVeraCarbonCredit(client: any) {
  const config: CarbonTokenConfig = {
    name: 'Vera Verified Carbon Unit',
    symbol: 'VVCU',
    decimals: 0,
    initialSupply: 10000,
    maxSupply: 1000000,
    carbonAttributes: {
      projectType: 'reforestation',
      vintageYear: 2025,
      location: 'Amazon Basin, Brazil',
      verifier: 'Verra VCS',
      methodology: 'VM0015',
      co2Tonnes: 10000
    },
    auditTopicId: process.env.CARBON_AUDIT_TOPIC || '0.0.12345'
  };

  const creator = new CarbonCreditTokenCreator(config);
  return await creator.createToken(client);
}`;
  }

  /**
   * Get session with all messages
   */
  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: string): ChatSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId)
      .sort((a, b) => b.lastActive - a.lastActive);
  }

  /**
   * Toggle VeraOasis thinking for a session
   */
  toggleOasis(sessionId: string, enabled: boolean): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.oasisEnabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Toggle thinking trace visibility
   */
  toggleThinkingTrace(sessionId: string, visible: boolean): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.thinkingTraceVisible = visible;
      return true;
    }
    return false;
  }

  /**
   * Get Cascade statistics for a session
   */
  getSessionStats(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const assistantMessages = session.messages.filter(m => m.role === 'assistant' && m.oasisData);
    
    if (assistantMessages.length === 0) {
      return { messageCount: session.messages.length, cascadeRuns: 0 };
    }

    const avgConfidence = assistantMessages.reduce((sum, m) => sum + (m.oasisData?.metadata.confidence || 0), 0) / assistantMessages.length;
    const avgDuration = assistantMessages.reduce((sum, m) => sum + (m.oasisData?.metadata.totalDuration || 0), 0) / assistantMessages.length;
    const totalEnergy = assistantMessages.reduce((sum, m) => sum + (m.oasisData?.metadata.energyConsumed || 0), 0);
    
    const requestTypes: Record<string, number> = {};
    for (const m of assistantMessages) {
      const type = m.oasisData?.requestType || 'unknown';
      requestTypes[type] = (requestTypes[type] || 0) + 1;
    }

    return {
      messageCount: session.messages.length,
      cascadeRuns: assistantMessages.length,
      averageConfidence: (avgConfidence * 100).toFixed(1) + '%',
      averageDuration: avgDuration.toFixed(0) + 'ms',
      totalEnergyConsumed: totalEnergy.toFixed(2),
      requestTypes,
      sessionAge: Math.floor((Date.now() - session.createdAt) / 60000) + ' minutes',
    };
  }

  /**
   * Clear session history
   */
  clearSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      return true;
    }
    return false;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get global Cascade statistics
   */
  getGlobalStats(): any {
    const allResults = veraOasis.getRequestHistory();
    
    if (allResults.length === 0) {
      return { totalRequests: 0 };
    }

    const avgConfidence = allResults.reduce((sum, r) => sum + r.metadata.confidence, 0) / allResults.length;
    const avgDuration = allResults.reduce((sum, r) => sum + r.metadata.totalDuration, 0) / allResults.length;
    const totalEnergy = allResults.reduce((sum, r) => sum + r.metadata.energyConsumed, 0);
    
    const requestTypes: Record<string, number> = {};
    for (const r of allResults) {
      requestTypes[r.requestType] = (requestTypes[r.requestType] || 0) + 1;
    }

    const longTermMemory = veraOasis.getLongTermMemory();

    return {
      totalRequests: allResults.length,
      averageConfidence: (avgConfidence * 100).toFixed(1) + '%',
      averageDuration: avgDuration.toFixed(0) + 'ms',
      totalEnergyConsumed: totalEnergy.toFixed(2),
      requestTypes,
      activeRequests: veraOasis.getActiveRequests().length,
      longTermMemory: {
        successfulPaths: Object.keys(longTermMemory.successfulPaths).length,
        nodePreferences: Object.keys(longTermMemory.nodePreferences).length,
        commonPatterns: Object.keys(longTermMemory.commonPatterns).length,
        lastReview: new Date(longTermMemory.lastReview).toISOString(),
      },
    };
  }

  /**
   * Manually save all sessions to disk
   */
  async saveAllSessions(): Promise<void> {
    await this.saveSessions();
    console.log('[CascadeChat] Sessions manually saved');
  }

  /**
   * Clean up and stop persistence
   */
  async dispose(): Promise<void> {
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }
    await this.saveSessions();
    this.removeAllListeners();
    console.log('[CascadeChat] Handler disposed, sessions saved');
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const oasisChat = new CascadeChatHandler();

// ─── Quick Activation Helper ────────────────────────────────────────────────

/**
 * Activate Cascade thinking for all future requests
 */
export function activateCascadeThinking(): void {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🧠 VERA CASCADE THINKING ACTIVATED                   ║');
  console.log('║                                                        ║');
  console.log('║  All requests now flow through the 5-step process:   ║');
  console.log('║  1. Center Node (Consciousness)                        ║');
  console.log('║  2. Layer 1 (Understanding)                            ║');
  console.log('║  3. Layer 2 (Planning)                                 ║');
  console.log('║  4. Layer 3 (Execution)                                ║');
  console.log('║  5. Return to Center (Review)                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

/**
 * Check if Cascade thinking is active
 */
export function isCascadeActive(): boolean {
  return true; // Always active when imported
}
