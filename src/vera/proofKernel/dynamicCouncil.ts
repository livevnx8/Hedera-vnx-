/**
 * Dynamic Council Sizing
 * 
 * Adjusts the number of Meridians consulted based on task complexity,
 * stakes, and confidence requirements.
 */

import type { VerifiableAITask } from './types.js';

export interface CouncilSizeConfig {
  simpleThreshold: number;      // Max tokens for simple queries
  standardThreshold: number;    // Max tokens for standard tasks
  highStakesKeywords: string[];
  financialKeywords: string[];
  governanceKeywords: string[];
}

export interface CouncilSizing {
  size: 1 | 3 | 5 | 7;
  reason: string;
  requiresHumanEscalation: boolean;
  minConfidence: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: CouncilSizeConfig = {
  simpleThreshold: 100,
  standardThreshold: 500,
  highStakesKeywords: ['delete', 'remove', 'transfer', 'withdraw', 'authorize', 'critical', 'emergency'],
  financialKeywords: ['payment', 'invoice', 'refund', 'settlement', 'hbar', 'tokens'],
  governanceKeywords: ['proposal', 'vote', 'upgrade', 'deploy', 'multisig', 'dao'],
};

export function calculateCouncilSize(
  task: VerifiableAITask,
  config: CouncilSizeConfig = DEFAULT_CONFIG
): CouncilSizing {
  const description = task.description.toLowerCase();
  const serviceType = task.serviceType.toLowerCase();
  
  // Check for high-stakes indicators
  const hasHighStakes = config.highStakesKeywords.some(kw => description.includes(kw));
  const hasFinancial = config.financialKeywords.some(kw => description.includes(kw) || serviceType.includes(kw));
  const hasGovernance = config.governanceKeywords.some(kw => description.includes(kw) || serviceType.includes(kw));
  
  // Estimate complexity by payload size
  const payloadSize = JSON.stringify(task.payload).length;
  const isSimple = payloadSize < config.simpleThreshold && !hasHighStakes && !hasFinancial;
  const isStandard = payloadSize < config.standardThreshold && !hasGovernance;
  
  // Determine council size and requirements
  if (hasGovernance || (hasFinancial && hasHighStakes)) {
    return {
      size: 5,
      reason: 'High-stakes governance/financial decision',
      requiresHumanEscalation: true,
      minConfidence: 0.85,
      timeoutMs: 3000, // Longer timeout for thorough analysis
    };
  }
  
  if (hasFinancial || hasHighStakes) {
    return {
      size: 3,
      reason: 'Financial or high-stakes operation',
      requiresHumanEscalation: false,
      minConfidence: 0.75,
      timeoutMs: 2000,
    };
  }
  
  if (isSimple) {
    return {
      size: 1,
      reason: 'Simple query, low stakes',
      requiresHumanEscalation: false,
      minConfidence: 0.6,
      timeoutMs: 800,
    };
  }
  
  // Default: standard task
  return {
    size: 3,
    reason: 'Standard task requiring balanced consensus',
    requiresHumanEscalation: false,
    minConfidence: 0.7,
    timeoutMs: 1500,
  };
}

// Adaptive sizing based on historical accuracy
export function adaptCouncilSize(
  baseSizing: CouncilSizing,
  meridianReputations: Array<{ id: string; accuracy: number }>,
  historicalDisagreement: number
): CouncilSizing {
  const avgReputation = meridianReputations.reduce((sum, r) => sum + r.accuracy, 0) / meridianReputations.length;
  
  // If Meridians have high agreement and high reputation, we can use fewer
  if (avgReputation > 0.95 && historicalDisagreement < 0.1 && baseSizing.size > 1) {
    return {
      ...baseSizing,
      size: Math.max(1, baseSizing.size - 2) as 1 | 3 | 5 | 7,
      reason: `${baseSizing.reason} (adapted: high consensus, high reputation)`,
    };
  }
  
  // If low reputation or high disagreement, increase council size
  if ((avgReputation < 0.8 || historicalDisagreement > 0.3) && baseSizing.size < 5) {
    return {
      ...baseSizing,
      size: Math.min(5, baseSizing.size + 2) as 1 | 3 | 5 | 7,
      reason: `${baseSizing.reason} (adapted: low consensus or reputation)`,
      minConfidence: Math.max(0.8, baseSizing.minConfidence),
    };
  }
  
  return baseSizing;
}

// Select which Meridians to include based on reputation and load
export function selectMeridiansForCouncil(
  allMeridians: Array<{ id: string; url: string; accuracy: number; currentLoad: number }>,
  targetSize: number
): Array<{ id: string; url: string }> {
  // Sort by: accuracy (desc), then load (asc)
  const sorted = [...allMeridians].sort((a, b) => {
    if (Math.abs(a.accuracy - b.accuracy) > 0.05) {
      return b.accuracy - a.accuracy; // Higher accuracy first
    }
    return a.currentLoad - b.currentLoad; // Lower load first
  });
  
  // Take top N, ensuring we don't overload any single Meridian
  const selected: Array<{ id: string; url: string }> = [];
  for (const m of sorted) {
    if (selected.length >= targetSize) break;
    if (m.currentLoad < 0.8) { // Don't overload Meridians above 80% capacity
      selected.push({ id: m.id, url: m.url });
    }
  }
  
  // If we couldn't get enough, relax the load constraint
  if (selected.length < targetSize) {
    for (const m of sorted) {
      if (selected.length >= targetSize) break;
      if (!selected.find(s => s.id === m.id)) {
        selected.push({ id: m.id, url: m.url });
      }
    }
  }
  
  return selected;
}
