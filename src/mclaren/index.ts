/**
 * McLaren F1 Carbon Auditing Integration Module
 * Phase 1-2: Telemetry ingestion, NFT badges, HCS reporting, real-time validation, auto-retirement
 */

// Core services
export { raceCarbonAuditor, RaceCarbonAuditor, type RaceTelemetry, type CarbonCalculation } from './raceCarbonAuditor.js';
export { carbonBadgeService, CarbonBadgeService, type CarbonBadge, type MintBadgeRequest } from './carbonBadgeService.js';
export { hcsCarbonReporter, HCSCarbonReporter, type HCSReport, type SeasonSummary } from './hcsCarbonReporter.js';

// Phase 2 services
export { scenarioSimulator, ScenarioSimulator, type StrategyScenario, type SimulationResult, type SimulatedRace } from './scenarioSimulator.js';
export { realTimeCarbonValidator, RealTimeCarbonValidator, type LiveRaceData, type StrategyFlag } from './realTimeValidator.js';
export { pitWallHUD, PitWallHUD, type HUDDisplay, type HUDConfig } from './pitWallHUD.js';
export { carbonOffsetRetirement, CarbonOffsetRetirement, type RetirementReceipt, type SeasonOffsetSummary } from './carbonOffsetRetirement.js';

// Agent configuration for McLaren Carbon Auditor
export const MCLAREN_AGENT_CONFIG = {
  id: 'agent-mclaren-carbon',
  name: 'Race Carbon Auditor',
  role: 'carbon_auditor',
  description: 'Specialized in F1 telemetry analysis and carbon emission auditing for McLaren Racing (Phase 1-2)',
  tools: [
    // Phase 1: Telemetry tools
    'mclaren_ingest_telemetry',
    'mclaren_calculate_emissions',
    'mclaren_get_calculation',
    
    // Phase 1: NFT Badge tools
    'mclaren_mint_carbon_badge',
    'mclaren_batch_mint_badges',
    'mclaren_verify_badge',
    
    // Phase 1: HCS Reporting tools
    'mclaren_submit_race_report',
    'mclaren_submit_season_summary',
    'mclaren_get_report',
    
    // Phase 2: Simulation tools
    'mclaren_run_simulations',
    'mclaren_get_simulation',
    'mclaren_get_optimizations',
    
    // Phase 2: Real-time validation tools
    'mclaren_start_monitoring',
    'mclaren_update_telemetry',
    'mclaren_get_strategy_flags',
    'mclaren_get_live_carbon',
    
    // Phase 2: HUD tools
    'mclaren_init_hud',
    'mclaren_get_hud_display',
    'mclaren_get_pitwall_data',
    
    // Phase 2: Offset retirement tools
    'mclaren_retire_offsets',
    'mclaren_calculate_season_retirement',
    'mclaren_get_retirement_receipt',
    
    // Hedera integration
    'hts_create_nft',
    'hts_mint_nft',
    'hcs_create_topic',
    'hcs_submit_message',
    'kit_get_topic_info',
    'kit_get_hcs_messages',
  ],
  workflows: [
    'mclaren-race-audit',
    'mclaren-badge-drop',
    'mclaren-season-summary',
    'mclaren-pre-race-sim',
    'mclaren-live-race',
    'mclaren-season-offsets',
  ],
  systemPrompt: `You are the Race Carbon Auditor - Vera's specialized agent for McLaren Racing carbon emissions.

Your expertise includes:
- F1 telemetry data analysis (tire wear, fuel burn, route logistics)
- Carbon emission calculations using verified emission factors
- NFT badge minting for carbon-verified collectibles
- HCS-based immutable carbon reporting
- Pre-race scenario simulation (10,000+ strategies)
- Real-time race monitoring with carbon optimization
- Pit wall HUD integration
- Automated carbon offset retirement

Phase 1 Capabilities:
When auditing a race:
1. Ingest telemetry data from McLaren/FIA sources
2. Calculate total and team-share emissions
3. Generate confidence score based on data completeness
4. Provide actionable carbon reduction recommendations
5. Mint carbon-verified badges for collectible NFT buyers
6. Submit immutable audit reports to Hedera Consensus Service

Phase 2 Capabilities:
During pre-race:
1. Run 10,000+ scenario simulations for optimal strategy
2. Identify carbon-efficient strategies with minimal time loss
3. Generate strategy flags for pit wall

During race:
1. Monitor live telemetry for carbon optimization opportunities
2. Generate real-time strategy flags (tire changes, fuel save, intermediate pivot)
3. Update pit wall HUD with live carbon metrics
4. Alert on critical carbon-saving opportunities

Post-season:
1. Calculate total season emissions
2. Auto-retire carbon offsets (23% reduction target)
3. Generate retirement certificates on HCS
4. Report YoY carbon reduction to FIA/ESG sponsors

Sample outputs:
- Monaco GP: "7,030 tCO₂e total, McLaren share ~15% (pit ops, travel). Confidence 0.94, signed Vera-lattice."
- Post-race savings: "Saved 160 kg CO₂e via lean map + undercut—38 trees equivalent."
- Real-time alert: "Intermediates pivot: +4.2s gain, -110 kg CO₂e saved."
- Pit wall: "Optimal line + green offset—win margin 5.1s, net CO₂e -0.12 tons."
- Season result: "Won Monaco, cut emissions 23% YoY—182 tons offset, proven on Hedera."

Always provide:
- Exact emission figures with units (tCO₂e or kg CO₂e)
- Confidence scores (0.00-0.99)
- Hedera attestation details (topic ID, sequence number)
- Optimization recommendations with carbon and time impact
- Verification hashes for immutability

You represent the world's first real-time, verifiable motorsport sustainability platform.`,
  maxConcurrentTasks: 5,
  autoRetry: true,
  learningEnabled: true,
};

// Tool definitions for agent integration
export const MCLAREN_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'mclaren_ingest_telemetry',
      description: 'Ingest F1 telemetry data for carbon analysis. Accepts tire, fuel, logistics, and pit operations data from McLaren/FIA sources.',
      parameters: {
        type: 'object',
        properties: {
          race_id: {
            type: 'string',
            description: 'Unique race identifier (e.g., "monaco-gp-2026")',
          },
          race_name: {
            type: 'string',
            description: 'Human-readable race name (e.g., "Monaco Grand Prix 2026")',
          },
          circuit: {
            type: 'string',
            description: 'Circuit name (e.g., "Circuit de Monaco")',
          },
          session: {
            type: 'string',
            enum: ['FP1', 'FP2', 'FP3', 'QUALIFYING', 'RACE', 'SPRINT'],
            description: 'F1 session type',
          },
          team: {
            type: 'string',
            description: 'Team name (e.g., "McLaren")',
          },
          tire_data: {
            type: 'object',
            properties: {
              compound: { type: 'string', enum: ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'] },
              degradation_rate: { type: 'number' },
              laps_remaining: { type: 'number' },
            },
          },
          fuel_data: {
            type: 'object',
            properties: {
              current_level: { type: 'number' },
              consumption_per_lap: { type: 'number' },
              optimal_burn_rate: { type: 'number' },
            },
          },
          logistics: {
            type: 'object',
            properties: {
              freight_distance: { type: 'number' },
              transport_mode: { type: 'string', enum: ['air', 'sea', 'road'] },
              cargo_weight: { type: 'number' },
            },
          },
          pit_ops: {
            type: 'object',
            properties: {
              pit_stop_count: { type: 'number' },
              avg_stop_duration: { type: 'number' },
              equipment_power_draw: { type: 'number' },
              personnel_count: { type: 'number' },
            },
          },
          lap_count: { type: 'number' },
          track_length: { type: 'number' },
        },
        required: ['race_id', 'race_name', 'circuit', 'session', 'team'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mclaren_calculate_emissions',
      description: 'Calculate carbon emissions from ingested telemetry data for a specific race and session.',
      parameters: {
        type: 'object',
        properties: {
          race_id: {
            type: 'string',
            description: 'Race identifier',
          },
          session: {
            type: 'string',
            enum: ['FP1', 'FP2', 'FP3', 'QUALIFYING', 'RACE', 'SPRINT'],
            default: 'RACE',
          },
        },
        required: ['race_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mclaren_get_calculation',
      description: 'Retrieve a carbon calculation result by race ID.',
      parameters: {
        type: 'object',
        properties: {
          race_id: {
            type: 'string',
            description: 'Race identifier',
          },
          session: {
            type: 'string',
            enum: ['FP1', 'FP2', 'FP3', 'QUALIFYING', 'RACE', 'SPRINT'],
            default: 'RACE',
          },
        },
        required: ['race_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mclaren_mint_carbon_badge',
      description: 'Mint a carbon-verified badge NFT for a McLaren collectible buyer. Links collectible to verified carbon audit data.',
      parameters: {
        type: 'object',
        properties: {
          race_id: {
            type: 'string',
            description: 'Race identifier for audit data',
          },
          race_name: {
            type: 'string',
            description: 'Human-readable race name',
          },
          recipient_address: {
            type: 'string',
            description: 'Hedera account ID receiving the badge',
          },
          collectible_id: {
            type: 'string',
            description: 'ID of the associated McLaren collectible',
          },
        },
        required: ['race_id', 'race_name', 'recipient_address', 'collectible_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mclaren_batch_mint_badges',
      description: 'Batch mint carbon-verified badges for multiple collectible buyers after a race.',
      parameters: {
        type: 'object',
        properties: {
          race_id: {
            type: 'string',
            description: 'Race identifier',
          },
          race_name: {
            type: 'string',
            description: 'Race name',
          },
          recipients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                collectible_id: { type: 'string' },
              },
            },
            description: 'Array of recipient addresses and their collectible IDs',
          },
        },
        required: ['race_id', 'race_name', 'recipients'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mclaren_submit_race_report',
      description: 'Submit an immutable carbon audit report to Hedera Consensus Service (HCS). Creates verifiable record for ESG reporting.',
      parameters: {
        type: 'object',
        properties: {
          race_id: {
            type: 'string',
            description: 'Race identifier',
          },
          race_name: {
            type: 'string',
            description: 'Race name',
          },
          session: {
            type: 'string',
            enum: ['FP1', 'FP2', 'FP3', 'QUALIFYING', 'RACE', 'SPRINT'],
            default: 'RACE',
          },
        },
        required: ['race_id', 'race_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mclaren_get_report',
      description: 'Retrieve a submitted carbon audit report by race ID.',
      parameters: {
        type: 'object',
        properties: {
          race_id: {
            type: 'string',
            description: 'Race identifier',
          },
          session: {
            type: 'string',
            enum: ['FP1', 'FP2', 'FP3', 'QUALIFYING', 'RACE', 'SPRINT'],
            default: 'RACE',
          },
        },
        required: ['race_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mclaren_submit_season_summary',
      description: 'Submit a season-end carbon summary report to HCS. Aggregates all race audits for annual ESG reporting.',
      parameters: {
        type: 'object',
        properties: {
          season: {
            type: 'string',
            description: 'Season year (e.g., "2026")',
          },
          team: {
            type: 'string',
            description: 'Team name',
          },
          race_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of race IDs to include in summary',
          },
        },
        required: ['season', 'team', 'race_ids'],
      },
    },
  },
];

// Workflow definitions
export const MCLAREN_WORKFLOW_DEFINITIONS = {
  'mclaren-race-audit': {
    id: 'mclaren-race-audit',
    name: 'Race Carbon Audit Workflow',
    description: 'Complete carbon audit workflow for a single race',
    steps: [
      { tool: 'mclaren_ingest_telemetry', input: '{{telemetry}}' },
      { tool: 'mclaren_calculate_emissions', input: { race_id: '{{race_id}}', session: '{{session}}' } },
      { tool: 'mclaren_submit_race_report', input: { race_id: '{{race_id}}', race_name: '{{race_name}}', session: '{{session}}' } },
    ],
  },
  'mclaren-badge-drop': {
    id: 'mclaren-badge-drop',
    name: 'Post-Race Badge Drop',
    description: 'Mint carbon-verified badges after race completion',
    steps: [
      { tool: 'mclaren_calculate_emissions', input: { race_id: '{{race_id}}', session: 'RACE' } },
      { tool: 'mclaren_batch_mint_badges', input: { race_id: '{{race_id}}', race_name: '{{race_name}}', recipients: '{{recipients}}' } },
    ],
  },
  'mclaren-season-summary': {
    id: 'mclaren-season-summary',
    name: 'Season Carbon Summary',
    description: 'Generate and submit end-of-season carbon report',
    steps: [
      { tool: 'mclaren_submit_season_summary', input: { season: '{{season}}', team: '{{team}}', race_ids: '{{race_ids}}' } },
    ],
  },
};
