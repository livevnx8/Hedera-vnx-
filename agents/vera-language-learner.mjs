#!/usr/bin/env node
/**
 * Vera Language Learning Engine v1.0
 * Free English content ingestion and HCS logging
 * 
 * Features:
 * - Free API content fetching (news, quotes, facts)
 * - Language pattern extraction
 * - Vocabulary building
 * - HCS logging of learned content
 * - Knowledge base growth tracking
 */

import { 
  Client, 
  TopicMessageSubmitTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import https from 'https';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Free English content sources (no API key needed)
const FREE_SOURCES = {
  // Random facts API
  facts: 'https://uselessfacts.jsph.pl/random.json?language=en',
  
  // Quotes API
  quotes: 'https://api.quotable.io/random',
  
  // Advice API
  advice: 'https://api.adviceslip.com/advice',
  
  // Jokes (clean)
  jokes: 'https://official-joke-api.appspot.com/random_joke',
  
  // Trivia
  trivia: 'https://opentdb.com/api.php?amount=1&type=multiple',
  
  // Dictionary word of the day concept (using random word)
  words: 'https://random-word-api.herokuapp.com/word?number=1'
};

// HCS Topics for language learning
const LEARNING_TOPICS = {
  VOCABULARY: process.env.HCS_LEARN_VOCAB || '0.0.10414378',
  PATTERNS: process.env.HCS_LEARN_PATTERNS || '0.0.10414379',
  KNOWLEDGE: process.env.HCS_LEARN_KNOWLEDGE || '0.0.10414380',
  CONVERSATIONS: process.env.HCS_LEARN_CONVERSATIONS || '0.0.10414381'
};

class VeraLanguageLearner {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.vocabulary = new Set();
    this.patterns = new Map();
    this.knowledge = [];
    this.sessionStats = {
      fetched: 0,
      learned: 0,
      logged: 0
    };
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
    this.operatorId = operatorId;

    // Load existing vocabulary if available
    this.loadLocalCache();

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📚 VERA LANGUAGE LEARNING ENGINE v1.0                       ║
║  Free English Content Ingestion & HCS Logging                 ║
╠═══════════════════════════════════════════════════════════════╣
║  🌐 Free Sources:                                             ║
║     • Facts API - Random interesting facts                    ║
║     • Quotes API - Inspirational quotations                   ║
║     • Advice API - Helpful tips & guidance                    ║
║     • Jokes API - Clean humor samples                         ║
║     • Trivia API - General knowledge questions                ║
║     • Words API - Vocabulary building                         ║
╠═══════════════════════════════════════════════════════════════╣
║  📝 HCS Learning Topics:                                      ║
║     • ${LEARNING_TOPICS.VOCABULARY} (Vocabulary)                ║
║     • ${LEARNING_TOPICS.PATTERNS} (Patterns)                    ║
║     • ${LEARNING_TOPICS.KNOWLEDGE} (Knowledge)                  ║
║     • ${LEARNING_TOPICS.CONVERSATIONS} (Conversations)          ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    return this;
  }

  // Fetch content from free APIs
  async fetchContent(source) {
    const url = FREE_SOURCES[source];
    if (!url) {
      console.error(`❌ Unknown source: ${source}`);
      return null;
    }

    return new Promise((resolve, reject) => {
      https.get(url, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            this.sessionStats.fetched++;
            resolve(parsed);
          } catch (e) {
            resolve({ raw: data });
          }
        });
      }).on('error', (err) => {
        console.error(`❌ Fetch error: ${err.message}`);
        resolve(null);
      });
    });
  }

  // Learn from facts
  async learnFromFacts() {
    console.log('🎲 Fetching random fact...');
    const data = await this.fetchContent('facts');
    
    if (!data || !data.text) {
      console.log('⚠️ No fact retrieved');
      return null;
    }

    const fact = {
      type: 'fact',
      content: data.text,
      source: 'uselessfacts.jsph.pl',
      timestamp: Date.now(),
      id: `fact-${Date.now()}`
    };

    // Extract vocabulary
    const words = this.extractWords(data.text);
    words.forEach(w => this.vocabulary.add(w));

    // Log to HCS
    await this.logToHCS(LEARNING_TOPICS.KNOWLEDGE, fact);
    
    console.log(`✅ Learned fact: ${data.text.substring(0, 80)}...`);
    console.log(`   New vocabulary: ${words.length} words`);
    
    this.sessionStats.learned++;
    return fact;
  }

  // Learn from quotes
  async learnFromQuotes() {
    console.log('💬 Fetching inspirational quote...');
    const data = await this.fetchContent('quotes');
    
    if (!data || !data.content) {
      console.log('⚠️ No quote retrieved');
      return null;
    }

    const quote = {
      type: 'quote',
      content: data.content,
      author: data.author,
      source: 'quotable.io',
      timestamp: Date.now(),
      id: `quote-${Date.now()}`
    };

    // Extract vocabulary and patterns
    const words = this.extractWords(data.content);
    words.forEach(w => this.vocabulary.add(w));
    
    // Learn sentence structure patterns
    this.learnPattern('quote_structure', data.content);

    // Log to HCS
    await this.logToHCS(LEARNING_TOPICS.CONVERSATIONS, quote);
    
    console.log(`✅ Learned quote: "${data.content.substring(0, 60)}..." - ${data.author}`);
    
    this.sessionStats.learned++;
    return quote;
  }

  // Learn from advice
  async learnFromAdvice() {
    console.log('💡 Fetching advice...');
    const data = await this.fetchContent('advice');
    
    if (!data || !data.slip || !data.slip.advice) {
      console.log('⚠️ No advice retrieved');
      return null;
    }

    const advice = {
      type: 'advice',
      content: data.slip.advice,
      source: 'adviceslip.com',
      timestamp: Date.now(),
      id: `advice-${Date.now()}`
    };

    // Extract vocabulary
    const words = this.extractWords(data.slip.advice);
    words.forEach(w => this.vocabulary.add(w));

    // Learn imperative patterns ("Do this", "Try that")
    this.learnPattern('imperative_advice', data.slip.advice);

    // Log to HCS
    await this.logToHCS(LEARNING_TOPICS.KNOWLEDGE, advice);
    
    console.log(`✅ Learned advice: ${data.slip.advice.substring(0, 80)}...`);
    
    this.sessionStats.learned++;
    return advice;
  }

  // Learn from jokes (for humor understanding)
  async learnFromJokes() {
    console.log('😄 Fetching joke...');
    const data = await this.fetchContent('jokes');
    
    if (!data || !data.setup || !data.punchline) {
      console.log('⚠️ No joke retrieved');
      return null;
    }

    const joke = {
      type: 'joke',
      setup: data.setup,
      punchline: data.punchline,
      source: 'official-joke-api',
      timestamp: Date.now(),
      id: `joke-${Date.now()}`
    };

    // Extract vocabulary from both parts
    const setupWords = this.extractWords(data.setup);
    const punchlineWords = this.extractWords(data.punchline);
    [...setupWords, ...punchlineWords].forEach(w => this.vocabulary.add(w));

    // Learn Q&A pattern
    this.learnPattern('question_answer', `${data.setup} -> ${data.punchline}`);

    // Log to HCS
    await this.logToHCS(LEARNING_TOPICS.CONVERSATIONS, joke);
    
    console.log(`✅ Learned joke:`);
    console.log(`   Q: ${data.setup}`);
    console.log(`   A: ${data.punchline}`);
    
    this.sessionStats.learned++;
    return joke;
  }

  // Learn from trivia
  async learnFromTrivia() {
    console.log('🧠 Fetching trivia...');
    const data = await this.fetchContent('trivia');
    
    if (!data || !data.results || data.results.length === 0) {
      console.log('⚠️ No trivia retrieved');
      return null;
    }

    const trivia = data.results[0];
    const triviaItem = {
      type: 'trivia',
      question: trivia.question,
      correct_answer: trivia.correct_answer,
      incorrect_answers: trivia.incorrect_answers,
      category: trivia.category,
      difficulty: trivia.difficulty,
      source: 'opentdb.com',
      timestamp: Date.now(),
      id: `trivia-${Date.now()}`
    };

    // Extract vocabulary
    const questionWords = this.extractWords(trivia.question);
    const answerWords = this.extractWords(trivia.correct_answer);
    [...questionWords, ...answerWords].forEach(w => this.vocabulary.add(w));

    // Learn Q&A format
    this.learnPattern('trivia_qa', `${trivia.question} = ${trivia.correct_answer}`);

    // Log to HCS
    await this.logToHCS(LEARNING_TOPICS.KNOWLEDGE, triviaItem);
    
    console.log(`✅ Learned trivia [${trivia.category}]:`);
    console.log(`   Q: ${trivia.question}`);
    console.log(`   A: ${trivia.correct_answer}`);
    
    this.sessionStats.learned++;
    return triviaItem;
  }

  // Learn vocabulary words
  async learnVocabulary() {
    console.log('📖 Fetching new vocabulary...');
    const data = await this.fetchContent('words');
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log('⚠️ No words retrieved');
      return null;
    }

    const word = data[0];
    
    const vocabItem = {
      type: 'vocabulary',
      word: word,
      length: word.length,
      source: 'random-word-api',
      timestamp: Date.now(),
      id: `vocab-${Date.now()}`
    };

    // Add to vocabulary
    this.vocabulary.add(word.toLowerCase());

    // Log to HCS
    await this.logToHCS(LEARNING_TOPICS.VOCABULARY, vocabItem);
    
    console.log(`✅ Learned word: "${word}" (${word.length} letters)`);
    
    this.sessionStats.learned++;
    return vocabItem;
  }

  // Extract words from text
  extractWords(text) {
    if (!text) return [];
    
    // Clean and split
    const words = text
      .toLowerCase()
      .replace(/[^a-zA-Z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3) // Only words 3+ chars
      .filter(w => !this.isCommonWord(w)); // Filter common words
    
    return [...new Set(words)];
  }

  // Common words to filter
  isCommonWord(word) {
    const common = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
      'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
      'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did',
      'she', 'use', 'her', 'way', 'many', 'oil', 'sit', 'set', 'run', 'eat',
      'far', 'sea', 'eye', 'ask', 'own', 'say', 'too', 'any', 'try', 'let',
      'put', 'end', 'why', 'turn', 'here', 'show', 'every', 'good', 'would',
      'there', 'their', 'what', 'said', 'each', 'which', 'will', 'about',
      'could', 'other', 'after', 'first', 'never', 'these', 'think', 'where',
      'being', 'every', 'great', 'might', 'shall', 'still', 'those', 'while',
      'this', 'that', 'with', 'from', 'they', 'have', 'were', 'been', 'call',
      'come', 'make', 'find', 'work', 'life', 'only', 'over', 'know', 'take',
      'year', 'live', 'back', 'give', 'most', 'very', 'when', 'much', 'want',
      'well', 'also', 'just', 'look', 'time', 'than', 'them', 'some', 'into',
      'look', 'more', 'long', 'part', 'hand', 'head', 'help', 'home', 'side',
      'both', 'five', 'once', 'same', 'such', 'made', 'name', 'read', 'each',
      'done', 'open', 'case', 'show', 'live', 'play', 'went', 'told', 'seen',
      'feel', 'keep', 'seem', 'turn', 'hand', 'sure', 'upon', 'move', 'both'
    ]);
    return common.has(word);
  }

  // Learn a pattern
  learnPattern(type, example) {
    if (!this.patterns.has(type)) {
      this.patterns.set(type, []);
    }
    
    const patterns = this.patterns.get(type);
    patterns.push({
      example,
      timestamp: Date.now(),
      count: (patterns.find(p => p.example === example)?.count || 0) + 1
    });
    
    // Log pattern to HCS
    this.logToHCS(LEARNING_TOPICS.PATTERNS, {
      type: 'pattern',
      pattern_type: type,
      example: example.substring(0, 200),
      timestamp: Date.now()
    });
  }

  // Log to HCS
  async logToHCS(topic, data) {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(topic)
        .setMessage(JSON.stringify(data));
      
      await tx.execute(this.client);
      this.sessionStats.logged++;
    } catch (e) {
      console.error(`❌ HCS log failed: ${e.message}`);
    }
  }

  // Save local cache
  saveLocalCache() {
    const cache = {
      vocabulary: Array.from(this.vocabulary),
      patterns: Array.from(this.patterns.entries()),
      stats: this.sessionStats,
      saved: Date.now()
    };
    
    try {
      fs.writeFileSync('data/vera-language-cache.json', JSON.stringify(cache, null, 2));
    } catch (e) {
      // Silent fail
    }
  }

  // Load local cache
  loadLocalCache() {
    try {
      if (fs.existsSync('data/vera-language-cache.json')) {
        const cache = JSON.parse(fs.readFileSync('data/vera-language-cache.json', 'utf8'));
        this.vocabulary = new Set(cache.vocabulary || []);
        this.patterns = new Map(cache.patterns || []);
        console.log(`📚 Loaded ${this.vocabulary.size} words from cache`);
      }
    } catch (e) {
      // Silent fail
    }
  }

  // Run learning session
  async learnSession(count = 5) {
    console.log(`\n🎓 Starting Learning Session (${count} items)\n`);
    
    const sources = ['facts', 'quotes', 'advice', 'jokes', 'trivia', 'vocabulary'];
    
    for (let i = 0; i < count; i++) {
      const source = sources[i % sources.length];
      
      switch(source) {
        case 'facts':
          await this.learnFromFacts();
          break;
        case 'quotes':
          await this.learnFromQuotes();
          break;
        case 'advice':
          await this.learnFromAdvice();
          break;
        case 'jokes':
          await this.learnFromJokes();
          break;
        case 'trivia':
          await this.learnFromTrivia();
          break;
        case 'vocabulary':
          await this.learnVocabulary();
          break;
      }
      
      // Small delay between requests
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Save cache
    this.saveLocalCache();
    
    // Display summary
    console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  📚 LEARNING SESSION COMPLETE                                 ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Items Fetched: ${this.sessionStats.fetched.toString().padEnd(3)}                                  ┃
┃  Items Learned: ${this.sessionStats.learned.toString().padEnd(3)}                                  ┃
┃  Items Logged to HCS: ${this.sessionStats.logged.toString().padEnd(3)}                            ┃
┃  Total Vocabulary: ${this.vocabulary.size.toString().padEnd(5)}                               ┃
┃  Patterns Learned: ${this.patterns.size.toString().padEnd(3)}                                  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
  }

  // Get learning stats
  getStats() {
    return {
      vocabulary: this.vocabulary.size,
      patterns: this.patterns.size,
      knowledge: this.knowledge.length,
      ...this.sessionStats
    };
  }

  // Close
  close() {
    this.saveLocalCache();
    this.client?.close();
  }
}

// Export
export { VeraLanguageLearner, FREE_SOURCES, LEARNING_TOPICS };

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const learner = new VeraLanguageLearner();
  
  learner.initialize().then(() => {
    // Learn 10 items
    learner.learnSession(10).then(() => {
      learner.close();
      console.log('✅ Learning complete!');
    });
  }).catch(console.error);
}
