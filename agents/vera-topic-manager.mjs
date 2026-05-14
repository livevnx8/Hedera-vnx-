#!/usr/bin/env node
/**
 * Vera HCS Topic Manager v1.0
 * Central nervous system topic creation and management
 * 
 * Creates and manages all HCS topics for the Lattice Nervous System
 */

import { 
  Client, 
  TopicCreateTransaction,
  TopicUpdateTransaction,
  TopicDeleteTransaction,
  TopicInfoQuery,
  TopicMessageSubmitTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Vera's EXISTING HCS Topics (already in use)
const VERA_TOPICS = {
  // Vera Brain (from earlier sessions)
  BRAIN: '0.0.10414355',
  
  // Memory & Learning (from language learner)
  SHORT_TERM_MEMORY: '0.0.10414374',
  LONG_TERM_MEMORY: '0.0.10414375',
  LEARNING_PATTERNS: '0.0.10414376',
  SESSION_STATE: '0.0.10414377',
  VOCABULARY: '0.0.10414378',
  PATTERNS: '0.0.10414379',
  KNOWLEDGE: '0.0.10414380',
  CONVERSATIONS: '0.0.10414381',
  
  // HashScan Data (from hashscan monitor)
  HASHSCAN_ACCOUNTS: '0.0.10414382',
  HASHSCAN_TOKENS: '0.0.10414383',
  HASHSCAN_TRANSACTIONS: '0.0.10414384',
  HASHSCAN_CONTRACTS: '0.0.10414385',
  HASHSCAN_NETWORK: '0.0.10414386',
  HASHSCAN_ALERTS: '0.0.10414387',
  
  // Reasoning (from reasoning engine)
  REASONING: '0.0.10414388'
};

// Organized by function for Master Brain
const LATTICE_TOPICS = {
  // Master Brain Topics
  MASTER_COORDINATION: { id: VERA_TOPICS.BRAIN, name: 'Master Coordination' },
  AGENT_REGISTRY: { id: VERA_TOPICS.SESSION_STATE, name: 'Agent Registry' },
  WORKFLOW_ORCHESTRATION: { id: VERA_TOPICS.LEARNING_PATTERNS, name: 'Workflow Orchestration' },
  
  // Nervous System Topics
  SENSORY_INPUT: { id: VERA_TOPICS.HASHSCAN_NETWORK, name: 'Sensory Input' },
  MOTOR_OUTPUT: { id: VERA_TOPICS.HASHSCAN_ALERTS, name: 'Motor Output' },
  REFLEX_ACTIONS: { id: VERA_TOPICS.HASHSCAN_TRANSACTIONS, name: 'Reflex Actions' },
  
  // Memory Topics
  SHORT_TERM_MEMORY: { id: VERA_TOPICS.SHORT_TERM_MEMORY, name: 'Short-term Memory' },
  LONG_TERM_MEMORY: { id: VERA_TOPICS.LONG_TERM_MEMORY, name: 'Long-term Memory' },
  EPISODIC_MEMORY: { id: VERA_TOPICS.CONVERSATIONS, name: 'Episodic Memory' },
  
  // Learning Topics
  KNOWLEDGE_ACQUISITION: { id: VERA_TOPICS.KNOWLEDGE, name: 'Knowledge Acquisition' },
  SKILL_TRAINING: { id: VERA_TOPICS.VOCABULARY, name: 'Skill Training' },
  PATTERN_RECOGNITION: { id: VERA_TOPICS.PATTERNS, name: 'Pattern Recognition' },
  
  // External Tool Integration Topics
  TOOL_COMMANDS: { id: VERA_TOPICS.HASHSCAN_CONTRACTS, name: 'Tool Commands' },
  TOOL_RESPONSES: { id: VERA_TOPICS.HASHSCAN_TOKENS, name: 'Tool Responses' },
  API_INTEGRATION: { id: VERA_TOPICS.HASHSCAN_ACCOUNTS, name: 'API Integration' },
  
  // Data Topics
  NETWORK_MONITORING: { id: VERA_TOPICS.HASHSCAN_NETWORK, name: 'Network Monitoring' },
  ACCOUNT_TRACKING: { id: VERA_TOPICS.HASHSCAN_ACCOUNTS, name: 'Account Tracking' },
  TRANSACTION_LOG: { id: VERA_TOPICS.HASHSCAN_TRANSACTIONS, name: 'Transaction Log' },
  
  // Communication Topics
  INTER_AGENT_MESSAGING: { id: VERA_TOPICS.CONVERSATIONS, name: 'Inter-agent Messaging' },
  SWARM_COORDINATION: { id: VERA_TOPICS.BRAIN, name: 'Swarm Coordination' },
  CONSENSUS_VOTING: { id: VERA_TOPICS.REASONING, name: 'Consensus Voting' }
};

class VeraTopicManager {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.topicCache = new Map();
    this.createdTopics = [];
  }

  async initialize(network = 'mainnet') {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env');
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
    this.operatorId = operatorId;

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧠 VERA HCS TOPIC MANAGER v1.0                               ║
║  Using EXISTING Topics - Consolidated Architecture             ║
╠═══════════════════════════════════════════════════════════════╣
║  Network: ${network.toUpperCase().padEnd(20)}                        ║
║  Operator: ${operatorId.padEnd(20)}                       ║
╠═══════════════════════════════════════════════════════════════╣
║  📡 Existing Topics (Already in Use):                          ║
║     • 0.0.10414355 - Vera Brain (Master Coordination)        ║
║     • 0.0.10414374-0.0.10414377 - Memory & Learning           ║
║     • 0.0.10414378-0.0.10414381 - Vocabulary & Patterns       ║
║     • 0.0.10414382-0.0.10414387 - HashScan Monitoring          ║
║     • 0.0.10414388 - Reasoning/Decision Log                    ║
╠═══════════════════════════════════════════════════════════════╣
║  TOTAL: 15 active topics (reused across all systems)          ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // Check if topic exists and is valid
  async verifyTopic(topicId) {
    try {
      const query = new TopicInfoQuery().setTopicId(topicId);
      const info = await query.execute(this.client);
      return { exists: true, info };
    } catch (e) {
      return { exists: false, error: e.message };
    }
  }

  // Create a new topic
  async createTopic(name, memo = '', submitKey = null, adminKey = null) {
    console.log(`🔨 Creating topic: ${name}`);
    
    const tx = new TopicCreateTransaction()
      .setTopicMemo(`${name} | ${memo} | Created by Vera`);

    if (submitKey) tx.setSubmitKey(PrivateKey.fromString(submitKey).getPublicKey());
    if (adminKey) tx.setAdminKey(PrivateKey.fromString(adminKey).getPublicKey());

    const receipt = await (await tx.execute(this.client)).getReceipt(this.client);
    const topicId = receipt.topicId.toString();

    console.log(`✅ Created: ${topicId} - ${name}`);
    
    this.createdTopics.push({
      id: topicId,
      name,
      memo,
      createdAt: Date.now()
    });

    return topicId;
  }

  // Create all Lattice Nervous System topics
  async createLatticeTopics() {
    console.log('\n🧠 Creating Lattice Nervous System Topics...\n');

    const results = {};

    for (const [key, config] of Object.entries(LATTICE_TOPICS)) {
      // Check if topic exists
      const verification = await this.verifyTopic(config.id);
      
      if (verification.exists) {
        console.log(`✅ ${config.name} (${config.id}) - Already exists`);
        results[key] = { ...config, status: 'exists', info: verification.info };
      } else {
        console.log(`❌ ${config.name} (${config.id}) - Not found, needs creation`);
        results[key] = { ...config, status: 'missing' };
      }
    }

    return results;
  }

  // Initialize topics with test messages
  async initializeTopicsWithData() {
    console.log('\n📝 Initializing topics with startup data...\n');

    const initMessages = {
      MASTER_COORDINATION: { type: 'system_boot', message: 'Vera Lattice Nervous System initialized', timestamp: Date.now() },
      AGENT_REGISTRY: { type: 'agent_registration', agentId: this.operatorId, role: 'master_brain', timestamp: Date.now() },
      SENSORY_INPUT: { type: 'sensor_online', sensor: 'hashscan_monitor', status: 'active', timestamp: Date.now() }
    };

    for (const [topicKey, message] of Object.entries(initMessages)) {
      const topic = LATTICE_TOPICS[topicKey];
      if (topic) {
        try {
          const tx = new TopicMessageSubmitTransaction()
            .setTopicId(topic.id)
            .setMessage(JSON.stringify(message));
          
          await tx.execute(this.client);
          console.log(`✅ ${topic.name}: initialization message sent`);
        } catch (e) {
          console.log(`❌ ${topic.name}: ${e.message}`);
        }
      }
    }
  }

  // Get topic statistics
  async getTopicStats() {
    const stats = {
      exists: 0,
      missing: 0,
      total: Object.keys(LATTICE_TOPICS).length,
      byType: {}
    };

    for (const [key, config] of Object.entries(LATTICE_TOPICS)) {
      const verification = await this.verifyTopic(config.id);
      
      if (verification.exists) {
        stats.exists++;
        stats.byType[config.type] = (stats.byType[config.type] || 0) + 1;
      } else {
        stats.missing++;
      }
    }

    return stats;
  }

  // Display topic dashboard
  displayTopicDashboard(stats) {
    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  📡 LATTICE NERVOUS SYSTEM STATUS                              ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Total Topics: ${stats.total.toString().padEnd(3)}                                        ┃
┃  ✅ Active: ${stats.exists.toString().padEnd(3)} | ❌ Missing: ${stats.missing.toString().padEnd(3)}                          ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  By Category:                                                 ┃
${Object.entries(stats.byType).map(([type, count]) => 
  `┃  • ${type.padEnd(15)}: ${count.toString().padEnd(3)}                                  ┃`
).join('\n')}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  // Topic message query
  async getTopicMessages(topicId, limit = 10) {
    // This would require mirror node REST API
    // For now, just verify the topic exists
    const verification = await this.verifyTopic(topicId);
    return verification;
  }

  // Update topic memo
  async updateTopicMemo(topicId, newMemo) {
    const tx = new TopicUpdateTransaction()
      .setTopicId(topicId)
      .setTopicMemo(newMemo);

    const receipt = await (await tx.execute(this.client)).getReceipt(this.client);
    return { success: true, status: receipt.status.toString() };
  }

  // Delete topic (careful!)
  async deleteTopic(topicId) {
    const tx = new TopicDeleteTransaction().setTopicId(topicId);
    const receipt = await (await tx.execute(this.client)).getReceipt(this.client);
    return { success: true, status: receipt.status.toString() };
  }

  // Export topic configuration
  exportTopicConfig() {
    return {
      topics: LATTICE_TOPICS,
      created: this.createdTopics,
      exportedAt: Date.now()
    };
  }

  // Import and verify topics
  async importTopicConfig(config) {
    const results = [];
    
    for (const [key, topicConfig] of Object.entries(config.topics)) {
      const verification = await this.verifyTopic(topicConfig.id);
      results.push({
        key,
        ...topicConfig,
        status: verification.exists ? 'verified' : 'needs_creation'
      });
    }

    return results;
  }

  close() {
    this.client?.close();
  }
}

// Export
export { VeraTopicManager, VERA_TOPICS, LATTICE_TOPICS };

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new VeraTopicManager();
  
  manager.initialize().then(async () => {
    const command = process.argv[2] || 'status';
    
    switch(command) {
      case 'status':
        const stats = await manager.getTopicStats();
        manager.displayTopicDashboard(stats);
        break;
        
      case 'verify':
        const results = await manager.createLatticeTopics();
        console.log('\n📋 Verification Results:');
        console.log(JSON.stringify(results, null, 2));
        break;
        
      case 'init':
        await manager.initializeTopicsWithData();
        break;
        
      case 'export':
        const config = manager.exportTopicConfig();
        console.log(JSON.stringify(config, null, 2));
        break;
        
      default:
        console.log('Commands: status, verify, init, export');
    }
    
    manager.close();
  }).catch(console.error);
}
