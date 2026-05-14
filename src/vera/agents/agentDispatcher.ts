/**
 * Vera Agent Dispatcher
 * 
 * Automatically analyzes chat messages and dispatches to appropriate
 * specialized agents when needed. Integrates with the VeraOasis chat flow.
 * 
 * @module vera/agents/agentDispatcher
 */

import { EventEmitter } from 'events';
import { crewManager, CrewResult } from './crewManager.js';

export interface AgentIntent {
  type: 'none' | 'carbon' | 'defi' | 'compliance' | 'strategy' | 'resonance' | 'code' | 'analysis';
  confidence: number;
  crewName?: string;
  reasoning: string;
}

export interface DispatchResult {
  usedAgent: boolean;
  intent: AgentIntent;
  crewResult?: CrewResult;
  response: string;
  latencyMs: number;
}

export class AgentDispatcher extends EventEmitter {
  private initialized = false;

  // Intent detection patterns
  private intentPatterns: Record<AgentIntent['type'], RegExp[]> = {
    none: [],
    carbon: [
      /carbon/i, /co2/i, /emission/i, /offset/i, /credit/i, /footprint/i,
      /sustainab/i, /green.*token/i, /climate/i, /esg/i
    ],
    defi: [
      /defi/i, /yield/i, /liquidity/i, /swap/i, /stake/i, /farm/i,
      /dex/i, /amm/i, /pool/i, /lending/i, /borrow/i, /apy/i, /apr/i
    ],
    compliance: [
      /compliance/i, /regulat/i, /kyc/i, /aml/i, /legal/i, /audit/i,
      /verify/i, /credential/i, /license/i, /governance/i, /policy/i
    ],
    strategy: [
      /strategy/i, /plan/i, /optimize/i, /improve/i, /recommend/i,
      /advice/i, /suggest/i, /best.*practice/i, /how.*should/i
    ],
    resonance: [
      /resonance/i, /harmonic/i, /frequency/i, /sacred/i, /flower.*life/i,
      /lattice/i, /quantum/i, /entangle/i, /pulse/i, /energy/i
    ],
    code: [
      /code/i, /program/i, /develop/i, /function/i, /api/i, /smart.*contract/i,
      /typescript/i, /javascript/i, /solidity/i, /debug/i, /error/i, /fix/i
    ],
    analysis: [
      /analyze/i, /compare/i, /difference/i, /pros.*cons/i, /evaluate/i,
      /assess/i, /review/i, /research/i, /explain/i, /what.*is/i, /how.*work/i
    ],
  };

  /**
   * Initialize the dispatcher
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[AgentDispatcher] Initializing...');
    this.initialized = true;
    this.emit('initialized');
  }

  /**
   * Detect intent from user message
   */
  detectIntent(message: string): AgentIntent {
    const lowerMsg = message.toLowerCase();
    let bestIntent: AgentIntent['type'] = 'none';
    let bestScore = 0;
    let matchCount = 0;

    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      if (intent === 'none') continue;

      let score = 0;
      for (const pattern of patterns) {
        if (pattern.test(lowerMsg)) {
          score += 1;
        }
      }

      if (score > matchCount) {
        matchCount = score;
        bestIntent = intent as AgentIntent['type'];
        bestScore = Math.min(1.0, score * 0.3 + 0.2);
      }
    }

    // Map intent to crew
    const crewMap: Record<string, string> = {
      carbon: 'layer2_domain_crew',
      defi: 'layer2_domain_crew',
      compliance: 'layer2_domain_crew',
      strategy: 'layer3_strategic_crew',
      resonance: 'layer3_strategic_crew',
      code: 'layer1_task_crew',
      analysis: 'layer2_domain_crew',
    };

    return {
      type: bestIntent,
      confidence: bestScore,
      crewName: crewMap[bestIntent],
      reasoning: `Detected ${matchCount} keywords for ${bestIntent}`,
    };
  }

  /**
   * Dispatch message to appropriate agent
   */
  async dispatch(message: string, context?: Record<string, any>): Promise<DispatchResult> {
    const startTime = Date.now();
    
    // Detect intent
    const intent = this.detectIntent(message);

    // If confidence too low, don't use agent
    if (intent.confidence < 0.3 || !intent.crewName) {
      return {
        usedAgent: false,
        intent,
        response: 'No agent dispatch - confidence too low',
        latencyMs: Date.now() - startTime,
      };
    }

    // Dispatch to crew
    try {
      const agentMap: Record<string, string> = {
        carbon: 'CarbonSpecialist',
        defi: 'DeFiAnalyst',
        compliance: 'ComplianceOfficer',
        strategy: 'QuantumStrategist',
        resonance: 'ResonanceKeeper',
        code: 'Executor',
        analysis: 'Synthesizer',
      };

      const task = {
        description: message,
        expectedOutput: 'Detailed analysis and recommendations',
        agent: agentMap[intent.type] || 'Synthesizer',
      };

      const crewResult = await crewManager.executeCrew(
        intent.crewName,
        [task],
        { userMessage: message, ...context }
      );

      const response = this.formatAgentResponse(crewResult, intent, intent.crewName);

      this.emit('dispatched', { intent, crewName: intent.crewName, latency: Date.now() - startTime });

      return {
        usedAgent: true,
        intent,
        crewResult,
        response,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[AgentDispatcher] Error:', error);
      return {
        usedAgent: false,
        intent,
        response: `Agent dispatch failed: ${error}`,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Format agent result into chat response
   */
  private formatAgentResponse(result: CrewResult, intent: AgentIntent, crewName?: string): string {
    const agentOutputEntries: Array<[string, string]> = [];
    result.agentOutputs.forEach((value, key) => {
      agentOutputEntries.push([key, value]);
    });
    
    const outputs = agentOutputEntries.length > 0
      ? agentOutputEntries.map(([agent, output]) => 
          `**${agent}**: ${output.substring(0, 200)}...`
        ).join('\n\n')
      : 'Agents processed request';

    return `🤖 **Agent Team Activated** (${intent.type}, ${Math.round(intent.confidence * 100)}% confidence)\n\n` +
           `${outputs}\n\n` +
           `---\n` +
           `⏱️ Completed in ${result.executionTime}ms${crewName ? ` | Crew: ${crewName}` : ''}`;
  }

  /**
   * Get dispatcher stats
   */
  getStats(): {
    initialized: boolean;
    supportedIntents: string[];
  } {
    return {
      initialized: this.initialized,
      supportedIntents: Object.keys(this.intentPatterns).filter(k => k !== 'none'),
    };
  }
}

// Singleton instance
export const agentDispatcher = new AgentDispatcher();
