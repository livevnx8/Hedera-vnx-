#!/usr/bin/env node
/**
 * Vera Advanced NLP Engine v2.0
 * Phase 2 Implementation: Sentiment, NER, Context-Aware Conversations
 * 
 * Features:
 * - Sentiment analysis for user interactions
 * - Named Entity Recognition (NER) for Hedera entities
 * - 20+ turn conversation memory
 * - Confidence scoring with fallback
 * - Context-aware responses
 */

import { 
  Client, 
  TopicMessageSubmitTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Sentiment word lists
const SENTIMENT = {
  positive: ['good', 'great', 'excellent', 'awesome', 'amazing', 'fantastic', 'wonderful', 
             'love', 'like', 'happy', 'pleased', 'satisfied', 'perfect', 'best', 'thanks',
             'thank', 'helpful', 'useful', 'impressive', 'brilliant', 'smart', 'intelligent'],
  negative: ['bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'unhappy', 
             'disappointed', 'frustrated', 'angry', 'annoyed', 'useless', 'stupid', 
             'dumb', 'wrong', 'error', 'bug', 'broken', 'fail', 'failure', 'problem',
             'issue', 'difficult', 'hard', 'confusing', 'confused', 'not working'],
  urgency: ['urgent', 'emergency', 'critical', 'important', 'asap', 'quickly', 'hurry',
           'now', 'immediately', 'right away', 'fast', 'quick', 'rush']
};

// Hedera Entity Patterns
const HEDERA_ENTITIES = {
  accountId: /\b0\.0\.\d+\b/g,
  tokenId: /\b0\.0\.\d+\b/g,
  contractId: /\b0\.0\.\d+\b/g,
  topicId: /\b0\.0\.\d+\b/g,
  amount: /\b\d+\.?\d*\s*(hbar|ℏ|tokens?)\b/gi,
  percentage: /\b\d+%\b/g,
  txId: /\b\d+\.\d+\.\d+@\d+\.\d+\.\d+\b/g
};

class VeraAdvancedNLP {
  constructor(vera) {
    this.vera = vera;
    this.client = null;
    this.conversationHistory = [];
    this.maxHistory = 20;
    this.entityCache = new Map();
    this.contextTopics = new Set();
    this.sentimentLog = [];
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

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧠 VERA ADVANCED NLP ENGINE v2.0                              ║
║  Phase 2: AI/ML Intelligence                                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Capabilities:                                                ║
║     • Sentiment Analysis (Positive/Negative/Urgent)           ║
║     • Named Entity Recognition (Hedera IDs, amounts)          ║
║     • 20+ Turn Conversation Memory                            ║
║     • Context-Aware Responses                                  ║
║     • Confidence Scoring with Fallback                        ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // ============================================
  // SENTIMENT ANALYSIS
  // ============================================

  analyzeSentiment(text) {
    const words = text.toLowerCase().split(/\s+/);
    let score = 0;
    let urgency = 0;
    const matched = { positive: [], negative: [], urgency: [] };

    for (const word of words) {
      if (SENTIMENT.positive.includes(word)) {
        score += 1;
        matched.positive.push(word);
      }
      if (SENTIMENT.negative.includes(word)) {
        score -= 1;
        matched.negative.push(word);
      }
      if (SENTIMENT.urgency.includes(word)) {
        urgency += 1;
        matched.urgency.push(word);
      }
    }

    const sentiment = {
      score,
      urgency,
      magnitude: Math.abs(score) + urgency,
      classification: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral',
      isUrgent: urgency > 0,
      matched,
      timestamp: Date.now()
    };

    this.sentimentLog.push(sentiment);
    return sentiment;
  }

  // ============================================
  // NAMED ENTITY RECOGNITION
  // ============================================

  extractEntities(text) {
    const entities = {
      accounts: [],
      tokens: [],
      contracts: [],
      topics: [],
      amounts: [],
      percentages: [],
      transactions: [],
      raw: {}
    };

    // Extract Hedera IDs
    const ids = text.match(HEDERA_ENTITIES.accountId) || [];
    for (const id of [...new Set(ids)]) {
      // Categorize by context
      if (text.toLowerCase().includes('token') && text.includes(id)) {
        entities.tokens.push({ id, context: this.extractContext(text, id) });
      } else if (text.toLowerCase().includes('contract') && text.includes(id)) {
        entities.contracts.push({ id, context: this.extractContext(text, id) });
      } else if (text.toLowerCase().includes('topic') && text.includes(id)) {
        entities.topics.push({ id, context: this.extractContext(text, id) });
      } else {
        entities.accounts.push({ id, context: this.extractContext(text, id) });
      }
    }

    // Extract amounts
    const amounts = text.match(HEDERA_ENTITIES.amount) || [];
    entities.amounts = amounts.map(a => ({ value: a, numeric: parseFloat(a) }));

    // Extract percentages
    const percentages = text.match(HEDERA_ENTITIES.percentage) || [];
    entities.percentages = percentages.map(p => parseFloat(p));

    // Extract transaction IDs
    entities.transactions = text.match(HEDERA_ENTITIES.txId) || [];

    // Cache entities
    for (const [type, list] of Object.entries(entities)) {
      if (Array.isArray(list) && list.length > 0) {
        this.entityCache.set(`${type}:${Date.now()}`, { entities: list, timestamp: Date.now() });
      }
    }

    return entities;
  }

  extractContext(text, entity) {
    const index = text.indexOf(entity);
    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + entity.length + 50);
    return text.substring(start, end).trim();
  }

  // ============================================
  // CONVERSATION MEMORY
  // ============================================

  addToHistory(role, content, metadata = {}) {
    const entry = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      entities: this.extractEntities(content),
      sentiment: this.analyzeSentiment(content),
      metadata
    };

    this.conversationHistory.push(entry);

    // Keep only last 20
    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory.shift();
    }

    // Update context topics
    this.updateContextTopics(entry);

    return entry;
  }

  updateContextTopics(entry) {
    // Extract topics from content
    const topics = [];
    if (entry.content.toLowerCase().includes('token')) topics.push('tokens');
    if (entry.content.toLowerCase().includes('swap') || entry.content.toLowerCase().includes('trade')) topics.push('trading');
    if (entry.content.toLowerCase().includes('balance')) topics.push('account');
    if (entry.content.toLowerCase().includes('network')) topics.push('network');
    if (entry.content.toLowerCase().includes('learn')) topics.push('learning');

    topics.forEach(t => this.contextTopics.add(t));
  }

  getContext(window = 5) {
    return this.conversationHistory.slice(-window);
  }

  getLastEntity(type) {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const entry = this.conversationHistory[i];
      if (entry.entities[type] && entry.entities[type].length > 0) {
        return entry.entities[type][entry.entities[type].length - 1];
      }
    }
    return null;
  }

  // ============================================
  // CONFIDENCE SCORING
  // ============================================

  calculateConfidence(intent, input, context) {
    let confidence = 0.5; // Base confidence

    // Intent match quality
    if (intent.confidence) {
      confidence += intent.confidence * 0.3;
    }

    // Context consistency
    const recentTopics = Array.from(this.contextTopics);
    if (recentTopics.some(t => input.toLowerCase().includes(t))) {
      confidence += 0.1;
    }

    // Entity presence
    const entities = this.extractEntities(input);
    const hasEntities = Object.values(entities).some(arr => arr.length > 0);
    if (hasEntities) confidence += 0.1;

    // Sentiment appropriateness
    const sentiment = this.analyzeSentiment(input);
    if (!sentiment.isUrgent || intent.action === 'help') {
      confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  // ============================================
  // CONTEXT-AWARE RESPONSES
  // ============================================

  generateContextualResponse(intent, entities, sentiment) {
    let response = '';

    // Adjust tone based on sentiment
    if (sentiment.classification === 'negative') {
      response += "I understand your frustration. ";
    } else if (sentiment.classification === 'positive') {
      response += "Great! ";
    }

    if (sentiment.isUrgent) {
      response += "I'll help you right away. ";
    }

    // Add context from conversation history
    const history = this.getContext(3);
    if (history.length > 0) {
      const lastTopic = history[history.length - 1].metadata?.topic;
      if (lastTopic) {
        response += `Continuing our discussion about ${lastTopic}. `;
      }
    }

    // Include entity references
    if (entities.tokens.length > 0) {
      response += `I see you mentioned ${entities.tokens[0].id}. `;
    }

    return response;
  }

  // ============================================
  // FALLBACK HANDLING
  // ============================================

  generateFallback(context) {
    const suggestions = [];
    
    // Based on context topics
    if (this.contextTopics.has('tokens')) {
      suggestions.push('"check my token balance"');
    }
    if (this.contextTopics.has('trading')) {
      suggestions.push('"swap 1 HBAR for tokens"');
    }
    if (this.contextTopics.has('account')) {
      suggestions.push('"show my account info"');
    }

    // Default suggestions
    if (suggestions.length === 0) {
      suggestions.push('"check my balance"', '"swap tokens"', '"help"');
    }

    return `I'm not sure what you mean. Did you want to:\n${suggestions.map(s => `• ${s}`).join('\n')}`;
  }

  // ============================================
  // HCS LOGGING
  // ============================================

  async logToHCS(topic, data) {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topic)
        .setMessage(JSON.stringify({
          timestamp: Date.now(),
          ...data
        }));
      await tx.execute(this.client);
    } catch (e) {
      // Silent fail
    }
  }

  // ============================================
  // MAIN PROCESSING
  // ============================================

  async processInput(input, intent) {
    // Add to history
    this.addToHistory('user', input, { topic: intent?.action });

    // Analyze sentiment
    const sentiment = this.analyzeSentiment(input);

    // Extract entities
    const entities = this.extractEntities(input);

    // Calculate confidence
    const confidence = this.calculateConfidence(intent, input, this.getContext());

    // Check if confidence is too low
    if (confidence < 0.6) {
      const fallback = this.generateFallback(this.getContext());
      this.addToHistory('assistant', fallback, { type: 'fallback' });
      return {
        content: fallback,
        confidence,
        sentiment,
        entities,
        type: 'fallback'
      };
    }

    // Generate contextual response
    const contextResponse = this.generateContextualResponse(intent, entities, sentiment);

    return {
      contextResponse,
      confidence,
      sentiment,
      entities,
      type: 'contextual'
    };
  }

  getStats() {
    return {
      conversationLength: this.conversationHistory.length,
      uniqueTopics: this.contextTopics.size,
      entityCacheSize: this.entityCache.size,
      sentimentHistory: this.sentimentLog.length,
      avgSentiment: this.sentimentLog.reduce((a, b) => a + b.score, 0) / (this.sentimentLog.length || 1)
    };
  }

  close() {
    this.client?.close();
  }
}

// Export
export { VeraAdvancedNLP, SENTIMENT, HEDERA_ENTITIES };

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const nlp = new VeraAdvancedNLP();
  
  nlp.initialize().then(() => {
    // Test examples
    const tests = [
      "I love this! Swap 0.5 HBAR for 0.0.9356476",
      "This is terrible, my balance is wrong",
      "URGENT: Check account 0.0.10294360 immediately"
    ];

    for (const test of tests) {
      console.log(`\n📝 Input: "${test}"`);
      const sentiment = nlp.analyzeSentiment(test);
      const entities = nlp.extractEntities(test);
      console.log(`   Sentiment: ${sentiment.classification} (${sentiment.score})`);
      console.log(`   Urgent: ${sentiment.isUrgent}`);
      console.log(`   Entities: ${JSON.stringify(entities, null, 2)}`);
    }
  }).catch(console.error);
}
