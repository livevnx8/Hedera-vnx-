#!/usr/bin/env node
/**
 * Vera Conversational AI v1.0
 * Enhanced chatting with context, memory, and HCS logging
 * 
 * Features:
 * - Multi-topic HCS conversation storage
 * - Context-aware dialogue management
 * - Fuzzy intent matching with synonyms
 * - Learning from conversations
 * - Natural dialogue flow with clarifications
 */

import { 
  Client, 
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  PrivateKey
} from '@hashgraph/sdk';
import EventEmitter from 'events';
import dotenv from 'dotenv';

dotenv.config();

// HCS Topics for conversational memory
const CONVERSATION_TOPICS = {
  SHORT_TERM: process.env.HCS_CONV_SHORT || '0.0.10414374',  // Recent context
  LONG_TERM: process.env.HCS_CONV_LONG || '0.0.10414375',    // Persistent memory
  LEARNING: process.env.HCS_CONV_LEARN || '0.0.10414376',      // Learned patterns
  SESSION: process.env.HCS_CONV_SESSION || '0.0.10414377'      // Current session state
};

// Synonym mappings for better intent recognition
const INTENT_SYNONYMS = {
  swap: ['exchange', 'trade', 'convert', 'buy', 'sell', 'get'],
  balance: ['check', 'show', 'display', 'what', 'how much', 'view'],
  create: ['make', 'mint', 'new', 'deploy', 'launch'],
  transfer: ['send', 'move', 'give', 'pay'],
  check: ['verify', 'confirm', 'validate', 'see'],
  help: ['assist', 'support', 'guide', 'explain'],
  goal: ['target', 'objective', 'aim', 'want', 'need'],
  start: ['begin', 'run', 'initiate', 'launch'],
  stop: ['end', 'halt', 'quit', 'exit', 'terminate'],
  yes: ['yeah', 'yep', 'sure', 'ok', 'okay', 'affirmative', 'correct'],
  no: ['nope', 'nah', 'negative', 'incorrect', 'wrong']
};

// Entity patterns
const ENTITY_PATTERNS = {
  tokenId: /0\.0\.\d+/g,
  accountId: /0\.0\.\d+/g,
  amount: /\d+\.?\d*/g,
  percentage: /\d+%/g,
  hbar: /hbar/i,
  token: /token|coin/i
};

class ConversationMemory {
  constructor(vera) {
    this.vera = vera;
    this.shortTerm = [];      // Last 50 messages
    this.longTerm = new Map(); // Key facts
    this.session = {          // Current session
      started: Date.now(),
      goals: [],
      entities: new Map(),
      lastIntent: null,
      turns: 0
    };
    this.learnedPatterns = []; // Successful patterns
  }

  // Add message to short-term memory
  addMessage(role, content, metadata = {}) {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role, // 'user' or 'assistant'
      content,
      timestamp: Date.now(),
      metadata,
      entities: this.extractEntities(content)
    };

    this.shortTerm.push(message);
    this.session.turns++;

    // Keep only last 50
    if (this.shortTerm.length > 50) {
      this.shortTerm.shift();
    }

    // Extract and store entities
    for (const [type, values] of message.entities) {
      for (const value of values) {
        this.session.entities.set(`${type}:${value}`, {
          value,
          type,
          lastMentioned: Date.now(),
          context: content
        });
      }
    }

    return message;
  }

  // Extract entities from text
  extractEntities(text) {
    const entities = new Map();
    
    for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
      const matches = text.match(pattern);
      if (matches) {
        entities.set(type, [...new Set(matches)]);
      }
    }

    return entities;
  }

  // Get context for current conversation
  getContext(window = 10) {
    return this.shortTerm.slice(-window);
  }

  // Get last mentioned entity of type
  getLastEntity(type) {
    const entries = Array.from(this.session.entities.entries())
      .filter(([key, val]) => val.type === type)
      .sort((a, b) => b[1].lastMentioned - a[1].lastMentioned);
    
    return entries[0]?.[1];
  }

  // Store to HCS
  async logToHCS(topic, data) {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topic)
        .setMessage(JSON.stringify({
          timestamp: Date.now(),
          ...data
        }));
      await tx.execute(this.vera.client);
    } catch (e) {
      // Silent fail - don't block conversation
    }
  }

  // Log conversation turn
  async logConversationTurn(userMsg, assistantMsg, intent, success) {
    // Short-term: full conversation
    await this.logToHCS(CONVERSATION_TOPICS.SHORT_TERM, {
      type: 'conversation_turn',
      user: userMsg,
      assistant: assistantMsg,
      intent,
      success,
      sessionId: this.session.started
    });

    // Long-term: important facts
    if (success && intent === 'set_goal') {
      await this.logToHCS(CONVERSATION_TOPICS.LONG_TERM, {
        type: 'user_goal',
        goal: assistantMsg,
        timestamp: Date.now()
      });
    }

    // Learning: patterns
    if (intent && success) {
      await this.logToHCS(CONVERSATION_TOPICS.LEARNING, {
        type: 'successful_pattern',
        input: userMsg,
        intent,
        timestamp: Date.now()
      });
    }
  }

  // Learn from feedback
  async learn(input, expectedIntent, actualIntent, wasCorrect) {
    await this.logToHCS(CONVERSATION_TOPICS.LEARNING, {
      type: 'learning_feedback',
      input,
      expectedIntent,
      actualIntent,
      wasCorrect,
      timestamp: Date.now()
    });

    if (!wasCorrect) {
      // Store as pattern to avoid in future
      this.learnedPatterns.push({
        input,
        misclassifiedAs: actualIntent,
        shouldBe: expectedIntent,
        timestamp: Date.now()
      });
    }
  }

  // Get conversation summary
  getSummary() {
    return {
      totalTurns: this.session.turns,
      duration: Date.now() - this.session.started,
      entities: Array.from(this.session.entities.values()),
      recentContext: this.getContext(5)
    };
  }
}

class FuzzyIntentRecognizer {
  constructor() {
    this.intents = new Map();
    this.confidenceThreshold = 0.6;
  }

  // Register intent with patterns and synonyms
  registerIntent(name, patterns, action, examples = []) {
    const expandedPatterns = [];
    
    for (const pattern of patterns) {
      // Original pattern
      expandedPatterns.push(pattern);
      
      // Expand with synonyms
      const words = pattern.split(/\s+/);
      for (const [word, synonyms] of Object.entries(INTENT_SYNONYMS)) {
        if (words.includes(word)) {
          for (const synonym of synonyms) {
            const newPattern = words.map(w => w === word ? synonym : w).join(' ');
            expandedPatterns.push(newPattern);
          }
        }
      }
    }

    this.intents.set(name, {
      patterns: [...new Set(expandedPatterns)],
      action,
      examples
    });
  }

  // Calculate similarity between two strings
  similarity(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Contains match
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Word overlap
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  // Recognize intent with fuzzy matching
  recognize(input) {
    const normalized = input.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 0;

    for (const [name, data] of this.intents) {
      // Check exact patterns
      for (const pattern of data.patterns) {
        const score = this.similarity(normalized, pattern);
        if (score > bestScore && score >= this.confidenceThreshold) {
          bestScore = score;
          bestMatch = { name, action: data.action, confidence: score };
        }
      }

      // Check examples
      for (const example of data.examples) {
        const score = this.similarity(normalized, example);
        if (score > bestScore && score >= this.confidenceThreshold) {
          bestScore = score;
          bestMatch = { name, action: data.action, confidence: score, fromExample: true };
        }
      }
    }

    return bestMatch;
  }
}

class DialogueManager extends EventEmitter {
  constructor(memory, recognizer) {
    super();
    this.memory = memory;
    this.recognizer = recognizer;
    this.state = 'idle'; // idle, clarifying, confirming, executing
    this.pendingAction = null;
    this.clarificationAttempts = 0;
    this.maxClarifications = 3;
  }

  // Process user input with full context
  async processInput(input) {
    console.log(`🗣️ User: "${input}"`);
    
    // Add to memory
    this.memory.addMessage('user', input);

    // Check for simple responses (yes/no) in clarification state
    if (this.state === 'clarifying') {
      return await this.handleClarificationResponse(input);
    }

    if (this.state === 'confirming') {
      return await this.handleConfirmationResponse(input);
    }

    // Try to recognize intent
    const intent = this.recognizer.recognize(input);

    if (!intent) {
      // No clear intent - ask for clarification
      if (this.clarificationAttempts < this.maxClarifications) {
        this.state = 'clarifying';
        this.clarificationAttempts++;
        
        const context = this.memory.getContext(3);
        const lastTopics = context
          .filter(m => m.metadata?.intent)
          .map(m => m.metadata.intent);
        
        let clarification = "I'm not sure what you'd like me to do. ";
        
        if (lastTopics.length > 0) {
          clarification += `Previously we were talking about ${lastTopics.join(', ')}. `;
        }
        
        clarification += "Could you rephrase? Try:\n" +
          "• 'check my balance'\n" +
          "• 'swap 0.5 HBAR for tokens'\n" +
          "• 'set goal to accumulate 1000 hbar.h'";

        const response = this.respond(clarification);
        await this.memory.logConversationTurn(input, response, null, false);
        return response;
      } else {
        // Too many clarifications - reset
        this.resetState();
        const response = this.respond("I'm having trouble understanding. Let's start fresh. What would you like to do?");
        await this.memory.logConversationTurn(input, response, null, false);
        return response;
      }
    }

    // We have an intent - check if we need confirmation
    if (intent.action.requiresConfirmation) {
      this.state = 'confirming';
      this.pendingAction = intent;
      
      const response = this.respond(`I'll ${intent.action.description}. Is that correct? (yes/no)`);
      await this.memory.logConversationTurn(input, response, intent.name, true);
      return response;
    }

    // Execute directly
    return await this.executeIntent(intent, input);
  }

  async handleClarificationResponse(input) {
    const normalized = input.toLowerCase().trim();
    
    // Try again with the clarification
    const intent = this.recognizer.recognize(input);
    
    if (intent) {
      this.state = 'idle';
      this.clarificationAttempts = 0;
      return await this.executeIntent(intent, input);
    }

    // Still unclear
    const response = this.respond("I still don't understand. Let me show you what I can do:\n" +
      "• Manage tokens: create, transfer, mint, burn\n" +
      "• Check balances and network status\n" +
      "• Set and pursue goals autonomously\n" +
      "• Coordinate with other agents\n\n" +
      "What would you like to try?");
    
    await this.memory.logConversationTurn(input, response, null, false);
    return response;
  }

  async handleConfirmationResponse(input) {
    const normalized = input.toLowerCase().trim();
    const yesWords = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'correct', 'right', 'affirmative'];
    const noWords = ['no', 'nope', 'nah', 'negative', 'wrong', 'incorrect', 'cancel'];

    if (yesWords.some(w => normalized.includes(w))) {
      // Confirmed
      this.state = 'idle';
      const intent = this.pendingAction;
      this.pendingAction = null;
      return await this.executeIntent(intent, input);
    } else if (noWords.some(w => normalized.includes(w))) {
      // Cancelled
      this.state = 'idle';
      this.pendingAction = null;
      const response = this.respond("Okay, I won't do that. What would you like instead?");
      await this.memory.logConversationTurn(input, response, null, true);
      return response;
    } else {
      // Unclear response
      const response = this.respond("Please say 'yes' to confirm or 'no' to cancel.");
      await this.memory.logConversationTurn(input, response, null, false);
      return response;
    }
  }

  async executeIntent(intent, input) {
    this.state = 'executing';
    this.memory.session.lastIntent = intent.name;

    try {
      // Emit for execution
      this.emit('execute', intent, input);
      
      // The actual execution happens in the main Vera class
      // This just manages the dialogue state
      const response = this.respond(`Executing: ${intent.action.description}`);
      await this.memory.logConversationTurn(input, response, intent.name, true);
      
      this.state = 'idle';
      return response;
    } catch (e) {
      this.state = 'idle';
      const response = this.respond(`I couldn't complete that action: ${e.message}`);
      await this.memory.logConversationTurn(input, response, intent.name, false);
      return response;
    }
  }

  respond(message) {
    const response = {
      content: message,
      timestamp: Date.now(),
      role: 'assistant'
    };
    
    this.memory.addMessage('assistant', message, { 
      state: this.state,
      responseType: 'dialogue'
    });
    
    return response;
  }

  resetState() {
    this.state = 'idle';
    this.pendingAction = null;
    this.clarificationAttempts = 0;
  }

  // Generate proactive suggestion based on context
  getProactiveSuggestion() {
    const context = this.memory.getContext(5);
    const entities = Array.from(this.memory.session.entities.values());
    
    // Suggest based on recent activity
    const recentIntents = context
      .filter(m => m.metadata?.intent)
      .map(m => m.metadata.intent);
    
    if (recentIntents.includes('check_balance')) {
      return "Would you like to transfer some tokens or check a specific token's info?";
    }
    
    if (entities.some(e => e.type === 'tokenId')) {
      return "I see you've mentioned a token. Would you like to check its balance or transfer it?";
    }
    
    return null;
  }
}

// Export
export { 
  ConversationMemory, 
  FuzzyIntentRecognizer, 
  DialogueManager,
  INTENT_SYNONYMS,
  CONVERSATION_TOPICS
};

// Test if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('✅ Vera Conversational AI module loaded');
  console.log('   Components: ConversationMemory, FuzzyIntentRecognizer, DialogueManager');
  console.log(`   HCS Topics: ${Object.values(CONVERSATION_TOPICS).join(', ')}`);
}
