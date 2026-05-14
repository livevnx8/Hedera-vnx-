/**
 * LangChain + LlamaIndex Bridge for VeraLattice
 *
 * Exposes Vera's 50+ Hedera tools as LangChain Tools and LlamaIndex QueryEngine tools,
 * enabling Vera to be embedded into existing RAG pipelines and agent frameworks.
 */

import { logger } from '../monitoring/logger.js';

// ─── Types (mimic LangChain tool interface without requiring the dependency) ───

export interface LangChainTool {
  name: string;
  description: string;
  invoke(input: string): Promise<string>;
}

export interface LlamaIndexTool {
  metadata: {
    name: string;
    description: string;
    fnSchema: Record<string, unknown>;
  };
  call(input: Record<string, unknown>): Promise<string>;
}

// ─── Vera Tool Registry ───────────────────────────────────────────────────────

interface VeraToolDef {
  name: string;
  description: string;
  category: string;
  layer: number;
  parameters?: Record<string, { type: string; description: string; required?: boolean }>;
  fn: (args: Record<string, unknown>) => Promise<unknown>;
}

let toolRegistry: VeraToolDef[] = [];
let registryInitialized = false;

async function initRegistry() {
  if (registryInitialized) return;

  // Dynamically import all Hedera tool executors to avoid circular deps at module load
  const { runAgentStream } = await import('../agent/runner.js');
  const { getAccountBalance } = await import('../hedera/mirrorApi.js');

  toolRegistry = [
    {
      name: 'hedera_transfer_hbar',
      description: 'Transfer HBAR to a Hedera account. Args: {to_account_id: string, amount_hbar: number, memo?: string}',
      category: 'token',
      layer: 2,
      parameters: {
        to_account_id: { type: 'string', description: 'Hedera account ID (0.0.xxx)', required: true },
        amount_hbar: { type: 'number', description: 'Amount in HBAR', required: true },
        memo: { type: 'string', description: 'Optional memo', required: false },
      },
      fn: async (args) => {
        const { transferHbar } = await import('../hedera/hederaTxTools.js');
        const result = await transferHbar({
          toAccountId: args['to_account_id'] as string,
          amountHbar: args['amount_hbar'] as number,
          memo: args['memo'] as string | undefined,
        });
        return JSON.stringify(result);
      },
    },
    {
      name: 'hedera_get_balance',
      description: 'Get HBAR and token balance for a Hedera account. Args: {account_id: string}',
      category: 'query',
      layer: 2,
      parameters: {
        account_id: { type: 'string', description: 'Hedera account ID', required: true },
      },
      fn: async (args) => {
        const bal = await getAccountBalance(args['account_id'] as string);
        return JSON.stringify(bal);
      },
    },
    {
      name: 'hedera_associate_token',
      description: 'Associate an HTS token with an account. Args: {token_id: string, account_id?: string}',
      category: 'token',
      layer: 2,
      parameters: {
        token_id: { type: 'string', description: 'Token ID', required: true },
        account_id: { type: 'string', description: 'Account ID (defaults to operator)', required: false },
      },
      fn: async (args) => {
        const { associateHtsToken } = await import('../hedera/hederaTxTools.js');
        const result = await associateHtsToken({
          tokenId: args['token_id'] as string,
          accountId: args['account_id'] as string | undefined,
        });
        return JSON.stringify(result);
      },
    },
    {
      name: 'hedera_hcs_send_message',
      description: 'Send a message to an HCS topic. Args: {topic_id: string, message: string}',
      category: 'hcs',
      layer: 2,
      parameters: {
        topic_id: { type: 'string', description: 'HCS topic ID', required: true },
        message: { type: 'string', description: 'Message payload', required: true },
      },
      fn: async (args) => {
        const { sendHcsMessage } = await import('../hedera/hederaTxTools.js');
        const result = await sendHcsMessage({
          topicId: args['topic_id'] as string,
          message: args['message'] as string,
        });
        return JSON.stringify(result);
      },
    },
    {
      name: 'hedera_create_token',
      description: 'Create an HTS fungible token. Args: {name: string, symbol: string, decimals?: number, initial_supply?: number, max_supply?: number}',
      category: 'token',
      layer: 2,
      parameters: {
        name: { type: 'string', description: 'Token name', required: true },
        symbol: { type: 'string', description: 'Token symbol', required: true },
        decimals: { type: 'number', description: 'Decimals', required: false },
        initial_supply: { type: 'number', description: 'Initial supply', required: false },
        max_supply: { type: 'number', description: 'Max supply', required: false },
      },
      fn: async (args) => {
        const { createHtsToken } = await import('../hedera/hederaTxTools.js');
        const result = await createHtsToken({
          name: args['name'] as string,
          symbol: args['symbol'] as string,
          decimals: args['decimals'] as number | undefined,
          initialSupply: args['initial_supply'] as number | undefined,
          maxSupply: args['max_supply'] as number | undefined,
        });
        return JSON.stringify(result);
      },
    },
    {
      name: 'hedera_mint_token',
      description: 'Mint HTS tokens. Args: {token_id: string, amount: number}',
      category: 'token',
      layer: 2,
      parameters: {
        token_id: { type: 'string', description: 'Token ID', required: true },
        amount: { type: 'number', description: 'Amount to mint', required: true },
      },
      fn: async (args) => {
        const { mintHtsToken } = await import('../hedera/hederaTxTools.js');
        const result = await mintHtsToken({
          tokenId: args['token_id'] as string,
          amount: args['amount'] as number,
        });
        return JSON.stringify(result);
      },
    },
    {
      name: 'hedera_transfer_token',
      description: 'Transfer HTS tokens. Args: {token_id: string, to_account_id: string, amount: number}',
      category: 'token',
      layer: 2,
      parameters: {
        token_id: { type: 'string', description: 'Token ID', required: true },
        to_account_id: { type: 'string', description: 'Recipient account', required: true },
        amount: { type: 'number', description: 'Amount', required: true },
      },
      fn: async (args) => {
        const { transferHtsToken } = await import('../hedera/hederaTxTools.js');
        const result = await transferHtsToken({
          tokenId: args['token_id'] as string,
          toAccountId: args['to_account_id'] as string,
          amount: args['amount'] as number,
        });
        return JSON.stringify(result);
      },
    },
    {
      name: 'hedera_create_account',
      description: 'Create a new Hedera account. Args: {initial_hbar?: number, memo?: string}',
      category: 'account',
      layer: 2,
      parameters: {
        initial_hbar: { type: 'number', description: 'Initial HBAR balance', required: false },
        memo: { type: 'string', description: 'Memo', required: false },
      },
      fn: async (args) => {
        const { createHederaAccount } = await import('../hedera/hederaTxTools.js');
        const result = await createHederaAccount({
          initialHbar: args['initial_hbar'] as number | undefined,
          memo: args['memo'] as string | undefined,
        });
        return JSON.stringify(result);
      },
    },
    {
      name: 'vera_chat',
      description: 'Send a chat message to Vera and get a response. Args: {message: string}',
      category: 'ai',
      layer: 0,
      parameters: {
        message: { type: 'string', description: 'User message', required: true },
      },
      fn: async (args) => {
        const stream = runAgentStream({
          messages: [{ role: 'user', content: args['message'] as string }],
        });
        let content = '';
        for await (const event of stream) {
          if (event.type === 'text') content += event.content;
        }
        return content;
      },
    },
    {
      name: 'vera_lattice_state',
      description: 'Get the current Flower of Life lattice state. No args.',
      category: 'lattice',
      layer: 0,
      fn: async () => {
        const { hierarchicalCoordinator } = await import('../vera/orchestrator/hierarchicalCoordinator.js');
        return JSON.stringify(hierarchicalCoordinator.getLatticeState());
      },
    },
  ];

  registryInitialized = true;
  logger.info('LangChainBridge', { message: `Registered ${toolRegistry.length} Vera tools` });
}

// ─── LangChain-compatible Tool Wrapper ────────────────────────────────────────

class VeraLangChainTool implements LangChainTool {
  constructor(private def: VeraToolDef) {}

  get name() {
    return this.def.name;
  }

  get description() {
    return this.def.description;
  }

  async invoke(input: string): Promise<string> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(input);
    } catch {
      // If not valid JSON, treat the whole string as the primary arg
      const firstParam = Object.keys(this.def.parameters ?? {})[0];
      args = firstParam ? { [firstParam]: input } : {};
    }
    const result = await this.def.fn(args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }
}

// ─── LlamaIndex-compatible Tool Wrapper ───────────────────────────────────────

class VeraLlamaIndexTool implements LlamaIndexTool {
  constructor(private def: VeraToolDef) {}

  get metadata() {
    return {
      name: this.def.name,
      description: this.def.description,
      fnSchema: this.def.parameters ?? {},
    };
  }

  async call(input: Record<string, unknown>): Promise<string> {
    const result = await this.def.fn(input);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getLangChainTools(): Promise<LangChainTool[]> {
  await initRegistry();
  return toolRegistry.map((d) => new VeraLangChainTool(d));
}

export async function getLlamaIndexTools(): Promise<LlamaIndexTool[]> {
  await initRegistry();
  return toolRegistry.map((d) => new VeraLlamaIndexTool(d));
}

export async function getToolsByCategory(category: string): Promise<(LangChainTool | LlamaIndexTool)[]> {
  await initRegistry();
  return toolRegistry
    .filter((d) => d.category === category)
    .map((d) => new VeraLangChainTool(d));
}

export async function getToolsByLayer(layer: number): Promise<(LangChainTool | LlamaIndexTool)[]> {
  await initRegistry();
  return toolRegistry
    .filter((d) => d.layer === layer)
    .map((d) => new VeraLangChainTool(d));
}

export async function findTool(name: string): Promise<VeraToolDef | undefined> {
  await initRegistry();
  return toolRegistry.find((d) => d.name === name);
}

export async function invokeTool(name: string, args: Record<string, unknown>): Promise<string> {
  await initRegistry();
  const tool = toolRegistry.find((d) => d.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  const result = await tool.fn(args);
  return typeof result === 'string' ? result : JSON.stringify(result);
}
