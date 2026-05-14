#!/usr/bin/env node
/**
 * Vera HashScan Lattice Mapper v1.0
 * Comprehensive Hedera blockchain explorer with lattice mapping
 * Logs all findings to HCS for swarm navigation
 */

import { Client, Hbar, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

// HCS Topics for Vera's brain
const BRAIN_TOPICS = {
  DISCOVERIES: process.env.HCS_DISCOVERIES_TOPIC || '0.0.10414355',
  MAPPINGS: process.env.HCS_MAPPINGS_TOPIC || '0.0.10414357',
  SWARM_NAV: process.env.HCS_SWARM_NAV_TOPIC || '0.0.10414362'
};

class HashScanLatticeMapper {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.mirrorNode = 'https://mainnet-public.mirrornode.hedera.com';
    this.cache = new Map();
    this.discoveries = [];
    this.latticeMap = {
      accounts: new Map(),
      tokens: new Map(),
      contracts: new Map(),
      transactions: new Map(),
      relationships: []
    };
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

    console.log(`✅ HashScan Lattice Mapper initialized`);
    console.log(`🧠 Connected to Vera's brain (HCS topics)`);
    console.log(`🔗 Mirror Node: ${this.mirrorNode}\n`);

    return this;
  }

  // Fetch from mirror node with caching
  async fetch(endpoint) {
    const cacheKey = endpoint;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    return new Promise((resolve, reject) => {
      https.get(`${this.mirrorNode}${endpoint}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            this.cache.set(cacheKey, parsed);
            resolve(parsed);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  // Log discovery to Vera's brain (HCS)
  async logToBrain(type, data) {
    try {
      const message = JSON.stringify({
        timestamp: Date.now(),
        type,
        data,
        explorer: 'hashscan-lattice',
        version: '1.0'
      });

      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(BRAIN_TOPICS.DISCOVERIES)
        .setMessage(message);

      const response = await tx.execute(this.client);
      await response.getReceipt(this.client);

      console.log(`🧠 Logged ${type} to Vera's brain`);
    } catch (e) {
      console.log(`⚠️  Could not log to HCS: ${e.message}`);
    }
  }

  // Explore an account and map its relationships
  async exploreAccount(accountId) {
    console.log(`🔍 Exploring account ${accountId}...`);
    
    try {
      // Get account info
      const account = await this.fetch(`/api/v1/accounts/${accountId}`);
      
      // Get token balances
      const tokens = await this.fetch(`/api/v1/accounts/${accountId}/tokens`);
      
      // Get recent transactions
      const txs = await this.fetch(`/api/v1/accounts/${accountId}/transactions?limit=10`);

      const discovery = {
        accountId,
        balance: account.balance?.balance,
        hbarBalance: account.balance?.balance ? (account.balance.balance / 100000000).toFixed(4) : '0',
        tokens: tokens.tokens || [],
        recentTxs: txs.transactions || [],
        type: this.classifyAccount(account, tokens),
        timestamp: Date.now()
      };

      // Store in lattice
      this.latticeMap.accounts.set(accountId, discovery);
      this.discoveries.push(discovery);

      // Log to brain
      await this.logToBrain('account_discovery', discovery);

      // Explore relationships
      await this.mapRelationships(accountId, discovery);

      console.log(`✅ Mapped account: ${discovery.hbarBalance} HBAR, ${discovery.tokens.length} tokens`);
      
      return discovery;
    } catch (e) {
      console.error(`❌ Error exploring ${accountId}: ${e.message}`);
      return null;
    }
  }

  // Classify account type
  classifyAccount(account, tokens) {
    if (account?.contract_id) return 'contract';
    if (tokens?.tokens?.length > 10) return 'whale';
    if (tokens?.tokens?.length > 0) return 'trader';
    if (account?.key?.type === 'contractID') return 'contract-account';
    return 'standard';
  }

  // Map relationships between entities
  async mapRelationships(accountId, discovery) {
    const relationships = [];

    // Token associations
    for (const token of discovery.tokens) {
      relationships.push({
        from: accountId,
        to: token.token_id,
        type: 'holds_token',
        balance: token.balance
      });

      // Explore token if not already mapped
      if (!this.latticeMap.tokens.has(token.token_id)) {
        await this.exploreToken(token.token_id);
      }
    }

    // Transaction relationships
    for (const tx of discovery.recentTxs.slice(0, 5)) {
      const related = this.extractRelatedEntities(tx, accountId);
      for (const entity of related) {
        relationships.push({
          from: accountId,
          to: entity,
          type: 'transaction',
          txId: tx.transaction_id
        });
      }
    }

    this.latticeMap.relationships.push(...relationships);
    
    // Log relationships
    if (relationships.length > 0) {
      await this.logToBrain('relationships', { accountId, relationships });
    }
  }

  // Extract related entities from transaction
  extractRelatedEntities(tx, excludeId) {
    const related = [];
    
    // Check transfers
    if (tx.transfers) {
      for (const transfer of tx.transfers) {
        if (transfer.account !== excludeId) {
          related.push(transfer.account);
        }
      }
    }

    // Check token transfers
    if (tx.token_transfers) {
      for (const transfer of tx.token_transfers) {
        if (transfer.account !== excludeId) {
          related.push(transfer.account);
        }
        if (!related.includes(transfer.token_id)) {
          related.push(transfer.token_id);
        }
      }
    }

    return [...new Set(related)];
  }

  // Explore a token
  async exploreToken(tokenId) {
    if (this.latticeMap.tokens.has(tokenId)) return;

    console.log(`🪙 Exploring token ${tokenId}...`);

    try {
      const token = await this.fetch(`/api/v1/tokens/${tokenId}`);
      const holders = await this.fetch(`/api/v1/tokens/${tokenId}/balances?limit=5`);

      const discovery = {
        tokenId,
        name: token.name,
        symbol: token.symbol,
        type: token.type,
        decimals: token.decimals,
        totalSupply: token.total_supply,
        treasury: token.treasury_account_id,
        topHolders: holders.balances || [],
        timestamp: Date.now()
      };

      this.latticeMap.tokens.set(tokenId, discovery);
      await this.logToBrain('token_discovery', discovery);

      console.log(`✅ Mapped token: ${token.name} (${token.symbol})`);
      
      return discovery;
    } catch (e) {
      console.error(`❌ Error exploring token ${tokenId}: ${e.message}`);
      return null;
    }
  }

  // Explore a contract
  async exploreContract(contractId) {
    if (this.latticeMap.contracts.has(contractId)) return;

    console.log(`📜 Exploring contract ${contractId}...`);

    try {
      const contract = await this.fetch(`/api/v1/contracts/${contractId}`);
      const results = await this.fetch(`/api/v1/contracts/${contractId}/results?limit=5`);

      const discovery = {
        contractId,
        fileId: contract.file_id,
        accountId: contract.contract_id,
        memo: contract.memo,
        runtimeBytecode: contract.runtime_bytecode?.substring(0, 100),
        recentCalls: results.results || [],
        timestamp: Date.now()
      };

      this.latticeMap.contracts.set(contractId, discovery);
      await this.logToBrain('contract_discovery', discovery);

      console.log(`✅ Mapped contract: ${contractId}`);
      
      return discovery;
    } catch (e) {
      console.error(`❌ Error exploring contract ${contractId}: ${e.message}`);
      return null;
    }
  }

  // Search for entities by keyword
  async search(query) {
    console.log(`🔎 Searching for "${query}"...`);

    const results = {
      accounts: [],
      tokens: [],
      contracts: []
    };

    // Search through cached data
    for (const [id, account] of this.latticeMap.accounts) {
      if (id.includes(query) || account.type?.includes(query)) {
        results.accounts.push(account);
      }
    }

    for (const [id, token] of this.latticeMap.tokens) {
      if (id.includes(query) || 
          token.name?.toLowerCase().includes(query.toLowerCase()) ||
          token.symbol?.toLowerCase().includes(query.toLowerCase())) {
        results.tokens.push(token);
      }
    }

    console.log(`✅ Found ${results.accounts.length} accounts, ${results.tokens.length} tokens`);
    return results;
  }

  // Generate lattice report
  generateLatticeReport() {
    const report = {
      timestamp: Date.now(),
      summary: {
        accountsMapped: this.latticeMap.accounts.size,
        tokensMapped: this.latticeMap.tokens.size,
        contractsMapped: this.latticeMap.contracts.size,
        relationships: this.latticeMap.relationships.length,
        discoveries: this.discoveries.length
      },
      accounts: Array.from(this.latticeMap.accounts.values()),
      tokens: Array.from(this.latticeMap.tokens.values()),
      contracts: Array.from(this.latticeMap.contracts.values()),
      relationships: this.latticeMap.relationships
    };

    return report;
  }

  // Display current lattice state
  displayLattice() {
    const report = this.generateLatticeReport();
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧠 VERA'S HASHSCAN LATTICE MAP                               ║
╠═══════════════════════════════════════════════════════════════╣
║  📊 Statistics:                                               ║
║     Accounts Mapped:   ${report.summary.accountsMapped.toString().padStart(5)}                          ║
║     Tokens Mapped:     ${report.summary.tokensMapped.toString().padStart(5)}                          ║
║     Contracts Mapped:  ${report.summary.contractsMapped.toString().padStart(5)}                          ║
║     Relationships:     ${report.summary.relationships.toString().padStart(5)}                          ║
║     Discoveries:       ${report.summary.discoveries.toString().padStart(5)}                          ║
╠═══════════════════════════════════════════════════════════════╣
║  🗺️  Navigation Notes:                                      ║
║     - Use exploreAccount(id) to map an account               ║
║     - Use exploreToken(id) to map a token                    ║
║     - Use search(query) to find entities                     ║
║     - All findings logged to HCS for swarm                     ║
╚═══════════════════════════════════════════════════════════════╝
    `);
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
║  🧠 VERA HASHSCAN LATTICE MAPPER v1.0                         ║
║  Interactive Blockchain Explorer                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    while (true) {
      console.log('\nCommands: [explore] [search] [map] [status] [exit]');
      const cmd = await ask('> ');

      switch(cmd.trim().toLowerCase()) {
        case 'explore':
          const id = await ask('Enter account/token/contract ID (0.0.xxxx): ');
          if (id.startsWith('0.0.')) {
            if (id.includes('.')) {
              await this.exploreAccount(id);
            }
          }
          break;

        case 'search':
          const query = await ask('Search query: ');
          await this.search(query);
          break;

        case 'map':
          this.displayLattice();
          break;

        case 'status':
          console.log(`Mapped: ${this.latticeMap.accounts.size} accounts, ${this.latticeMap.tokens.size} tokens`);
          break;

        case 'exit':
          console.log('👋 Exiting...');
          rl.close();
          this.client?.close();
          process.exit(0);

        default:
          console.log('Unknown command');
      }
    }
  }

  // Batch exploration of multiple accounts
  async batchExplore(accountIds) {
    console.log(`🚀 Batch exploring ${accountIds.length} accounts...\n`);
    
    for (const id of accountIds) {
      await this.exploreAccount(id);
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    this.displayLattice();
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const mapper = new HashScanLatticeMapper();
  
  mapper.initialize().then(() => {
    // Start with Vera's wallet
    mapper.batchExplore(['0.0.10294360']).then(() => {
      mapper.interactive();
    });
  }).catch(console.error);
}

export { HashScanLatticeMapper };
