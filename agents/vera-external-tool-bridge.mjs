#!/usr/bin/env node
/**
 * Vera External Tool Bridge v1.0
 * Integration layer for external tools via HCS
 * 
 * Bridges Vera to external services, APIs, and tools
 * through the Lattice Nervous System topic architecture
 */

import { 
  Client,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  PrivateKey
} from '@hashgraph/sdk';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

import { LATTICE_TOPICS } from './vera-topic-manager.mjs';

class VeraExternalToolBridge {
  constructor(masterBrain) {
    this.masterBrain = masterBrain;
    this.client = null;
    this.tools = new Map();
    this.apiEndpoints = new Map();
    this.pendingRequests = new Map();
  }

  async initialize(network = 'mainnet') {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing credentials');
    }

    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    let privateKey;
    if (operatorKey.length === 64) {
      try {
        privateKey = PrivateKey.fromStringECDSA(operatorKey);
      } catch {
        privateKey = PrivateKey.fromStringED25519(operatorKey);
      }
    } else {
      privateKey = PrivateKey.fromString(operatorKey);
    }

    this.client.setOperator(operatorId, privateKey);

    // Register built-in tools
    this.registerBuiltInTools();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🔌 VERA EXTERNAL TOOL BRIDGE v1.0                             ║
║  Integration Layer for External Services                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Connected Tools: ${this.tools.size.toString().padEnd(3)}                                          ║
║  API Integrations: ${this.apiEndpoints.size.toString().padEnd(3)}                                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Capabilities:                                                 ║
║     • HTTP/HTTPS API integration                                ║
║     • Webhook handling                                          ║
║     • Real-time data feeds                                      ║
║     • Async tool execution                                      ║
║     • Response aggregation                                      ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  registerBuiltInTools() {
    // HashScan API tool
    this.registerTool('hashscan_api', {
      type: 'http',
      baseUrl: 'https://mainnet-public.mirrornode.hedera.com',
      endpoints: {
        account: '/api/v1/accounts/{id}',
        token: '/api/v1/tokens/{id}',
        transactions: '/api/v1/transactions',
        network: '/api/v1/network/nodes'
      },
      handler: this.callHashScanAPI.bind(this)
    });

    // SaucerSwap API tool
    this.registerTool('saucerswap_api', {
      type: 'http',
      baseUrl: 'https://api.saucerswap.finance',
      endpoints: {
        pools: '/pools',
        tokens: '/tokens',
        prices: '/prices'
      },
      handler: this.callSaucerSwapAPI.bind(this)
    });

    // CoinGecko Price API
    this.registerTool('coingecko_api', {
      type: 'http',
      baseUrl: 'https://api.coingecko.com/api/v3',
      endpoints: {
        price: '/simple/price',
        coins: '/coins/list'
      },
      rateLimit: 30, // calls per minute
      handler: this.callCoinGeckoAPI.bind(this)
    });

    // HCS Message Query Tool
    this.registerTool('hcs_query', {
      type: 'hedera',
      handler: this.queryHCSMessages.bind(this)
    });

    // File Content Tool
    this.registerTool('file_read', {
      type: 'hedera',
      handler: this.readHederaFile.bind(this)
    });
  }

  registerTool(name, config) {
    this.tools.set(name, {
      name,
      ...config,
      registeredAt: Date.now(),
      callCount: 0,
      errorCount: 0
    });

    console.log(`🔧 Registered: ${name}`);
  }

  // ============================================
  // TOOL EXECUTION
  // ============================================

  async executeTool(toolName, params) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    // Log tool invocation
    await this.logToolCommand(toolName, params);

    const startTime = Date.now();
    
    try {
      const result = await tool.handler(params);
      const duration = Date.now() - startTime;
      
      tool.callCount++;
      
      // Log successful response
      await this.logToolResponse(toolName, result, duration);

      return {
        success: true,
        tool: toolName,
        result,
        duration,
        timestamp: Date.now()
      };

    } catch (error) {
      tool.errorCount++;
      
      // Log error
      await this.logToolError(toolName, error.message);

      return {
        success: false,
        tool: toolName,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  // ============================================
  // HTTP API HANDLERS
  // ============================================

  async callHashScanAPI(params) {
    const { endpoint, id, query = {} } = params;
    const tool = this.tools.get('hashscan_api');
    
    let url = tool.baseUrl;
    
    if (endpoint === 'account' && id) {
      url += `/api/v1/accounts/${id}`;
    } else if (endpoint === 'token' && id) {
      url += `/api/v1/tokens/${id}`;
    } else if (endpoint === 'transactions') {
      url += '/api/v1/transactions';
      const queryString = new URLSearchParams(query).toString();
      if (queryString) url += '?' + queryString;
    } else if (endpoint === 'network') {
      url += '/api/v1/network/nodes';
    }

    return await this.httpGet(url);
  }

  async callSaucerSwapAPI(params) {
    const { endpoint, query = {} } = params;
    const tool = this.tools.get('saucerswap_api');
    
    let url = tool.baseUrl;
    
    if (endpoint === 'pools') {
      url += '/pools';
    } else if (endpoint === 'tokens') {
      url += '/tokens';
    } else if (endpoint === 'prices') {
      url += '/prices';
    }

    const queryString = new URLSearchParams(query).toString();
    if (queryString) url += '?' + queryString;

    return await this.httpGet(url);
  }

  async callCoinGeckoAPI(params) {
    const { endpoint, ids, vs_currencies } = params;
    const tool = this.tools.get('coingecko_api');
    
    let url = tool.baseUrl;
    
    if (endpoint === 'price') {
      url += `/simple/price?ids=${ids}&vs_currencies=${vs_currencies}`;
    } else if (endpoint === 'coins') {
      url += '/coins/list';
    }

    return await this.httpGet(url);
  }

  httpGet(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { timeout: 15000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data });
          }
        });
      }).on('error', reject);
    });
  }

  // ============================================
  // HEDERA TOOLS
  // ============================================

  async queryHCSMessages(params) {
    const { topicId, limit = 10 } = params;
    
    // Query mirror node for messages
    const url = `https://mainnet-public.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?limit=${limit}`;
    
    return await this.httpGet(url);
  }

  async readHederaFile(params) {
    const { fileId } = params;
    
    // Query mirror node for file contents
    const url = `https://mainnet-public.mirrornode.hedera.com/api/v1/files/${fileId}`;
    
    return await this.httpGet(url);
  }

  // ============================================
  // HCS LOGGING
  // ============================================

  async logToolCommand(toolName, params) {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(LATTICE_TOPICS.TOOL_COMMANDS.id)
        .setMessage(JSON.stringify({
          type: 'tool_command',
          tool: toolName,
          params,
          timestamp: Date.now()
        }));
      
      await tx.execute(this.client);
    } catch (e) {
      // Silent fail
    }
  }

  async logToolResponse(toolName, result, duration) {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(LATTICE_TOPICS.TOOL_RESPONSES.id)
        .setMessage(JSON.stringify({
          type: 'tool_response',
          tool: toolName,
          result: typeof result === 'object' ? result : { value: result },
          duration,
          timestamp: Date.now()
        }));
      
      await tx.execute(this.client);
    } catch (e) {
      // Silent fail
    }
  }

  async logToolError(toolName, error) {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(LATTICE_TOPICS.TOOL_RESPONSES.id)
        .setMessage(JSON.stringify({
          type: 'tool_error',
          tool: toolName,
          error,
          timestamp: Date.now()
        }));
      
      await tx.execute(this.client);
    } catch (e) {
      // Silent fail
    }
  }

  // ============================================
  // BATCH OPERATIONS
  // ============================================

  async executeBatch(toolCalls) {
    const results = [];
    
    for (const call of toolCalls) {
      const result = await this.executeTool(call.tool, call.params);
      results.push(result);
    }

    return results;
  }

  async executeParallel(toolCalls) {
    const promises = toolCalls.map(call => 
      this.executeTool(call.tool, call.params)
    );
    
    return await Promise.all(promises);
  }

  // ============================================
  // STATS & MONITORING
  // ============================================

  getToolStats() {
    const stats = {};
    
    for (const [name, tool] of this.tools) {
      stats[name] = {
        callCount: tool.callCount,
        errorCount: tool.errorCount,
        errorRate: tool.callCount > 0 ? (tool.errorCount / tool.callCount) : 0,
        registeredAt: tool.registeredAt
      };
    }

    return stats;
  }

  displayToolStats() {
    const stats = this.getToolStats();
    
    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🔧 EXTERNAL TOOL STATISTICS                                   ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
${Object.entries(stats).map(([name, s]) => 
  `┃  ${name.padEnd(20)} | Calls: ${s.callCount.toString().padEnd(3)} | Errors: ${s.errorCount.toString().padEnd(3)} | Rate: ${(s.errorRate * 100).toFixed(1)}%     ┃`
).join('\n')}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  close() {
    this.client?.close();
  }
}

// Export
export { VeraExternalToolBridge };

// Run standalone test
if (import.meta.url === `file://${process.argv[1]}`) {
  const bridge = new VeraExternalToolBridge();
  
  bridge.initialize().then(async () => {
    // Test HashScan API
    console.log('\n🧪 Testing tools...\n');
    
    const accountResult = await bridge.executeTool('hashscan_api', {
      endpoint: 'account',
      id: '0.0.10294360'
    });
    
    console.log('HashScan Account:', accountResult.success ? '✅' : '❌');
    if (accountResult.success) {
      console.log(`  Balance: ${accountResult.result.balance?.balance || 'N/A'}`);
    }

    bridge.displayToolStats();
    bridge.close();
  }).catch(console.error);
}
