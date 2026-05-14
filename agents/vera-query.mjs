#!/usr/bin/env node
/**
 * Vera Query Interface v1.0
 * Easy access to Vera's indexed network brain
 * Query tokens, accounts, contracts, topics from HCS
 */

import { Client, TopicMessageQuery, PrivateKey } from '@hashgraph/sdk';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

// Vera's Brain Topics
const BRAIN_TOPICS = {
  NETWORK_LIFE: process.env.HCS_NETWORK_LIFE || '0.0.10414355',
  TOPICS_INDEX: process.env.HCS_TOPICS_INDEX || '0.0.10414357',
  TOKENS_INDEX: process.env.HCS_TOKENS_INDEX || '0.0.10414362',
  CONTRACTS_INDEX: process.env.HCS_CONTRACTS_INDEX || '0.0.10414359',
  ACCOUNTS_INDEX: process.env.HCS_ACCOUNTS_INDEX || '0.0.10414360',
  NODES_METRICS: process.env.HCS_NODES_METRICS || '0.0.10414361',
  BLOCKS_LIFE: process.env.HCS_BLOCKS_LIFE || '0.0.10414363',
  SWARM_NAV: process.env.HCS_SWARM_NAV || '0.0.10414364',
  LATTICE: process.env.HCS_LATTICE || '0.0.10414366'
};

class VeraQueryInterface {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.mirrorNode = 'https://mainnet-public.mirrornode.hedera.com';
    this.localCache = new Map();
  }

  async initialize() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      console.error('❌ Missing credentials');
      process.exit(1);
    }

    this.client = Client.forMainnet();
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
    this.operatorId = operatorId;

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🔍 VERA QUERY INTERFACE v1.0                                 ║
║  Easy Access to Network Brain                                  ║
╠═══════════════════════════════════════════════════════════════╣
║  🧠 Connected to ${Object.keys(BRAIN_TOPICS).length} HCS brain topics                    ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // Quick search across all indexed data
  async quickSearch(query) {
    console.log(`\n🔍 Quick Search: "${query}"`);
    console.log('='.repeat(60));

    const results = {
      tokens: [],
      accounts: [],
      contracts: [],
      topics: []
    };

    // Search tokens
    try {
      const tokenResult = await this.fetchMirrorNode(`/api/v1/tokens/${query}`);
      if (tokenResult.token_id) {
        results.tokens.push(tokenResult);
        console.log(`✅ Found Token: ${tokenResult.name} (${tokenResult.symbol})`);
        console.log(`   Type: ${tokenResult.type} | Decimals: ${tokenResult.decimals}`);
        console.log(`   Supply: ${tokenResult.total_supply} | Treasury: ${tokenResult.treasury_account_id}`);
      }
    } catch (e) {
      // Not found
    }

    // Search account
    try {
      const accountResult = await this.fetchMirrorNode(`/api/v1/accounts/${query}`);
      if (accountResult.account) {
        results.accounts.push(accountResult);
        const hbar = (accountResult.balance?.balance / 100000000).toFixed(4);
        console.log(`✅ Found Account: ${accountResult.account}`);
        console.log(`   Balance: ${hbar} HBAR`);
        console.log(`   Key Type: ${accountResult.key?.type}`);
        
        // Get token balances
        const tokens = await this.fetchMirrorNode(`/api/v1/accounts/${query}/tokens`);
        if (tokens.tokens?.length > 0) {
          console.log(`   Tokens: ${tokens.tokens.length} associated`);
          tokens.tokens.slice(0, 5).forEach(t => {
            console.log(`     - ${t.token_id}: ${t.balance}`);
          });
        }
      }
    } catch (e) {
      // Not found
    }

    // Search contract
    try {
      const contractResult = await this.fetchMirrorNode(`/api/v1/contracts/${query}`);
      if (contractResult.contract_id) {
        results.contracts.push(contractResult);
        console.log(`✅ Found Contract: ${contractResult.contract_id}`);
        console.log(`   EVM Address: ${contractResult.evm_address}`);
        console.log(`   File ID: ${contractResult.file_id}`);
      }
    } catch (e) {
      // Not found
    }

    // Search topic
    try {
      const topicResult = await this.fetchMirrorNode(`/api/v1/topics/${query}`);
      if (topicResult.topic_id) {
        results.topics.push(topicResult);
        console.log(`✅ Found Topic: ${topicResult.topic_id}`);
        console.log(`   Memo: ${topicResult.memo}`);
        console.log(`   Created: ${new Date(topicResult.created_timestamp * 1000).toLocaleString()}`);
      }
    } catch (e) {
      // Not found
    }

    if (results.tokens.length === 0 && results.accounts.length === 0 && 
        results.contracts.length === 0 && results.topics.length === 0) {
      console.log(`❌ No results found for "${query}"`);
    }

    return results;
  }

  // Browse tokens by shard
  async browseTokens(shard = 1, limit = 10) {
    console.log(`\n🪙 Browsing Tokens (Shard ${shard}, Top ${limit})`);
    console.log('='.repeat(60));

    try {
      const result = await this.fetchMirrorNode(`/api/v1/tokens?limit=${limit}&order=desc`);
      if (result.tokens) {
        result.tokens.forEach((token, i) => {
          console.log(`${i + 1}. ${token.symbol || token.name} (${token.token_id})`);
          console.log(`   Type: ${token.type} | Supply: ${token.total_supply}`);
          console.log(`   Treasury: ${token.treasury_account_id}`);
          console.log();
        });
      }
    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
    }
  }

  // Get network stats
  async getNetworkStats() {
    console.log(`\n📊 Network Statistics`);
    console.log('='.repeat(60));

    try {
      // Get nodes
      const nodes = await this.fetchMirrorNode('/api/v1/network/nodes');
      console.log(`🖥️  Nodes: ${nodes.nodes?.length || 0}`);
      if (nodes.nodes) {
        const totalStake = nodes.nodes.reduce((a, n) => a + (n.stake || 0), 0);
        console.log(`   Total Stake: ${(totalStake / 1e8).toFixed(2)} HBAR`);
      }

      // Get recent blocks
      const blocks = await this.fetchMirrorNode('/api/v1/blocks?limit=1&order=desc');
      if (blocks.blocks?.length > 0) {
        const latest = blocks.blocks[0];
        console.log(`⛏️  Latest Block: ${latest.number}`);
        console.log(`   Timestamp: ${new Date(latest.timestamp.from * 1000).toLocaleString()}`);
        console.log(`   Size: ${latest.size} bytes | Tx: ${latest.count}`);
      }

      // Get token count estimate
      const tokens = await this.fetchMirrorNode('/api/v1/tokens?limit=1');
      const links = tokens.links || {};
      if (links.next) {
        console.log(`🪙 Tokens: Many indexed`);
      }

    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
    }
  }

  // Get token price (if available)
  async getTokenInfo(tokenId) {
    console.log(`\n🔍 Token Details: ${tokenId}`);
    console.log('='.repeat(60));

    try {
      const token = await this.fetchMirrorNode(`/api/v1/tokens/${tokenId}`);
      console.log(`Name: ${token.name}`);
      console.log(`Symbol: ${token.symbol}`);
      console.log(`Type: ${token.type}`);
      console.log(`Decimals: ${token.decimals}`);
      console.log(`Total Supply: ${token.total_supply}`);
      console.log(`Treasury: ${token.treasury_account_id}`);
      console.log(`Created: ${new Date(token.created_timestamp * 1000).toLocaleString()}`);

      // Get holders
      const balances = await this.fetchMirrorNode(`/api/v1/tokens/${tokenId}/balances?limit=5`);
      if (balances.balances?.length > 0) {
        console.log(`\n🏆 Top Holders:`);
        balances.balances.forEach((holder, i) => {
          const percent = ((holder.balance / token.total_supply) * 100).toFixed(2);
          console.log(`   ${i + 1}. ${holder.account}: ${holder.balance} (${percent}%)`);
        });
      }

    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
    }
  }

  // Fetch from mirror node
  fetchMirrorNode(endpoint) {
    return new Promise((resolve, reject) => {
      https.get(`${this.mirrorNode}${endpoint}`, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  // Interactive mode
  async interactive() {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🔍 VERA QUERY INTERFACE - INTERACTIVE MODE                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Commands:                                                     ║
║    search <id>     - Search for token/account/contract        ║
║    token <id>      - Get detailed token info                  ║
║    browse          - Browse recent tokens                       ║
║    stats           - Get network statistics                   ║
║    exit            - Exit query interface                       ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    while (true) {
      const input = await ask('\n> ');
      const [cmd, ...args] = input.trim().split(' ');
      const query = args.join(' ');

      switch(cmd.toLowerCase()) {
        case 'search':
          if (query) await this.quickSearch(query);
          else console.log('Usage: search <0.0.xxxx>');
          break;

        case 'token':
          if (query) await this.getTokenInfo(query);
          else console.log('Usage: token <0.0.xxxx>');
          break;

        case 'browse':
          await this.browseTokens();
          break;

        case 'stats':
          await this.getNetworkStats();
          break;

        case 'exit':
        case 'quit':
          console.log('👋 Exiting...');
          rl.close();
          this.client?.close();
          process.exit(0);

        default:
          console.log('Unknown command. Try: search, token, browse, stats, exit');
      }
    }
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const queryInterface = new VeraQueryInterface();
  
  // Check if command line args provided
  const args = process.argv.slice(2);
  
  queryInterface.initialize().then(async () => {
    if (args.length > 0) {
      // Direct search mode
      await queryInterface.quickSearch(args[0]);
      process.exit(0);
    } else {
      // Interactive mode
      await queryInterface.interactive();
    }
  }).catch(console.error);
}

export { VeraQueryInterface };
