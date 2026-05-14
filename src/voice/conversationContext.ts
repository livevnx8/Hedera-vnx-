/**
 * Vera Conversation Context Manager
 * Manages multi-turn conversations and context preservation
 */

export interface ConversationSession {
  sessionId: string;
  startTime: number;
  lastActivity: number;
  turnCount: number;
  context: Map<string, any>;
  history: ConversationTurn[];
  userPreferences: UserPreferences;
}

export interface ConversationTurn {
  timestamp: number;
  userInput: string;
  command: string;
  intent: string;
  entities: Record<string, string>;
  response: string;
  success: boolean;
}

export interface UserPreferences {
  preferredVoice: string;
  speechRate: number;
  detailLevel: 'brief' | 'normal' | 'verbose';
  visualFeedback: boolean;
  audioFeedback: boolean;
}

export interface ContextHint {
  type: 'follow_up' | 'reference' | 'correction' | 'clarification';
  previousIntent: string;
  suggestedResponse: string;
}

export class ConversationContextManager {
  private sessions = new Map<string, ConversationSession>();
  private maxHistoryPerSession = 20;
  private sessionTTL = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Create a new conversation session
   */
  createSession(sessionId?: string): ConversationSession {
    const id = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ConversationSession = {
      sessionId: id,
      startTime: Date.now(),
      lastActivity: Date.now(),
      turnCount: 0,
      context: new Map(),
      history: [],
      userPreferences: this.getDefaultPreferences(),
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Get or create session
   */
  getSession(sessionId: string): ConversationSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(sessionId);
    }
    return session;
  }

  /**
   * Add a conversation turn to session history
   */
  addTurn(
    sessionId: string,
    userInput: string,
    command: string,
    intent: string,
    entities: Record<string, string>,
    response: string,
    success: boolean
  ): void {
    const session = this.getSession(sessionId);
    
    const turn: ConversationTurn = {
      timestamp: Date.now(),
      userInput,
      command,
      intent,
      entities,
      response,
      success,
    };

    session.history.push(turn);
    session.turnCount++;
    session.lastActivity = Date.now();

    // Trim history if too long
    if (session.history.length > this.maxHistoryPerSession) {
      session.history = session.history.slice(-this.maxHistoryPerSession);
    }

    // Extract and store context
    this.extractContext(session, turn);
  }

  /**
   * Extract context information from a turn
   */
  private extractContext(session: ConversationSession, turn: ConversationTurn): void {
    // Store last mentioned entities for reference resolution
    if (turn.entities.agentType) {
      session.context.set('lastAgentType', turn.entities.agentType);
    }
    if (turn.entities.layer) {
      session.context.set('lastLayer', turn.entities.layer);
    }
    if (turn.entities.nodeId) {
      session.context.set('lastNode', turn.entities.nodeId);
    }
    if (turn.entities.direction) {
      session.context.set('lastDirection', turn.entities.direction);
    }

    // Track command patterns
    const recentCommands = session.history
      .slice(-5)
      .map(h => h.intent);
    session.context.set('recentCommandPattern', recentCommands);

    // Track success rate
    const recentTurns = session.history.slice(-10);
    const successRate = recentTurns.filter(t => t.success).length / recentTurns.length;
    session.context.set('successRate', successRate);
  }

  /**
   * Resolve references in user input using context
   */
  resolveReferences(sessionId: string, input: string): string {
    const session = this.getSession(sessionId);
    let resolved = input;

    // Resolve pronouns and references
    const lastAgent = session.context.get('lastAgentType');
    const lastLayer = session.context.get('lastLayer');
    const lastNode = session.context.get('lastNode');

    // Replace "it" with last referenced entity
    if (resolved.includes(' it ') || resolved.endsWith(' it')) {
      if (lastAgent) {
        resolved = resolved.replace(/\bit\b/g, lastAgent);
      } else if (lastNode) {
        resolved = resolved.replace(/\bit\b/g, lastNode);
      }
    }

    // Replace "that layer" or "the layer" with last layer
    if (resolved.includes('that layer') || resolved.includes('the layer')) {
      if (lastLayer) {
        resolved = resolved.replace(/that layer|the layer/g, `layer ${lastLayer}`);
      }
    }

    // Replace "that agent" with last agent
    if (resolved.includes('that agent') || resolved.includes('the agent')) {
      if (lastAgent) {
        resolved = resolved.replace(/that agent|the agent/g, `${lastAgent} agent`);
      }
    }

    return resolved;
  }

  /**
   * Check if input is a follow-up question
   */
  isFollowUp(sessionId: string, input: string): boolean {
    const session = this.getSession(sessionId);
    
    // Check for follow-up indicators
    const followUpPatterns = [
      'what about',
      'how about',
      'and',
      'also',
      'what else',
      'can you',
      'show me',
    ];

    const normalized = input.toLowerCase();
    return followUpPatterns.some(pattern => normalized.includes(pattern));
  }

  /**
   * Get context hints for ambiguous commands
   */
  getContextHints(sessionId: string, input: string): ContextHint | null {
    const session = this.getSession(sessionId);
    const lastTurn = session.history[session.history.length - 1];
    
    if (!lastTurn) return null;

    // Check for follow-up patterns
    if (this.isFollowUp(sessionId, input)) {
      return {
        type: 'follow_up',
        previousIntent: lastTurn.intent,
        suggestedResponse: `Continuing from previous ${lastTurn.intent} query...`,
      };
    }

    // Check for reference to previous
    const referencePatterns = ['it', 'that', 'the layer', 'the agent'];
    if (referencePatterns.some(p => input.toLowerCase().includes(p))) {
      return {
        type: 'reference',
        previousIntent: lastTurn.intent,
        suggestedResponse: `Resolving reference to ${lastTurn.entities.agentType || lastTurn.entities.layer || 'previous context'}...`,
      };
    }

    return null;
  }

  /**
   * Get conversation summary for TTS
   */
  getConversationSummary(sessionId: string): string {
    const session = this.getSession(sessionId);
    
    if (session.turnCount === 0) {
      return 'This is a new conversation.';
    }

    const recentTurns = session.history.slice(-3);
    const successfulTurns = recentTurns.filter(t => t.success).length;
    
    return `We've had ${session.turnCount} exchanges. ${successfulTurns} of the last ${recentTurns.length} commands were successful.`;
  }

  /**
   * Update user preferences
   */
  updatePreferences(sessionId: string, preferences: Partial<UserPreferences>): void {
    const session = this.getSession(sessionId);
    session.userPreferences = { ...session.userPreferences, ...preferences };
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      preferredVoice: 'default',
      speechRate: 1.0,
      detailLevel: 'normal',
      visualFeedback: true,
      audioFeedback: true,
    };
  }

  /**
   * Get formatted response based on detail level preference
   */
  formatResponse(sessionId: string, brief: string, normal: string, verbose: string): string {
    const session = this.getSession(sessionId);
    
    switch (session.userPreferences.detailLevel) {
      case 'brief':
        return brief;
      case 'verbose':
        return verbose;
      default:
        return normal;
    }
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ConversationSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get stats
   */
  getStats(): {
    activeSessions: number;
    totalTurns: number;
    averageTurnsPerSession: number;
  } {
    const sessions = this.getActiveSessions();
    const totalTurns = sessions.reduce((sum, s) => sum + s.turnCount, 0);
    
    return {
      activeSessions: sessions.length,
      totalTurns,
      averageTurnsPerSession: sessions.length > 0 ? totalTurns / sessions.length : 0,
    };
  }

  /**
   * Clean up expired sessions
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > this.sessionTTL) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  }

  /**
   * Stop cleanup timer
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton
export const conversationContext = new ConversationContextManager();
export default conversationContext;
