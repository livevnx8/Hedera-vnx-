/**
 * Vera's Economic Optimization Engine
 * 
 * Tracks HBAR cost per tool, estimates transaction fees,
 * and auto-selects cheaper execution paths.
 */
import fs from 'fs';
import path from 'path';

const ECONOMIC_PATH = '/mnt/vera-mirror-shards/vera-lattice/economic-data.json';

// Approximate HBAR costs (mainnet estimates)
const BASE_COSTS: Record<string, number> = {
  hts_create_token: 2.5,
  hts_transfer: 0.01,
  hts_associate: 0.05,
  hts_dissociate: 0.05,
  hts_mint: 0.1,
  hts_burn: 0.05,
  hcs_create_topic: 0.5,
  hcs_submit_message: 0.01,
  kit_create_account: 0.2,
  kit_transfer_hbar: 0.01,
  default: 0.1,
};

interface ToolEconomics {
  tool: string;
  estimatedCost: number;
  actualCosts: number[];
  avgCost: number;
  totalSpent: number;
  callCount: number;
  cheaperAlternatives: string[];
  lastUpdated: number;
}

interface EconomicStore {
  tools: Record<string, ToolEconomics>;
  totalSpent: number;
  totalCalls: number;
  savingsOptimizations: number;
  lastUpdated: number;
}

let store: EconomicStore = {
  tools: {},
  totalSpent: 0,
  totalCalls: 0,
  savingsOptimizations: 0,
  lastUpdated: 0,
};

let flushTimeout: NodeJS.Timeout | null = null;

function load(): void {
  try {
    if (fs.existsSync(ECONOMIC_PATH)) {
      store = JSON.parse(fs.readFileSync(ECONOMIC_PATH, 'utf8'));
    }
  } catch { /* silent */ }
}

function save(): void {
  try {
    const dir = path.dirname(ECONOMIC_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ECONOMIC_PATH, JSON.stringify(store, null, 2));
  } catch { /* silent */ }
}

function debouncedSave(): void {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(save, 5000);
}

export function recordToolCost(tool: string, actualCostHbar?: number): void {
  if (!store.tools[tool]) {
    store.tools[tool] = {
      tool,
      estimatedCost: BASE_COSTS[tool] || BASE_COSTS.default,
      actualCosts: [],
      avgCost: BASE_COSTS[tool] || BASE_COSTS.default,
      totalSpent: 0,
      callCount: 0,
      cheaperAlternatives: [],
      lastUpdated: 0,
    };
  }

  const t = store.tools[tool];
  const cost = actualCostHbar ?? t.estimatedCost;
  
  t.actualCosts.push(cost);
  if (t.actualCosts.length > 100) t.actualCosts.shift();
  
  t.avgCost = t.actualCosts.reduce((a, b) => a + b, 0) / t.actualCosts.length;
  t.totalSpent += cost;
  t.callCount++;
  t.lastUpdated = Date.now();

  store.totalSpent += cost;
  store.totalCalls++;

  // Find cheaper alternatives
  findCheaperAlternatives(tool);
  
  debouncedSave();
}

function findCheaperAlternatives(tool: string): void {
  const current = store.tools[tool];
  if (!current) return;

  // Find tools with similar names (potential alternatives)
  const alternatives: { tool: string; savings: number }[] = [];
  
  for (const [name, data] of Object.entries(store.tools)) {
    if (name === tool) continue;
    
    // Check if this tool can substitute
    const canSubstitute = checkSubstitutability(tool, name);
    if (canSubstitute && data.avgCost < current.avgCost * 0.8) {
      alternatives.push({
        tool: name,
        savings: current.avgCost - data.avgCost,
      });
    }
  }

  current.cheaperAlternatives = alternatives
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 3)
    .map(a => a.tool);
}

function checkSubstitutability(toolA: string, toolB: string): boolean {
  // Simple heuristic: same category or similar name patterns
  const categoryA = toolA.split('_')[0];
  const categoryB = toolB.split('_')[0];
  
  // Same category = potential substitute
  if (categoryA === categoryB) return true;
  
  // Similar function patterns
  const similarPatterns = [
    ['transfer', 'send'],
    ['get', 'query', 'fetch'],
    ['create', 'mint', 'deploy'],
  ];
  
  for (const patterns of similarPatterns) {
    const aMatch = patterns.some(p => toolA.includes(p));
    const bMatch = patterns.some(p => toolB.includes(p));
    if (aMatch && bMatch) return true;
  }
  
  return false;
}

export function getOptimalPath(toolsNeeded: string[]): { path: string[]; estimatedCost: number; savings: number } {
  let totalCost = 0;
  let optimizedCost = 0;
  const optimizedPath: string[] = [];

  for (const tool of toolsNeeded) {
    const data = store.tools[tool];
    const baseCost = BASE_COSTS[tool] || BASE_COSTS.default;
    totalCost += data?.avgCost || baseCost;

    // Check for cheaper alternative
    const alternative = data?.cheaperAlternatives[0];
    if (alternative && store.tools[alternative]) {
      const altCost = store.tools[alternative].avgCost;
      if (altCost < (data?.avgCost || baseCost) * 0.9) {
        optimizedPath.push(alternative);
        optimizedCost += altCost;
        store.savingsOptimizations++;
        continue;
      }
    }

    optimizedPath.push(tool);
    optimizedCost += data?.avgCost || baseCost;
  }

  return {
    path: optimizedPath,
    estimatedCost: optimizedCost,
    savings: totalCost - optimizedCost,
  };
}

export function getEconomicStats(): EconomicStore {
  load();
  return store;
}

export function getToolEconomics(tool: string): ToolEconomics | null {
  load();
  return store.tools[tool] || null;
}

export function getMostExpensiveTools(limit = 10): ToolEconomics[] {
  load();
  return Object.values(store.tools)
    .sort((a, b) => b.avgCost - a.avgCost)
    .slice(0, limit);
}

export function getSavingsOpportunities(): { tool: string; alternative: string; savings: number }[] {
  load();
  const ops: { tool: string; alternative: string; savings: number }[] = [];
  
  for (const tool of Object.values(store.tools)) {
    for (const alt of tool.cheaperAlternatives.slice(0, 1)) {
      const altData = store.tools[alt];
      if (altData) {
        ops.push({
          tool: tool.tool,
          alternative: alt,
          savings: tool.avgCost - altData.avgCost,
        });
      }
    }
  }

  return ops.sort((a, b) => b.savings - a.savings).slice(0, 10);
}

// Initialize
load();
