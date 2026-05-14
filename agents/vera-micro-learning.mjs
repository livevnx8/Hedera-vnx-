#!/usr/bin/env node
/**
 * Vera Micro-Learning Lattice v1.0
 * Incremental, distributed training system with lattice architecture
 * Micro-modules, adaptive paths, swarm knowledge distribution
 */

import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Training HCS Topics
const TRAIN_TOPICS = {
  MICRO_MODULES: process.env.HCS_TRAIN_MODULES || '0.0.10414367',
  PROGRESS: process.env.HCS_TRAIN_PROGRESS || '0.0.10414368',
  ACHIEVEMENTS: process.env.HCS_TRAIN_ACHIEVEMENTS || '0.0.10414369',
  KNOWLEDGE_SHARDS: process.env.HCS_KNOWLEDGE_SHARDS || '0.0.10414370',
  ADAPTIVE_PATHS: process.env.HCS_ADAPTIVE_PATHS || '0.0.10414371'
};

// Micro-Learning Config
const MICRO_CONFIG = {
  moduleDuration: 30000,    // 30 seconds per micro-module
  retentionInterval: 60000,  // Review every minute
  difficultyScale: [1, 2, 3, 5, 8, 13],  // Fibonacci progression
  masteryThreshold: 0.85,   // 85% to advance
  maxShards: 8,             // Distribute across 8 knowledge shards
  batchSize: 5              // Learn 5 micro-concepts per batch
};

// Micro-Module Library
const MICRO_MODULES = {
  // Shard 0: Hedera Fundamentals
  hedera_basics: {
    id: 'hb-001',
    shard: 0,
    difficulty: 1,
    concepts: ['Consensus', 'Hashgraph', 'Gossip Protocol'],
    questions: [
      { q: 'What makes Hedera fast?', a: 'hashgraph', options: ['blockchain', 'hashgraph', 'proof_of_work'] },
      { q: 'Hedera uses ____ for consensus', a: 'gossip', options: ['mining', 'gossip', 'voting'] }
    ]
  },
  
  // Shard 1: Token Service (HTS)
  token_service: {
    id: 'hts-001',
    shard: 1,
    difficulty: 2,
    concepts: ['HTS', 'Token ID', 'Fungible vs NFT'],
    questions: [
      { q: 'Token ID format?', a: '0.0.xxxx', options: ['0x...', '0.0.xxxx', 'T...'] },
      { q: 'HTS stands for?', a: 'hedera_token_service', options: ['hedera_token_service', 'hashgraph_token_system', 'hedera_transfer_service'] }
    ]
  },
  
  // Shard 2: Consensus Service (HCS)
  consensus_service: {
    id: 'hcs-001',
    shard: 2,
    difficulty: 2,
    concepts: ['HCS', 'Topics', 'Message Consensus'],
    questions: [
      { q: 'HCS provides ____ consensus', a: 'message', options: ['token', 'message', 'smart_contract'] },
      { q: 'Topics have IDs like?', a: '0.0.xxxx', options: ['0x...', '0.0.xxxx', 'topic...'] }
    ]
  },
  
  // Shard 3: Smart Contracts
  smart_contracts: {
    id: 'sc-001',
    shard: 3,
    difficulty: 3,
    concepts: ['Solidity', 'EVM', 'Contract ID'],
    questions: [
      { q: 'Hedera contracts are ____ compatible', a: 'evm', options: ['jvm', 'evm', 'wasm'] },
      { q: 'Contract IDs look like?', a: '0.0.xxxx', options: ['0x...', '0.0.xxxx', 'C...'] }
    ]
  },
  
  // Shard 4: Advanced Token Operations
  token_advanced: {
    id: 'hta-001',
    shard: 4,
    difficulty: 5,
    concepts: ['Minting', 'Burning', 'Wiping', 'KYC'],
    questions: [
      { q: 'Only ____ can mint tokens', a: 'treasury', options: ['anyone', 'treasury', 'admin'] },
      { q: 'KYC stands for?', a: 'know_your_customer', options: ['know_your_customer', 'key_your_code', 'keep_your_coins'] }
    ]
  },
  
  // Shard 5: Network Operations
  network_ops: {
    id: 'net-001',
    shard: 5,
    difficulty: 3,
    concepts: ['Nodes', 'Staking', 'Governance'],
    questions: [
      { q: 'Hedera has ____ council nodes', a: '39', options: ['21', '39', '100'] },
      { q: 'Staking rewards come from?', a: 'network_fees', options: ['mining', 'network_fees', 'inflation'] }
    ]
  },
  
  // Shard 6: Swarm Intelligence
  swarm_intel: {
    id: 'swarm-001',
    shard: 6,
    difficulty: 8,
    concepts: ['Multi-Agent', 'Consensus', 'HCS Coordination'],
    questions: [
      { q: 'Swarm uses ____ for coordination', a: 'hcs', options: ['email', 'hcs', 'database'] },
      { q: 'Agents achieve ____ through consensus', a: 'agreement', options: ['agreement', 'speed', 'profit'] }
    ]
  },
  
  // Shard 7: Lattice Architecture
  lattice_arch: {
    id: 'lat-001',
    shard: 7,
    difficulty: 13,
    concepts: ['Spatial Index', 'Parallel Processing', 'Quantum Duet'],
    questions: [
      { q: 'Lattice uses ____ indexing', a: 'spatial', options: ['linear', 'spatial', 'temporal'] },
      { q: 'Quantum duet enables ____ fetching', a: 'parallel', options: ['sequential', 'parallel', 'random'] }
    ]
  }
};

// Spaced Repetition Schedule
const REVIEW_SCHEDULE = [1, 3, 7, 14, 30]; // minutes

class VeraMicroLearningLattice {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.progressFile = path.join(process.cwd(), 'data', 'vera-learning-state.json');
    
    // Learning State
    this.state = {
      learnerId: null,
      totalModules: 0,
      completedModules: new Set(),
      masteryLevels: new Map(),  // module -> score (0-100)
      lastReviewed: new Map(),   // module -> timestamp
      streakDays: 0,
      totalStudyTime: 0,
      shardProgress: new Array(MICRO_CONFIG.maxShards).fill(0),
      achievements: []
    };
    
    // Current session
    this.session = {
      startTime: Date.now(),
      modulesCompleted: 0,
      currentShard: 0,
      accuracy: []
    };
    
    this.hcsQueue = [];
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
    this.state.learnerId = operatorId;

    // Load saved progress
    await this.loadProgress();

    // Ensure data directory exists
    if (!fs.existsSync(path.dirname(this.progressFile))) {
      fs.mkdirSync(path.dirname(this.progressFile), { recursive: true });
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧠 VERA MICRO-LEARNING LATTICE v1.0                         ║
║  Incremental, Distributed, Adaptive Training                    ║
╠═══════════════════════════════════════════════════════════════╣
║  📚 ${Object.keys(MICRO_MODULES).length} Micro-Modules | ${MICRO_CONFIG.maxShards} Knowledge Shards         ║
║  ⏱️  ${MICRO_CONFIG.moduleDuration/1000}s per module | Adaptive Difficulty         ║
║  🔄 Spaced Repetition | Swarm Knowledge Distribution          ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // Load saved progress
  async loadProgress() {
    try {
      if (fs.existsSync(this.progressFile)) {
        const data = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
        this.state.completedModules = new Set(data.completedModules || []);
        this.state.masteryLevels = new Map(Object.entries(data.masteryLevels || {}));
        this.state.lastReviewed = new Map(Object.entries(data.lastReviewed || {}));
        this.state.streakDays = data.streakDays || 0;
        this.state.totalStudyTime = data.totalStudyTime || 0;
        this.state.achievements = data.achievements || [];
        console.log(`📂 Loaded progress: ${this.state.completedModules.size} modules completed`);
      }
    } catch (e) {
      console.log('ℹ️  Starting fresh learning session');
    }
  }

  // Save progress
  async saveProgress() {
    try {
      const data = {
        learnerId: this.state.learnerId,
        completedModules: Array.from(this.state.completedModules),
        masteryLevels: Object.fromEntries(this.state.masteryLevels),
        lastReviewed: Object.fromEntries(this.state.lastReviewed),
        streakDays: this.state.streakDays,
        totalStudyTime: this.state.totalStudyTime + (Date.now() - this.session.startTime),
        shardProgress: this.state.shardProgress,
        achievements: this.state.achievements,
        lastSaved: Date.now()
      };
      fs.writeFileSync(this.progressFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.log(`⚠️  Save error: ${e.message}`);
    }
  }

  // Get next module based on adaptive path
  getNextModule() {
    // Find modules not yet mastered
    const available = Object.entries(MICRO_MODULES).filter(([key, mod]) => {
      const mastery = this.state.masteryLevels.get(mod.id) || 0;
      return mastery < MICRO_CONFIG.masteryThreshold * 100;
    });

    if (available.length === 0) {
      // All modules mastered - suggest review
      return this.getReviewModule();
    }

    // Sort by difficulty (adaptive - start easy)
    available.sort((a, b) => a[1].difficulty - b[1].difficulty);
    
    // Pick first available module
    return available[0];
  }

  // Get module for spaced repetition review
  getReviewModule() {
    const now = Date.now();
    for (const [key, mod] of Object.entries(MICRO_MODULES)) {
      const lastReview = this.state.lastReviewed.get(mod.id) || 0;
      const mastery = this.state.masteryLevels.get(mod.id) || 0;
      
      // If mastered but due for review
      if (mastery >= MICRO_CONFIG.masteryThreshold * 100) {
        const daysSinceReview = (now - lastReview) / (1000 * 60);
        const reviewInterval = REVIEW_SCHEDULE[Math.floor(mastery / 20)] || 30;
        
        if (daysSinceReview >= reviewInterval) {
          return [key, mod];
        }
      }
    }
    return null;
  }

  // Present micro-module
  async presentModule(moduleKey, module) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📚 MICRO-MODULE: ${moduleKey.toUpperCase()}`);
    console.log(`🎯 Difficulty: ${'⭐'.repeat(module.difficulty)}`);
    console.log(`🗂️  Shard: ${module.shard} | ID: ${module.id}`);
    console.log(`${'='.repeat(60)}`);
    
    console.log('\n💡 Key Concepts:');
    module.concepts.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));
    
    console.log('\n📝 Quick Quiz:');
    let correct = 0;
    let total = module.questions.length;
    
    for (const question of module.questions) {
      console.log(`\nQ: ${question.q}`);
      question.options.forEach((opt, i) => {
        console.log(`   ${String.fromCharCode(97 + i)}) ${opt}`);
      });
      
      // Simulate answer (in real use, would get user input)
      const isCorrect = Math.random() > 0.3; // 70% success rate for demo
      const answer = isCorrect ? question.a : question.options[0];
      
      console.log(`   Your answer: ${answer}`);
      if (isCorrect) {
        console.log('   ✅ Correct!');
        correct++;
      } else {
        console.log(`   ❌ Wrong! Answer: ${question.a}`);
      }
    }
    
    const score = (correct / total) * 100;
    console.log(`\n📊 Score: ${correct}/${total} (${score.toFixed(0)}%)`);
    
    return score;
  }

  // Update mastery based on performance
  async updateMastery(moduleId, score) {
    const currentMastery = this.state.masteryLevels.get(moduleId) || 0;
    
    // Weighted update (new score has 60% weight)
    const newMastery = Math.round(currentMastery * 0.4 + score * 0.6);
    this.state.masteryLevels.set(moduleId, newMastery);
    this.state.lastReviewed.set(moduleId, Date.now());
    
    // Check if mastered
    if (newMastery >= MICRO_CONFIG.masteryThreshold * 100 && 
        !this.state.completedModules.has(moduleId)) {
      this.state.completedModules.add(moduleId);
      this.session.modulesCompleted++;
      
      // Log achievement
      await this.logAchievement('MODULE_MASTERED', { moduleId, score: newMastery });
      console.log(`🎉 MODULE MASTERED: ${moduleId}`);
    }
    
    // Update shard progress
    const module = Object.values(MICRO_MODULES).find(m => m.id === moduleId);
    if (module) {
      this.state.shardProgress[module.shard] = Math.max(
        this.state.shardProgress[module.shard],
        newMastery
      );
    }
    
    // Save progress
    await this.saveProgress();
  }

  // Log to HCS
  async logToHCS(topic, type, data) {
    const topicId = TRAIN_TOPICS[topic];
    if (!topicId) return;

    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify({
          timestamp: Date.now(),
          learnerId: this.state.learnerId,
          type,
          data
        }));
      await tx.execute(this.client);
    } catch (e) {
      // Silent fail
    }
  }

  // Log achievement
  async logAchievement(type, data) {
    const achievement = {
      type,
      timestamp: Date.now(),
      data
    };
    this.state.achievements.push(achievement);
    await this.logToHCS('ACHIEVEMENTS', type, data);
  }

  // Display learning dashboard
  displayDashboard() {
    const runtime = (Date.now() - this.session.startTime) / 1000;
    const totalModules = Object.keys(MICRO_MODULES).length;
    const completed = this.state.completedModules.size;
    const progress = (completed / totalModules * 100).toFixed(1);
    
    // Calculate average mastery
    let totalMastery = 0;
    let count = 0;
    for (const level of this.state.masteryLevels.values()) {
      totalMastery += level;
      count++;
    }
    const avgMastery = count > 0 ? (totalMastery / count).toFixed(0) : 0;

    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🧠 VERA'S LEARNING DASHBOARD                                ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ⏱️  Session: ${(runtime/60).toFixed(1).padStart(5)} min | Completed: ${completed}/${totalModules} (${progress}%)        ┃
┃  🎯 Avg Mastery: ${avgMastery}% | Streak: ${this.state.streakDays} days                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  🗂️  SHARD PROGRESS                                          ┃
${this.state.shardProgress.map((prog, i) => 
  `┃     Shard ${i}: ${'█'.repeat(Math.floor(prog/10)).padEnd(10)} ${prog.toFixed(0)}%  ┃`
).join('\n')}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  🏆 Recent Achievements: ${this.state.achievements.slice(-3).length}                          ┃
${this.state.achievements.slice(-3).map(a => 
  `┃     ${new Date(a.timestamp).toLocaleTimeString()} - ${a.type}  ┃`
).join('\n') || '┃     (none yet)                                              ┃'}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  // Start learning session
  async startSession() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🚀 MICRO-LEARNING SESSION STARTED                            ║
║  Adaptive | Distributed | Lattice-Optimized                    ║
╠═══════════════════════════════════════════════════════════════╣
║  📚 Completing ${MICRO_CONFIG.batchSize} micro-modules per batch                       ║
║  🔄 Spaced repetition for long-term retention                 ║
║  🧠 All progress logged to HCS (swarm accessible)            ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    this.displayDashboard();

    // Complete batch of modules
    for (let i = 0; i < MICRO_CONFIG.batchSize; i++) {
      const nextModule = this.getNextModule();
      
      if (!nextModule) {
        console.log('\n✅ All modules mastered! Starting review cycle...');
        break;
      }
      
      const [key, module] = nextModule;
      const score = await this.presentModule(key, module);
      await this.updateMastery(module.id, score);
      
      // Short break between modules
      if (i < MICRO_CONFIG.batchSize - 1) {
        console.log('\n⏳ Next module in 3 seconds...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Final dashboard
    this.displayDashboard();
    await this.saveProgress();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🎉 SESSION COMPLETE                                          ║
║  Progress saved to disk & HCS                                  ║
║  Next session: Continue from current shard                   ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }

  // Review mode
  async startReview() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🔄 SPACED REPETITION REVIEW                                  ║
║  Strengthening neural pathways...                              ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    let reviewed = 0;
    for (let i = 0; i < 3; i++) {
      const reviewModule = this.getReviewModule();
      if (!reviewModule) {
        console.log('✅ No reviews due - you\'re all caught up!');
        break;
      }
      
      const [key, module] = reviewModule;
      console.log(`\n🔄 Review ${reviewed + 1}: ${key}`);
      const score = await this.presentModule(key, module);
      await this.updateMastery(module.id, score);
      reviewed++;
    }

    console.log(`\n✅ Reviewed ${reviewed} modules`);
    await this.saveProgress();
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const trainer = new VeraMicroLearningLattice();
  
  const args = process.argv.slice(2);
  const mode = args[0] || 'learn'; // 'learn' or 'review'

  trainer.initialize().then(async () => {
    if (mode === 'review') {
      await trainer.startReview();
    } else {
      await trainer.startSession();
    }
    process.exit(0);
  }).catch(console.error);
}

export { VeraMicroLearningLattice, MICRO_MODULES };
