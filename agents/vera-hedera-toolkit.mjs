#!/usr/bin/env node
/**
 * Vera Hedera Toolkit v1.0
 * Comprehensive Hedera operations: HTS, HCS, Contracts, HBAR, Staking
 * Unified interface for all Hedera services
 */

import { 
  Client, 
  TokenCreateTransaction, 
  TransferTransaction,
  TokenMintTransaction,
  TokenBurnTransaction,
  TokenAssociateTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  AccountBalanceQuery,
  TokenInfoQuery,
  TopicInfoQuery,
  ContractInfoQuery,
  Hbar,
  PrivateKey
} from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

class VeraHederaToolkit {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.network = 'mainnet';
  }

  async initialize(network = 'mainnet') {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY');
    }

    this.network = network;
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
    this.operatorId = operatorId;

    console.log(`✅ Hedera Toolkit initialized (${network})`);
    console.log(`👤 Operator: ${operatorId}`);
    
    return this;
  }

  // ==================== HTS TOKEN OPERATIONS ====================

  async createToken({ name, symbol, decimals = 8, initialSupply = 0, tokenType = 'FUNGIBLE' }) {
    console.log(`🪙 Creating ${tokenType} token: ${name} (${symbol})`);

    try {
      const tx = new TokenCreateTransaction()
        .setTokenName(name)
        .setTokenSymbol(symbol)
        .setDecimals(decimals)
        .setInitialSupply(initialSupply)
        .setTreasuryAccountId(this.operatorId)
        .setTokenType(tokenType === 'NFT' ? 1 : 0)
        .setTransactionMemo(`vera-token-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const tokenId = receipt.tokenId;

      console.log(`✅ Token created: ${tokenId}`);
      console.log(`   Name: ${name} | Symbol: ${symbol}`);
      console.log(`   Supply: ${initialSupply} | Decimals: ${decimals}`);

      return { success: true, tokenId: tokenId.toString(), name, symbol };
    } catch (e) {
      console.error(`❌ Token creation failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async transferToken({ tokenId, toAccountId, amount }) {
    console.log(`💸 Transferring ${amount} tokens to ${toAccountId}`);

    try {
      const tx = new TransferTransaction()
        .addTokenTransfer(tokenId, this.operatorId, -amount)
        .addTokenTransfer(tokenId, toAccountId, amount)
        .setTransactionMemo(`vera-transfer-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      console.log(`✅ Transfer complete: ${receipt.status}`);
      return { success: true, status: receipt.status.toString() };
    } catch (e) {
      console.error(`❌ Transfer failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async mintTokens({ tokenId, amount }) {
    console.log(`🏭 Minting ${amount} tokens for ${tokenId}`);

    try {
      const tx = new TokenMintTransaction()
        .setTokenId(tokenId)
        .setAmount(amount)
        .setTransactionMemo(`vera-mint-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      console.log(`✅ Minted: ${receipt.status}`);
      return { success: true, status: receipt.status.toString() };
    } catch (e) {
      console.error(`❌ Mint failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async burnTokens({ tokenId, amount }) {
    console.log(`🔥 Burning ${amount} tokens from ${tokenId}`);

    try {
      const tx = new TokenBurnTransaction()
        .setTokenId(tokenId)
        .setAmount(amount)
        .setTransactionMemo(`vera-burn-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      console.log(`✅ Burned: ${receipt.status}`);
      return { success: true, status: receipt.status.toString() };
    } catch (e) {
      console.error(`❌ Burn failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async associateToken({ tokenId, accountId }) {
    console.log(`🔗 Associating ${tokenId} with ${accountId}`);

    try {
      const tx = new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([tokenId])
        .setTransactionMemo(`vera-associate-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      console.log(`✅ Associated: ${receipt.status}`);
      return { success: true, status: receipt.status.toString() };
    } catch (e) {
      console.error(`❌ Association failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async getTokenInfo(tokenId) {
    console.log(`📊 Getting token info: ${tokenId}`);

    try {
      const query = new TokenInfoQuery().setTokenId(tokenId);
      const info = await query.execute(this.client);

      console.log(`✅ Token Info:`);
      console.log(`   Name: ${info.name}`);
      console.log(`   Symbol: ${info.symbol}`);
      console.log(`   Type: ${info.tokenType}`);
      console.log(`   Supply: ${info.totalSupply}`);
      console.log(`   Decimals: ${info.decimals}`);

      return { success: true, info };
    } catch (e) {
      console.error(`❌ Query failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // ==================== HCS CONSENSUS SERVICE ====================

  async createTopic({ memo, submitKey }) {
    console.log(`📝 Creating HCS topic: ${memo}`);

    try {
      const tx = new TopicCreateTransaction()
        .setTopicMemo(memo)
        .setTransactionMemo(`vera-topic-${Date.now()}`);

      if (submitKey) {
        tx.setSubmitKey(PrivateKey.fromString(submitKey));
      }

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const topicId = receipt.topicId;

      console.log(`✅ Topic created: ${topicId}`);
      return { success: true, topicId: topicId.toString(), memo };
    } catch (e) {
      console.error(`❌ Topic creation failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async submitMessage({ topicId, message }) {
    console.log(`📤 Submitting message to ${topicId}`);

    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .setTransactionMemo(`vera-msg-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      console.log(`✅ Message submitted: ${receipt.status}`);
      console.log(`   Sequence: ${receipt.topicSequenceNumber}`);
      
      return { 
        success: true, 
        status: receipt.status.toString(),
        sequence: receipt.topicSequenceNumber.toString()
      };
    } catch (e) {
      console.error(`❌ Message submission failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async getTopicInfo(topicId) {
    console.log(`📊 Getting topic info: ${topicId}`);

    try {
      const query = new TopicInfoQuery().setTopicId(topicId);
      const info = await query.execute(this.client);

      console.log(`✅ Topic Info:`);
      console.log(`   Memo: ${info.topicMemo}`);
      console.log(`   Running Hash: ${info.runningHash?.substring(0, 20)}...`);
      console.log(`   Sequence: ${info.sequenceNumber}`);

      return { success: true, info };
    } catch (e) {
      console.error(`❌ Query failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // ==================== SMART CONTRACTS ====================

  async deployContract({ bytecode, gas = 100000 }) {
    console.log(`📜 Deploying smart contract (${bytecode.length} bytes)`);

    try {
      const tx = new ContractCreateTransaction()
        .setBytecode(bytecode)
        .setGas(gas)
        .setTransactionMemo(`vera-contract-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const contractId = receipt.contractId;

      console.log(`✅ Contract deployed: ${contractId}`);
      return { success: true, contractId: contractId.toString() };
    } catch (e) {
      console.error(`❌ Deployment failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async callContract({ contractId, functionName, params = [], gas = 100000 }) {
    console.log(`🔧 Calling ${functionName} on ${contractId}`);

    try {
      const tx = new ContractExecuteTransaction()
        .setContractId(contractId)
        .setFunction(functionName, params)
        .setGas(gas)
        .setTransactionMemo(`vera-call-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      console.log(`✅ Contract call: ${receipt.status}`);
      return { success: true, status: receipt.status.toString() };
    } catch (e) {
      console.error(`❌ Call failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async getContractInfo(contractId) {
    console.log(`📊 Getting contract info: ${contractId}`);

    try {
      const query = new ContractInfoQuery().setContractId(contractId);
      const info = await query.execute(this.client);

      console.log(`✅ Contract Info:`);
      console.log(`   Storage: ${info.storage}`);
      console.log(`   Balance: ${info.balance}`);

      return { success: true, info };
    } catch (e) {
      console.error(`❌ Query failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // ==================== HBAR OPERATIONS ====================

  async transferHBAR({ toAccountId, amount }) {
    console.log(`💰 Transferring ${amount} HBAR to ${toAccountId}`);

    try {
      const tx = new TransferTransaction()
        .addHbarTransfer(this.operatorId, Hbar.fromTinybars(-Math.floor(amount * 100000000)))
        .addHbarTransfer(toAccountId, Hbar.fromTinybars(Math.floor(amount * 100000000)))
        .setTransactionMemo(`vera-hbar-${Date.now()}`);

      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      console.log(`✅ HBAR transfer: ${receipt.status}`);
      return { success: true, status: receipt.status.toString() };
    } catch (e) {
      console.error(`❌ Transfer failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async getBalance(accountId = this.operatorId) {
    console.log(`📊 Getting balance for ${accountId}`);

    try {
      const query = new AccountBalanceQuery().setAccountId(accountId);
      const balance = await query.execute(this.client);

      const hbar = balance.hbars.toBigNumber().toNumber();
      
      console.log(`✅ Balance:`);
      console.log(`   HBAR: ${hbar}`);
      
      if (balance.tokens?._map) {
        console.log(`   Tokens: ${balance.tokens._map.size}`);
        balance.tokens._map.forEach((v, k) => {
          console.log(`     - ${k}: ${v}`);
        });
      }

      return { success: true, hbar, tokens: balance.tokens };
    } catch (e) {
      console.error(`❌ Balance query failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // ==================== NETWORK MONITORING ====================

  async networkHealth() {
    console.log(`🌐 Checking network health...`);

    try {
      const balance = await this.getBalance();
      
      console.log(`\n✅ Network Status: Healthy`);
      console.log(`   Account: ${this.operatorId}`);
      console.log(`   HBAR Balance: ${balance.hbar}`);
      console.log(`   Network: ${this.network}`);

      return { success: true, healthy: true, balance };
    } catch (e) {
      console.error(`❌ Network check failed: ${e.message}`);
      return { success: false, healthy: false, error: e.message };
    }
  }

  // ==================== SWARM COORDINATION ====================

  async swarmAnnounce({ topicId, agentId, role, status }) {
    const message = JSON.stringify({
      type: 'swarm_announce',
      agentId,
      role,
      status,
      timestamp: Date.now(),
      network: this.network
    });

    return await this.submitMessage({ topicId, message });
  }

  async swarmTask({ topicId, taskId, action, params }) {
    const message = JSON.stringify({
      type: 'swarm_task',
      taskId,
      action,
      params,
      timestamp: Date.now(),
      assignee: this.operatorId
    });

    return await this.submitMessage({ topicId, message });
  }

  // ==================== DASHBOARD ====================

  displayDashboard() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🔧 VERA HEDERA TOOLKIT v1.0                                  ║
║  Comprehensive Hedera Operations                             ║
╠═══════════════════════════════════════════════════════════════╣
║  🪙 HTS:  Token Creation, Transfer, Mint, Burn, Associate       ║
║  📝 HCS:  Topic Creation, Message Submit, Info Query          ║
║  📜 SC:   Deploy, Call, Query Contracts                       ║
║  💰 HBAR: Transfers, Balance Query                            ║
║  🌐 Network: Health Check, Monitoring                         ║
║  🐝 Swarm: Coordination via HCS                                 ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const toolkit = new VeraHederaToolkit();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  toolkit.initialize().then(async () => {
    toolkit.displayDashboard();
    
    // Demo operations based on command
    switch(command) {
      case 'balance':
        await toolkit.getBalance();
        break;
      case 'health':
        await toolkit.networkHealth();
        break;
      case 'demo':
        console.log('\n🎮 Running demo operations...\n');
        await toolkit.getBalance();
        await toolkit.getTokenInfo('0.0.9356476').catch(() => {});
        break;
      default:
        console.log('Usage: balance | health | demo');
    }
    
    toolkit.client?.close();
    process.exit(0);
  }).catch(e => {
    console.error('Initialization failed:', e);
    process.exit(1);
  });
}

export { VeraHederaToolkit };
