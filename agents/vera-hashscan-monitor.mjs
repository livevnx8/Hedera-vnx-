#!/usr/bin/env node
/**
 * Vera HashScan Monitor v1.0
 * Real-time Hedera network monitoring via HashScan API
 * 
 * Features:
 * - Monitor accounts, tokens, transactions, contracts
 * - Track network metrics and statistics
 * - Log all data to HCS for swarm access
 * - Real-time alerts and notifications
 */

import { 
  Client, 
  TopicMessageSubmitTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

// HashScan API endpoints
const HASHSCAN_API = {
  mainnet: 'https://mainnet-public.mirrornode.hedera.com',
  testnet: 'https://testnet.mirrornode.hedera.com'
};

// HCS Topics for HashScan data
const HASHSCAN_TOPICS = {
  ACCOUNTS: process.env.HCS_HASHSCAN_ACCOUNTS || '0.0.10414382',
  TOKENS: process.env.HCS_HASHSCAN_TOKENS || '0.0.10414383',
  TRANSACTIONS: process.env.HCS_HASHSCAN_TXS || '0.0.10414384',
  CONTRACTS: process.env.HCS_HASHSCAN_CONTRACTS || '0.0.10414385',
  NETWORK: process.env.HCS_HASHSCAN_NETWORK || '0.0.10414386',
  ALERTS: process.env.HCS_HASHSCAN_ALERTS || '0.0.10414387'
};

class VeraHashScanMonitor {
  constructor(network = 'mainnet') {
    this.client = null;
    this.operatorId = null;
    this.network = network;
    this.apiUrl = HASHSCAN_API[network];
    this.monitoring = false;
    this.lastCheck = {};
    this.stats = {
      accountsMonitored: 0,
      tokensTracked: 0,
      transactionsLogged: 0,
      alertsSent: 0
    };
  }

  async initialize() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing credentials');
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
║  🔍 VERA HASHSCAN MONITOR v1.0                               ║
║  Real-time Hedera Network Intelligence                        ║
╠═══════════════════════════════════════════════════════════════╣
║  🌐 Network: ${this.network.toUpperCase().padEnd(20)}                        ║
║  🔗 API: ${this.apiUrl.substring(0, 40).padEnd(40)}  ║
╠═══════════════════════════════════════════════════════════════╣
║  📡 HCS Data Streams:                                         ║
║     • Accounts: ${HASHSCAN_TOPICS.ACCOUNTS}                                  ║
║     • Tokens: ${HASHSCAN_TOPICS.TOKENS}                                    ║
║     • Transactions: ${HASHSCAN_TOPICS.TRANSACTIONS}                              ║
║     • Contracts: ${HASHSCAN_TOPICS.CONTRACTS}                                 ║
║     • Network Stats: ${HASHSCAN_TOPICS.NETWORK}                             ║
║     • Alerts: ${HASHSCAN_TOPICS.ALERTS}                                    ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // Generic API fetch
  async fetchFromHashScan(endpoint) {
    return new Promise((resolve, reject) => {
      const url = `${this.apiUrl}${endpoint}`;
      https.get(url, { timeout: 15000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        });
      }).on('error', (err) => {
        console.error(`❌ HashScan API error: ${err.message}`);
        resolve(null);
      });
    });
  }

  // Monitor account
  async monitorAccount(accountId) {
    console.log(`🔍 Monitoring account ${accountId}...`);
    
    const data = await this.fetchFromHashScan(`/api/v1/accounts/${accountId}`);
    
    if (!data || data.status === 404) {
      console.log(`⚠️ Account ${accountId} not found`);
      return null;
    }

    const accountInfo = {
      type: 'account_update',
      accountId: data.account,
      balance: data.balance?.balance || 0,
      tokens: data.balance?.tokens?.length || 0,
      timestamp: Date.now(),
      key: data.key?.type || 'unknown'
    };

    // Log to HCS
    await this.logToHCS(HASHSCAN_TOPICS.ACCOUNTS, accountInfo);
    
    this.stats.accountsMonitored++;
    
    console.log(`✅ Account ${accountId}: ${(accountInfo.balance / 100000000).toFixed(2)} HBAR, ${accountInfo.tokens} tokens`);
    
    return accountInfo;
  }

  // Monitor token
  async monitorToken(tokenId) {
    console.log(`🪙 Monitoring token ${tokenId}...`);
    
    const data = await this.fetchFromHashScan(`/api/v1/tokens/${tokenId}`);
    
    if (!data || data.status === 404) {
      console.log(`⚠️ Token ${tokenId} not found`);
      return null;
    }

    const tokenInfo = {
      type: 'token_update',
      tokenId: data.token_id,
      name: data.name,
      symbol: data.symbol,
      type: data.type,
      totalSupply: data.total_supply,
      decimals: data.decimals,
      timestamp: Date.now()
    };

    // Log to HCS
    await this.logToHCS(HASHSCAN_TOPICS.TOKENS, tokenInfo);
    
    this.stats.tokensTracked++;
    
    console.log(`✅ Token ${tokenId}: ${tokenInfo.name} (${tokenInfo.symbol}) - Supply: ${tokenInfo.totalSupply}`);
    
    return tokenInfo;
  }

  // Get recent transactions
  async getRecentTransactions(accountId, limit = 10) {
    console.log(`📜 Fetching recent transactions for ${accountId}...`);
    
    const data = await this.fetchFromHashScan(`/api/v1/transactions?account.id=${accountId}&limit=${limit}&order=desc`);
    
    if (!data || !data.transactions) {
      console.log(`⚠️ No transactions found`);
      return [];
    }

    const transactions = data.transactions.map(tx => ({
      type: 'transaction',
      txId: tx.transaction_id,
      result: tx.result,
      consensusTimestamp: tx.consensus_timestamp,
      chargedTxFee: tx.charged_tx_fee,
      transfers: tx.transfers || [],
      entity: accountId,
      loggedAt: Date.now()
    }));

    // Log to HCS
    for (const tx of transactions) {
      await this.logToHCS(HASHSCAN_TOPICS.TRANSACTIONS, tx);
    }

    this.stats.transactionsLogged += transactions.length;
    
    console.log(`✅ Logged ${transactions.length} transactions`);
    
    return transactions;
  }

  // Monitor contract
  async monitorContract(contractId) {
    console.log(`📜 Monitoring contract ${contractId}...`);
    
    const data = await this.fetchFromHashScan(`/api/v1/contracts/${contractId}`);
    
    if (!data || data.status === 404) {
      console.log(`⚠️ Contract ${contractId} not found`);
      return null;
    }

    const contractInfo = {
      type: 'contract_update',
      contractId: data.contract_id,
      evmAddress: data.evm_address,
      fileId: data.file_id,
      timestamp: Date.now(),
      memo: data.memo || ''
    };

    // Log to HCS
    await this.logToHCS(HASHSCAN_TOPICS.CONTRACTS, contractInfo);
    
    console.log(`✅ Contract ${contractId}: ${contractInfo.evmAddress || 'no EVM address'}`);
    
    return contractInfo;
  }

  // Get network statistics
  async getNetworkStats() {
    console.log(`🌐 Fetching network statistics...`);
    
    // Get various network data
    const [accounts, tokens, contracts, schedule, network] = await Promise.all([
      this.fetchFromHashScan('/api/v1/accounts?limit=1'),
      this.fetchFromHashScan('/api/v1/tokens?limit=1'),
      this.fetchFromHashScan('/api/v1/contracts?limit=1'),
      this.fetchFromHashScan('/api/v1/schedules?limit=1'),
      this.fetchFromHashScan('/api/v1/network/nodes')
    ]);

    const stats = {
      type: 'network_stats',
      timestamp: Date.now(),
      totalAccounts: accounts?.accounts?.length || 0,
      totalTokens: tokens?.tokens?.length || 0,
      totalContracts: contracts?.contracts?.length || 0,
      totalSchedules: schedule?.schedules?.length || 0,
      nodesOnline: network?.nodes?.filter(n => n.node_cert_hash).length || 0,
      network: this.network
    };

    // Log to HCS
    await this.logToHCS(HASHSCAN_TOPICS.NETWORK, stats);
    
    console.log(`✅ Network stats: ${stats.totalAccounts} accounts, ${stats.totalTokens} tokens, ${stats.totalContracts} contracts`);
    
    return stats;
  }

  // Scan for new entities
  async scanForNewEntities(type = 'tokens', limit = 10) {
    console.log(`🔎 Scanning for new ${type}...`);
    
    const endpoint = `/api/v1/${type}?limit=${limit}&order=desc`;
    const data = await this.fetchFromHashScan(endpoint);
    
    if (!data || !data[type]) {
      console.log(`⚠️ No ${type} found`);
      return [];
    }

    const entities = data[type];
    const newEntities = [];

    for (const entity of entities) {
      const id = entity.token_id || entity.account || entity.contract_id;
      
      // Check if we've seen this before
      if (!this.lastCheck[id]) {
        newEntities.push({
          type: `new_${type.slice(0, -1)}`,
          id,
          discovered: Date.now(),
          data: entity
        });
        this.lastCheck[id] = Date.now();
      }
    }

    if (newEntities.length > 0) {
      console.log(`🆕 Found ${newEntities.length} new ${type}!`);
      
      // Send alert
      for (const entity of newEntities) {
        await this.sendAlert('new_entity', entity);
      }
    } else {
      console.log(`✓ No new ${type} found`);
    }

    return newEntities;
  }

  // Send alert
  async sendAlert(alertType, data) {
    const alert = {
      type: 'alert',
      alertType,
      severity: 'info',
      data,
      timestamp: Date.now()
    };

    await this.logToHCS(HASHSCAN_TOPICS.ALERTS, alert);
    this.stats.alertsSent++;
    
    console.log(`🚨 Alert: ${alertType} - ${JSON.stringify(data).substring(0, 60)}...`);
  }

  // Log to HCS
  async logToHCS(topic, data) {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topic)
        .setMessage(JSON.stringify({
          ...data,
          loggedBy: this.operatorId,
          loggedAt: Date.now()
        }));

      await tx.execute(this.client);
    } catch (e) {
      console.error(`❌ HCS log failed: ${e.message}`);
    }
  }

  // Start continuous monitoring
  async startMonitoring(options = {}) {
    const {
      accounts = [],
      tokens = ['0.0.9356476'],
      contracts = [],
      interval = 60000, // 1 minute
      scanNew = true
    } = options;

    this.monitoring = true;
    
    console.log(`\n🚀 Starting HashScan Monitor`);
    console.log(`   Monitoring ${accounts.length} accounts`);
    console.log(`   Tracking ${tokens.length} tokens`);
    console.log(`   Watching ${contracts.length} contracts`);
    console.log(`   Interval: ${interval/1000}s\n`);

    while (this.monitoring) {
      console.log(`\n⏱️ Monitor cycle at ${new Date().toISOString()}`);

      // Monitor accounts
      for (const accountId of accounts) {
        await this.monitorAccount(accountId);
        await this.sleep(1000);
      }

      // Monitor tokens
      for (const tokenId of tokens) {
        await this.monitorToken(tokenId);
        await this.sleep(1000);
      }

      // Monitor contracts
      for (const contractId of contracts) {
        await this.monitorContract(contractId);
        await this.sleep(1000);
      }

      // Get network stats
      await this.getNetworkStats();

      // Scan for new entities
      if (scanNew) {
        await this.scanForNewEntities('tokens', 5);
        await this.sleep(500);
        await this.scanForNewEntities('accounts', 5);
      }

      // Display stats
      this.displayStats();

      // Wait for next cycle
      console.log(`\n💤 Sleeping for ${interval/1000}s...`);
      await this.sleep(interval);
    }
  }

  displayStats() {
    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  📊 HASHSCAN MONITOR STATS                                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Accounts Monitored: ${this.stats.accountsMonitored.toString().padEnd(3)}                                  ┃
┃  Tokens Tracked: ${this.stats.tokensTracked.toString().padEnd(3)}                                      ┃
┃  Transactions Logged: ${this.stats.transactionsLogged.toString().padEnd(5)}                               ┃
┃  Alerts Sent: ${this.stats.alertsSent.toString().padEnd(3)}                                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.monitoring = false;
    this.client?.close();
    console.log('\n👋 HashScan Monitor stopped');
  }

  // Quick check - single run
  async quickCheck(accountId = this.operatorId) {
    console.log(`\n🔍 Quick HashScan Check for ${accountId}\n`);
    
    await this.monitorAccount(accountId);
    await this.getRecentTransactions(accountId, 5);
    await this.getNetworkStats();
    
    this.displayStats();
  }
}

// Export
export { VeraHashScanMonitor, HASHSCAN_API, HASHSCAN_TOPICS };

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new VeraHashScanMonitor();
  
  monitor.initialize().then(() => {
    const args = process.argv.slice(2);
    const mode = args[0] || 'quick'; // 'quick', 'monitor', or account ID
    
    if (mode === 'monitor') {
      // Continuous monitoring
      monitor.startMonitoring({
        accounts: [process.env.HEDERA_OPERATOR_ID],
        tokens: ['0.0.9356476'],
        interval: 30000 // 30 seconds
      });
    } else if (mode.startsWith('0.0.')) {
      // Check specific account
      monitor.quickCheck(mode);
    } else {
      // Quick check default account
      monitor.quickCheck();
    }
  }).catch(console.error);

  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });
}
