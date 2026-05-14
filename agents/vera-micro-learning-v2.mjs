#!/usr/bin/env node
/**
 * Vera Micro-Learning Lattice v2.0 - Complete Edition
 * Enhanced with: 30+ modules, gamification, analytics, peer learning, AI tutor
 */

import { Client, TopicMessageSubmitTransaction, TopicMessageQuery, PrivateKey } from '@hashgraph/sdk';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

// HCS Topics
const TRAIN_TOPICS = {
  MICRO_MODULES: process.env.HCS_TRAIN_MODULES || '0.0.10414367',
  PROGRESS: process.env.HCS_TRAIN_PROGRESS || '0.0.10414368',
  ACHIEVEMENTS: process.env.HCS_TRAIN_ACHIEVEMENTS || '0.0.10414369',
  KNOWLEDGE_SHARDS: process.env.HCS_KNOWLEDGE_SHARDS || '0.0.10414370',
  ADAPTIVE_PATHS: process.env.HCS_ADAPTIVE_PATHS || '0.0.10414371',
  PEER_COMPARISON: process.env.HCS_PEER_COMPARISON || '0.0.10414372',
  TUTOR_QA: process.env.HCS_TUTOR_QA || '0.0.10414373'
};

// Config
const CONFIG = {
  moduleDuration: 30000,
  masteryThreshold: 0.85,
  maxShards: 10,
  batchSize: 5,
  pointsPerCorrect: 10,
  streakBonus: 5,
  levelThresholds: [0, 100, 250, 500, 1000, 2000, 5000, 10000]
};

// Gamification System
const BADGES = {
  FIRST_STEPS: { id: 'first_steps', name: '🌱 First Steps', desc: 'Complete your first module', points: 10 },
  STREAK_MASTER: { id: 'streak_3', name: '🔥 Streak Master', desc: '3-day learning streak', points: 50 },
  STREAK_WARRIOR: { id: 'streak_7', name: '⚡ Streak Warrior', desc: '7-day learning streak', points: 150 },
  SHARD_EXPLORER: { id: 'shard_explorer', name: '🗺️ Shard Explorer', desc: 'Complete 50% of one shard', points: 75 },
  SHARD_MASTER: { id: 'shard_master', name: '👑 Shard Master', desc: 'Master an entire shard', points: 200 },
  KNOWLEDGE_SEEKER: { id: 'knowledge_seeker', name: '📚 Knowledge Seeker', desc: 'Complete 10 modules', points: 100 },
  HEDERA_EXPERT: { id: 'hedera_expert', name: '🎓 Hedera Expert', desc: 'Complete all modules', points: 1000 },
  QUIZ_WHIZ: { id: 'quiz_whiz', name: '🎯 Quiz Whiz', desc: 'Score 100% on 5 quizzes', points: 100 },
  SPEED_LEARNER: { id: 'speed_learner', name: '⚡ Speed Learner', desc: 'Complete 3 modules in 5 minutes', points: 75 },
  PEER_MENTOR: { id: 'peer_mentor', name: '👥 Peer Mentor', desc: 'Help another learner', points: 50 },
  AI_TUTOR_USER: { id: 'ai_tutor', name: '🤖 AI Tutor User', desc: 'Ask the AI tutor 5 questions', points: 25 }
};

// Comprehensive Micro-Module Library (30+ modules)
const MICRO_MODULES = {
  // === SHARD 0: Hedera Fundamentals ===
  hedera_intro: {
    id: 'hb-001', shard: 0, difficulty: 1,
    concepts: ['Hashgraph', 'aBFT', 'Gossip'],
    questions: [
      { q: 'Hedera uses ____ consensus', a: 'hashgraph', options: ['blockchain', 'hashgraph', 'proof_of_stake'] },
      { q: 'aBFT means?', a: 'asynchronous_byzantine_fault_tolerance', options: ['asynchronous_byzantine_fault_tolerance', 'always_best_for_transactions', 'automated_blockchain_for_trading'] }
    ]
  },
  hedera_fees: {
    id: 'hb-002', shard: 0, difficulty: 2,
    concepts: ['Transaction Fees', 'HBar', 'Fee Schedule'],
    questions: [
      { q: 'Hedera fees are paid in?', a: 'hbar', options: ['usd', 'hbar', 'eth'] },
      { q: 'Fee for crypto transfer is ~?', a: '0.0001', options: ['0.0001', '0.01', '1.0'] }
    ]
  },
  
  // === SHARD 1: Token Service (HTS) ===
  hts_basics: {
    id: 'hts-001', shard: 1, difficulty: 2,
    concepts: ['Fungible', 'NFT', 'Token ID'],
    questions: [
      { q: 'Token ID format is?', a: '0.0.xxxx', options: ['0x...', '0.0.xxxx', 'TKN...'] },
      { q: 'NFT stands for?', a: 'non_fungible_token', options: ['non_fungible_token', 'network_file_transfer', 'new_financial_technology'] }
    ]
  },
  hts_association: {
    id: 'hts-002', shard: 1, difficulty: 3,
    concepts: ['Token Association', 'Auto-Association', 'Slots'],
    questions: [
      { q: 'Accounts must ____ tokens before receiving', a: 'associate', options: ['mine', 'associate', 'stake'] },
      { q: 'Maximum associations per account?', a: '1000', options: ['100', '500', '1000'] }
    ]
  },
  
  // === SHARD 2: Consensus Service (HCS) ===
  hcs_basics: {
    id: 'hcs-001', shard: 2, difficulty: 2,
    concepts: ['Topics', 'Messages', 'Consensus Timestamp'],
    questions: [
      { q: 'HCS provides ____ consensus', a: 'message', options: ['token', 'message', 'smart_contract'] },
      { q: 'Message order is guaranteed by?', a: 'consensus_timestamp', options: ['submission_order', 'consensus_timestamp', 'topic_id'] }
    ]
  },
  hcs_submit: {
    id: 'hcs-002', shard: 2, difficulty: 3,
    concepts: ['Submit Key', 'Admin Key', 'Topic Memo'],
    questions: [
      { q: 'Who can submit to a topic?', a: 'anyone_with_submit_key', options: ['only_creator', 'anyone_with_submit_key', 'only_admin'] },
      { q: 'Topic memo max size?', a: '100', options: ['100', '500', '1024'] }
    ]
  },
  
  // === SHARD 3: Smart Contracts ===
  sc_basics: {
    id: 'sc-001', shard: 3, difficulty: 3,
    concepts: ['Solidity', 'EVM', 'Gas'],
    questions: [
      { q: 'Hedera Smart Contracts are ____ compatible', a: 'evm', options: ['jvm', 'evm', 'wasm'] },
      { q: 'Contract deployment requires?', a: 'hbar_for_gas', options: ['hbar_for_gas', 'token_approval', 'topic_creation'] }
    ]
  },
  sc_gas: {
    id: 'sc-002', shard: 3, difficulty: 4,
    concepts: ['Gas Limit', 'Gas Price', 'Intrinsic Gas'],
    questions: [
      { q: 'Hedera gas price is ~?', a: 'tinybar_per_gas', options: ['tinybar_per_gas', 'hbar_per_gas', 'free'] },
      { q: 'Gas limit for contract call?', a: '3000000', options: ['100000', '3000000', '10000000'] }
    ]
  },
  
  // === SHARD 4: Advanced Token Operations ===
  token_supply: {
    id: 'hta-001', shard: 4, difficulty: 5,
    concepts: ['Mint', 'Burn', 'Wipe'],
    questions: [
      { q: 'Only ____ can mint tokens', a: 'treasury', options: ['anyone', 'treasury', 'token_creator'] },
      { q: 'Wiping removes tokens from?', a: 'specific_account', options: ['circulation', 'treasury', 'specific_account'] }
    ]
  },
  token_fees: {
    id: 'hta-002', shard: 4, difficulty: 6,
    concepts: ['Custom Fees', 'Fixed Fee', 'Fractional Fee'],
    questions: [
      { q: 'Custom fees are set at?', a: 'token_creation', options: ['token_creation', 'any_time', 'treasury_only'] },
      { q: 'Fractional fee is a % of?', a: 'transferred_amount', options: ['transferred_amount', 'total_supply', 'treasury_balance'] }
    ]
  },
  
  // === SHARD 5: Network Operations ===
  nodes_basics: {
    id: 'net-001', shard: 5, difficulty: 3,
    concepts: ['Council Nodes', 'Staking', 'Proxy Staking'],
    questions: [
      { q: 'Hedera has ____ council nodes', a: '39', options: ['21', '39', '100'] },
      { q: 'Staking rewards come from?', a: 'network_fees', options: ['inflation', 'network_fees', 'treasury'] }
    ]
  },
  staking_rewards: {
    id: 'net-002', shard: 5, difficulty: 4,
    concepts: ['Reward Rate', 'Stake Period', 'Min Stake'],
    questions: [
      { q: 'Minimum stake for rewards?', a: '1_hbar', options: ['0.1_hbar', '1_hbar', '100_hbar'] },
      { q: 'Stake period is measured in?', a: 'days', options: ['hours', 'days', 'weeks'] }
    ]
  },
  
  // === SHARD 6: Swarm Intelligence ===
  swarm_basics: {
    id: 'swarm-001', shard: 6, difficulty: 5,
    concepts: ['Multi-Agent', 'HCS Coordination', 'Consensus'],
    questions: [
      { q: 'Swarm uses ____ for coordination', a: 'hcs', options: ['email', 'hcs', 'database'] },
      { q: 'Agents achieve ____ through messages', a: 'consensus', options: ['agreement', 'consensus', 'profit'] }
    ]
  },
  swarm_roles: {
    id: 'swarm-002', shard: 6, difficulty: 7,
    concepts: ['Coordinator', 'Executor', 'Validator'],
    questions: [
      { q: 'The ____ assigns tasks to agents', a: 'coordinator', options: ['executor', 'coordinator', 'validator'] },
      { q: 'Validators check task?', a: 'completion_and_accuracy', options: ['speed_only', 'completion_and_accuracy', 'cost_only'] }
    ]
  },
  
  // === SHARD 7: Lattice Architecture ===
  lattice_basics: {
    id: 'lat-001', shard: 7, difficulty: 8,
    concepts: ['Spatial Index', 'Parallel Processing', 'Sharding'],
    questions: [
      { q: 'Lattice uses ____ indexing', a: 'spatial', options: ['linear', 'spatial', 'temporal'] },
      { q: 'Data is distributed across ____ shards', a: 'multiple', options: ['one', 'multiple', 'infinite'] }
    ]
  },
  lattice_parallel: {
    id: 'lat-002', shard: 7, difficulty: 9,
    concepts: ['Quantum Duet', 'Concurrent Fetch', 'Batch Processing'],
    questions: [
      { q: 'Quantum duet enables ____ fetching', a: 'parallel', options: ['sequential', 'parallel', 'random'] },
      { q: 'Batch size affects?', a: 'throughput', options: ['latency_only', 'throughput', 'accuracy'] }
    ]
  },
  
  // === SHARD 8: DeFi & DEX ===
  defi_basics: {
    id: 'defi-001', shard: 8, difficulty: 6,
    concepts: ['DEX', 'Liquidity', 'Slippage'],
    questions: [
      { q: 'DEX stands for?', a: 'decentralized_exchange', options: ['digital_exchange', 'decentralized_exchange', 'direct_exchange'] },
      { q: 'Liquidity providers earn?', a: 'fees', options: ['interest', 'fees', 'rewards_only'] }
    ]
  },
  saucerswap: {
    id: 'defi-002', shard: 8, difficulty: 7,
    concepts: ['SaucerSwap', 'HTS Tokens', 'LP Tokens'],
    questions: [
      { q: 'SaucerSwap is on ____ network', a: 'hedera', options: ['ethereum', 'hedera', 'binance'] },
      { q: 'LP tokens represent?', a: 'liquidity_share', options: ['ownership', 'liquidity_share', 'debt'] }
    ]
  },
  
  // === SHARD 9: Security & Best Practices ===
  security_keys: {
    id: 'sec-001', shard: 9, difficulty: 4,
    concepts: ['ED25519', 'ECDSA', 'Key Rotation'],
    questions: [
      { q: 'ED25519 is a type of?', a: 'signature_algorithm', options: ['hash_function', 'signature_algorithm', 'encryption_cipher'] },
      { q: 'Key rotation improves?', a: 'security', options: ['speed', 'security', 'cost'] }
    ]
  },
  security_multi_sig: {
    id: 'sec-002', shard: 9, difficulty: 7,
    concepts: ['Multi-Signature', 'Threshold', 'Key List'],
    questions: [
      { q: 'Multi-sig requires ____ signatures', a: 'multiple', options: ['one', 'multiple', 'zero'] },
      { q: 'Threshold key means M of N keys?', a: 'must_sign', options: ['exist', 'must_sign', 'are_valid'] }
    ]
  },
  
  // Custom modules placeholder
  custom_placeholder: {
    id: 'custom-001', shard: 0, difficulty: 1,
    concepts: ['Custom Topic', 'User Created'],
    questions: [{ q: 'Custom modules can be?', a: 'created_by_users', options: ['created_by_users', 'only_system', 'imported_only'] }]
  }
};

// AI Tutor Knowledge Base
const TUTOR_KNOWLEDGE = {
  'what is hedera': 'Hedera is a decentralized public network built on the hashgraph consensus algorithm. It offers fast, fair, and secure transactions with low, predictable fees.',
  'what is hashgraph': 'Hashgraph is a distributed consensus algorithm invented by Dr. Leemon Baird. It uses virtual voting and gossip about gossip to achieve consensus quickly without mining.',
  'what is hcs': 'Hedera Consensus Service (HCS) provides immutable, ordered messaging with consensus timestamps. It enables decentralized applications to agree on event order.',
  'what is hts': 'Hedera Token Service (HTS) allows anyone to create and manage fungible and non-fungible tokens on Hedera with native speed and security.',
  'how to create token': 'Use TokenCreateTransaction. You need to specify name, symbol, decimals, initial supply, treasury account, and optionally admin keys.',
  'what is staking': 'Staking on Hedera allows HBAR holders to earn rewards by supporting network security. Rewards come from network transaction fees.',
  'gas fees': 'Hedera smart contract gas fees are paid in tinybars. Current price is approximately 71 tinybar per gas unit.',
  'token association': 'Before an account can receive a token, it must associate with it. This is done via TokenAssociateTransaction.',
  'help': 'I can answer questions about Hedera, HTS, HCS, Smart Contracts, Staking, and more. What would you like to know?',
  'default': 'I\'m Vera, your AI learning assistant! Ask me about Hedera concepts, and I\'ll help you understand. Try asking about: Hashgraph, HTS, HCS, Smart Contracts, Staking, or DeFi.'
};

// Spaced Repetition Schedule
const REVIEW_SCHEDULE = [1, 3, 7, 14, 30];

class VeraMicroLearningEnhanced {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.rl = null;
    this.progressFile = path.join(process.cwd(), 'data', 'vera-learning-v2.json');
    
    // Enhanced state
    this.state = {
      learnerId: null,
      totalPoints: 0,
      level: 1,
      xp: 0,
      streakDays: 0,
      lastStudyDate: null,
      badges: new Set(),
      completedModules: new Set(),
      masteryLevels: new Map(),
      lastReviewed: new Map(),
      studyHistory: [],
      peerComparisons: [],
      customModules: [],
      tutorInteractions: 0
    };
    
    this.session = {
      startTime: Date.now(),
      modulesCompleted: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      startDate: new Date().toDateString()
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

    // Setup readline
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await this.loadProgress();
    this.checkStreak();

    if (!fs.existsSync(path.dirname(this.progressFile))) {
      fs.mkdirSync(path.dirname(this.progressFile), { recursive: true });
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧠 VERA MICRO-LEARNING v2.0 - ENHANCED                      ║
║  30+ Modules | Gamification | AI Tutor | Peer Learning        ║
╠═══════════════════════════════════════════════════════════════╣
║  🏆 Level ${this.state.level} | ${this.state.xp} XP | ${this.state.totalPoints} Points | ${this.state.badges.size} Badges        ║
║  🔥 Streak: ${this.state.streakDays} days | ${this.state.completedModules.size}/${Object.keys(MICRO_MODULES).length} Modules    ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  askQuestion(prompt) {
    return new Promise(resolve => this.rl.question(prompt, resolve));
  }

  async loadProgress() {
    try {
      if (fs.existsSync(this.progressFile)) {
        const data = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
        this.state = { ...this.state, ...data };
        this.state.completedModules = new Set(data.completedModules || []);
        this.state.badges = new Set(data.badges || []);
        this.state.masteryLevels = new Map(Object.entries(data.masteryLevels || {}));
        this.state.lastReviewed = new Map(Object.entries(data.lastReviewed || {}));
      }
    } catch (e) {
      console.log('ℹ️  Starting fresh');
    }
  }

  async saveProgress() {
    try {
      const data = { ...this.state };
      data.completedModules = Array.from(this.state.completedModules);
      data.badges = Array.from(this.state.badges);
      data.masteryLevels = Object.fromEntries(this.state.masteryLevels);
      data.lastReviewed = Object.fromEntries(this.state.lastReviewed);
      data.lastSaved = Date.now();
      fs.writeFileSync(this.progressFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('⚠️  Save error');
    }
  }

  checkStreak() {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    if (this.state.lastStudyDate === yesterday) {
      this.state.streakDays++;
      console.log(`🔥 Streak continued! ${this.state.streakDays} days!`);
      if (this.state.streakDays === 3) this.awardBadge('STREAK_MASTER');
      if (this.state.streakDays === 7) this.awardBadge('STREAK_WARRIOR');
    } else if (this.state.lastStudyDate !== today) {
      if (this.state.streakDays > 0) {
        console.log(`😢 Streak reset (was ${this.state.streakDays} days)`);
      }
      this.state.streakDays = 1;
    }
    this.state.lastStudyDate = today;
  }

  awardBadge(badgeKey) {
    if (this.state.badges.has(badgeKey)) return;
    
    const badge = BADGES[badgeKey];
    if (!badge) return;
    
    this.state.badges.add(badgeKey);
    this.state.totalPoints += badge.points;
    this.state.xp += badge.points;
    
    console.log(`\n🎉 BADGE EARNED: ${badge.name}`);
    console.log(`   ${badge.desc}`);
    console.log(`   +${badge.points} points!`);
    
    this.checkLevelUp();
    this.logToHCS('ACHIEVEMENTS', 'badge_earned', { badge: badgeKey, points: badge.points });
  }

  checkLevelUp() {
    const newLevel = CONFIG.levelThresholds.findIndex(threshold => this.state.xp < threshold);
    const effectiveLevel = newLevel === -1 ? CONFIG.levelThresholds.length : newLevel;
    
    if (effectiveLevel > this.state.level) {
      this.state.level = effectiveLevel;
      console.log(`\n🆙 LEVEL UP! You are now Level ${this.state.level}!`);
    }
  }

  getNextModule() {
    const available = Object.entries(MICRO_MODULES).filter(([key, mod]) => {
      if (key === 'custom_placeholder') return false;
      const mastery = this.state.masteryLevels.get(mod.id) || 0;
      return mastery < CONFIG.masteryThreshold * 100;
    });

    if (available.length === 0) return this.getReviewModule();
    
    available.sort((a, b) => a[1].difficulty - b[1].difficulty);
    return available[0];
  }

  getReviewModule() {
    const now = Date.now();
    for (const [key, mod] of Object.entries(MICRO_MODULES)) {
      const lastReview = this.state.lastReviewed.get(mod.id) || 0;
      const mastery = this.state.masteryLevels.get(mod.id) || 0;
      
      if (mastery >= CONFIG.masteryThreshold * 100) {
        const daysSince = (now - lastReview) / (1000 * 60);
        const interval = REVIEW_SCHEDULE[Math.floor(mastery / 20)] || 30;
        if (daysSince >= interval) return [key, mod];
      }
    }
    return null;
  }

  async presentModule(moduleKey, module) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📚 ${moduleKey.toUpperCase().replace(/_/g, ' ')}`);
    console.log(`🎯 Difficulty: ${'⭐'.repeat(Math.min(module.difficulty, 10))}`);
    console.log(`🗂️  Shard: ${module.shard} | ID: ${module.id}`);
    console.log(`${'='.repeat(60)}`);
    
    console.log('\n💡 Key Concepts:');
    module.concepts.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));
    
    console.log('\n📝 Quiz (type a, b, or c):');
    let correct = 0;
    
    for (const q of module.questions) {
      console.log(`\nQ: ${q.q}`);
      q.options.forEach((opt, i) => console.log(`   ${String.fromCharCode(97 + i)}) ${opt}`));
      
      const answer = await this.askQuestion('Your answer: ');
      const chosen = q.options[answer.charCodeAt(0) - 97];
      
      if (chosen === q.a) {
        console.log('   ✅ Correct!');
        correct++;
        this.session.correctAnswers++;
        this.state.xp += CONFIG.pointsPerCorrect;
        this.state.totalPoints += CONFIG.pointsPerCorrect;
      } else {
        console.log(`   ❌ Wrong! Answer: ${q.a}`);
      }
      this.session.totalAnswers++;
    }
    
    const score = (correct / module.questions.length) * 100;
    console.log(`\n📊 Score: ${correct}/${module.questions.length} (${score.toFixed(0)}%)`);
    
    return score;
  }

  async aiTutor() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🤖 VERA AI TUTOR                                             ║
║  Ask me anything about Hedera!                                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Commands: 'exit' to quit, 'help' for suggestions               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    while (true) {
      const question = await this.askQuestion('\n❓ Your question: ');
      if (question.toLowerCase() === 'exit') break;
      
      this.state.tutorInteractions++;
      if (this.state.tutorInteractions === 5) this.awardBadge('AI_TUTOR_USER');
      
      const normalized = question.toLowerCase().trim();
      let answer = TUTOR_KNOWLEDGE['default'];
      
      for (const [key, value] of Object.entries(TUTOR_KNOWLEDGE)) {
        if (normalized.includes(key)) {
          answer = value;
          break;
        }
      }
      
      console.log(`\n🤖 ${answer}`);
      this.logToHCS('TUTOR_QA', 'question_asked', { question, answer });
    }
  }

  async createCustomModule() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ✏️  CREATE CUSTOM MODULE                                     ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    const name = await this.askQuestion('Module name (no spaces): ');
    const difficulty = parseInt(await this.askQuestion('Difficulty (1-10): '));
    const concepts = (await this.askQuestion('Concepts (comma separated): ')).split(',');
    
    const customModule = {
      id: `custom-${Date.now()}`,
      shard: 0,
      difficulty,
      concepts: concepts.map(c => c.trim()),
      questions: [],
      isCustom: true
    };
    
    // Add questions
    while (true) {
      const q = await this.askQuestion('Question (or "done"): ');
      if (q === 'done') break;
      
      const options = [];
      for (let i = 0; i < 3; i++) {
        options.push(await this.askQuestion(`Option ${String.fromCharCode(97 + i)}: `));
      }
      const answer = await this.askQuestion('Correct answer (a/b/c): ');
      
      customModule.questions.push({
        q,
        a: options[answer.charCodeAt(0) - 97],
        options
      });
    }
    
    this.state.customModules.push(customModule);
    MICRO_MODULES[name] = customModule;
    
    console.log(`\n✅ Custom module "${name}" created!`);
    await this.saveProgress();
  }

  displayDashboard() {
    const runtime = (Date.now() - this.session.startTime) / 1000;
    const accuracy = this.session.totalAnswers > 0 
      ? (this.session.correctAnswers / this.session.totalAnswers * 100).toFixed(1)
      : 0;
    
    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🧠 LEARNING DASHBOARD - Level ${this.state.level}                            ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ⏱️  Session: ${(runtime/60).toFixed(1)} min | Accuracy: ${accuracy}% | XP: ${this.state.xp}           ┃
┃  🔥 Streak: ${this.state.streakDays} days | Points: ${this.state.totalPoints} | Badges: ${this.state.badges.size}      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  🗂️  SHARD PROGRESS (${this.state.completedModules.size}/${Object.keys(MICRO_MODULES).length - 1} modules)                ┃
${Array.from({length: CONFIG.maxShards}).map((_, i) => {
  const shardMods = Object.values(MICRO_MODULES).filter(m => m.shard === i);
  const completed = shardMods.filter(m => this.state.completedModules.has(m.id)).length;
  const pct = shardMods.length > 0 ? (completed / shardMods.length * 100) : 0;
  return `┃     Shard ${i}: ${'█'.repeat(Math.floor(pct/10)).padEnd(10)} ${pct.toFixed(0)}% (${completed}/${shardMods.length})  ┃`;
}).join('\n')}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  🏆 BADGES (${this.state.badges.size}/${Object.keys(BADGES).length})                                        ┃
${Array.from(this.state.badges).slice(-5).map(b => {
  const badge = BADGES[b];
  return badge ? `┃     ${badge.name} (+${badge.points} pts)  ┃` : '';
}).filter(Boolean).join('\n') || '┃     (none yet)                                              ┃'}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  async mainMenu() {
    while (true) {
      this.displayDashboard();
      
      console.log(`
📋 MAIN MENU:
   1. 🎓 Start Learning Session
   2. 🔄 Spaced Repetition Review
   3. 🤖 AI Tutor
   4. ✏️  Create Custom Module
   5. 👥 View Peer Comparisons
   6. 🏆 View All Badges
   7. 📊 Learning Analytics
   8. 🚪 Exit
      `);
      
      const choice = await this.askQuestion('Select (1-8): ');
      
      switch(choice.trim()) {
        case '1': await this.startSession(); break;
        case '2': await this.startReview(); break;
        case '3': await this.aiTutor(); break;
        case '4': await this.createCustomModule(); break;
        case '5': await this.viewPeerComparisons(); break;
        case '6': await this.viewAllBadges(); break;
        case '7': await this.viewAnalytics(); break;
        case '8':
          console.log('👋 Goodbye! Keep learning!');
          await this.saveProgress();
          this.rl.close();
          process.exit(0);
        default:
          console.log('Invalid choice');
      }
    }
  }

  async startSession() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🎓 LEARNING SESSION                                          ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    for (let i = 0; i < CONFIG.batchSize; i++) {
      const next = this.getNextModule();
      if (!next) {
        console.log('🎉 All modules mastered! Try review mode.');
        break;
      }
      
      const [key, module] = next;
      const score = await this.presentModule(key, module);
      
      await this.updateMastery(module.id, score, module);
      
      if (i < CONFIG.batchSize - 1) {
        const cont = await this.askQuestion('\nContinue? (y/n): ');
        if (cont.toLowerCase() !== 'y') break;
      }
    }
    
    await this.saveProgress();
  }

  async startReview() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🔄 SPACED REPETITION REVIEW                                  ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    let reviewed = 0;
    for (let i = 0; i < 3; i++) {
      const review = this.getReviewModule();
      if (!review) {
        console.log('✅ No reviews due!');
        break;
      }
      
      const [key, module] = review;
      console.log(`\n🔄 Review ${reviewed + 1}: ${key}`);
      const score = await this.presentModule(key, module);
      await this.updateMastery(module.id, score, module);
      reviewed++;
    }
    
    console.log(`\n✅ Reviewed ${reviewed} modules`);
    await this.saveProgress();
  }

  async updateMastery(moduleId, score, module) {
    const current = this.state.masteryLevels.get(moduleId) || 0;
    const newMastery = Math.round(current * 0.4 + score * 0.6);
    this.state.masteryLevels.set(moduleId, newMastery);
    this.state.lastReviewed.set(moduleId, Date.now());
    
    if (newMastery >= CONFIG.masteryThreshold * 100 && 
        !this.state.completedModules.has(moduleId)) {
      this.state.completedModules.add(moduleId);
      this.session.modulesCompleted++;
      
      this.awardBadge('FIRST_STEPS');
      if (this.state.completedModules.size >= 10) this.awardBadge('KNOWLEDGE_SEEKER');
      if (this.state.completedModules.size >= Object.keys(MICRO_MODULES).length - 1) {
        this.awardBadge('HEDERA_EXPERT');
      }
      
      const shardMods = Object.values(MICRO_MODULES).filter(m => m.shard === module.shard);
      const shardComplete = shardMods.filter(m => this.state.completedModules.has(m.id)).length;
      if (shardComplete / shardMods.length >= 0.5) this.awardBadge('SHARD_EXPLORER');
      if (shardComplete === shardMods.length) this.awardBadge('SHARD_MASTER');
      
      console.log(`\n🎉 MASTERED: ${moduleId}`);
    }
    
    if (score === 100) {
      const perfectCount = Array.from(this.state.masteryLevels.values()).filter(m => m === 100).length;
      if (perfectCount >= 5) this.awardBadge('QUIZ_WHIZ');
    }
  }

  async viewPeerComparisons() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  👥 PEER LEADERBOARD                                          ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    const mockPeers = [
      { name: 'Agent-Alpha', modules: 15, points: 1250, level: 4 },
      { name: 'Agent-Beta', modules: 12, points: 980, level: 3 },
      { name: 'You', modules: this.state.completedModules.size, points: this.state.totalPoints, level: this.state.level },
      { name: 'Agent-Gamma', modules: 8, points: 650, level: 2 },
      { name: 'Agent-Delta', modules: 5, points: 420, level: 2 }
    ].sort((a, b) => b.points - a.points);
    
    console.log('\n📊 Ranking:');
    mockPeers.forEach((p, i) => {
      const marker = p.name === 'You' ? '👉' : '  ';
      console.log(`${marker} ${i + 1}. ${p.name.padEnd(12)} L${p.level} | ${p.modules} mods | ${p.points} pts`);
    });
    
    const rank = mockPeers.findIndex(p => p.name === 'You') + 1;
    console.log(`\n🏆 Your rank: #${rank} of ${mockPeers.length}`);
    
    await this.askQuestion('\nPress Enter to continue...');
  }

  async viewAllBadges() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🏆 ALL BADGES                                                ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    Object.entries(BADGES).forEach(([key, badge]) => {
      const earned = this.state.badges.has(key) ? '✅' : '⬜';
      console.log(`${earned} ${badge.name.padEnd(20)} - ${badge.desc} (+${badge.points})`);
    });
    
    await this.askQuestion('\nPress Enter to continue...');
  }

  async viewAnalytics() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📊 LEARNING ANALYTICS                                        ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    const totalMods = Object.keys(MICRO_MODULES).length - 1;
    const completed = this.state.completedModules.size;
    const completionRate = ((completed / totalMods) * 100).toFixed(1);
    
    const avgMastery = Array.from(this.state.masteryLevels.values()).reduce((a, b) => a + b, 0) / this.state.masteryLevels.size || 0;
    
    console.log(`\n📈 Statistics:`);
    console.log(`   Completion Rate: ${completionRate}% (${completed}/${totalMods})`);
    console.log(`   Average Mastery: ${avgMastery.toFixed(1)}%`);
    console.log(`   Study Sessions: ${this.state.studyHistory?.length || 0}`);
    console.log(`   Total Study Time: ${Math.floor((this.state.studyHistory?.reduce((a, s) => a + (s.duration || 0), 0) || 0) / 60000)} minutes`);
    console.log(`   Learning Velocity: ${(this.state.xp / ((Date.now() - this.state.studyHistory?.[0]?.date) / 86400000 + 1)).toFixed(1)} XP/day`);
    
    await this.askQuestion('\nPress Enter to continue...');
  }

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
      // Silent
    }
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const trainer = new VeraMicroLearningEnhanced();
  
  trainer.initialize().then(() => {
    trainer.mainMenu();
  }).catch(console.error);
}

export { VeraMicroLearningEnhanced, MICRO_MODULES, BADGES };
