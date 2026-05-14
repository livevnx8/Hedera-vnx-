/**
 * Natural Language Enhancement System for Vera
 * 
 * Improves conversational abilities, creativity, and natural language
 * processing to close the gap with general AI systems.
 */

import { enhancedContext } from './enhanced-context.js';
import { generalKnowledge } from './general-knowledge.js';
import { logger } from '../monitoring/logger.js';

export interface ConversationStyle {
  formality: 'formal' | 'casual' | 'professional' | 'friendly';
  creativity: number; // 0-1 scale
  verbosity: 'concise' | 'balanced' | 'detailed';
  empathy: number; // 0-1 scale
  humor: number; // 0-1 scale
  personality: string;
}

export interface NLPEnhancement {
  style: ConversationStyle;
  vocabulary: 'basic' | 'intermediate' | 'advanced' | 'expert';
  tone: 'neutral' | 'enthusiastic' | 'empathetic' | 'analytical' | 'creative';
  culturalContext: string[];
  linguisticPatterns: string[];
}

export interface CreativeResponse {
  original: string;
  enhanced: string;
  creativity: number;
  naturalness: number;
  appropriateness: number;
  techniques: string[];
}

export interface ConversationalFlow {
  context: string;
  userIntent: string;
  emotionalState: string;
  followUpQuestions: string[];
  transitionPhrases: string[];
  engagementLevel: number;
}

export class NaturalLanguageEnhancer {
  private contextManager = enhancedContext;
  private knowledgeSystem = generalKnowledge;
  private defaultStyle: ConversationStyle;
  private vocabularyCache: Map<string, string[]> = new Map();
  private culturalPatterns: Map<string, string[]> = new Map();

  constructor() {
    this.defaultStyle = {
      formality: 'professional',
      creativity: 0.7,
      verbosity: 'balanced',
      empathy: 0.8,
      humor: 0.3,
      personality: 'helpful, intelligent, and approachable'
    };

    this.initializeVocabulary();
    this.initializeCulturalPatterns();
  }

  // Enhance response for natural conversation
  async enhanceResponse(response: string, context?: string): Promise<CreativeResponse> {
    try {
      // Analyze original response
      const analysis = this.analyzeResponse(response);
      
      // Apply enhancement techniques
      const enhanced = await this.applyEnhancements(response, analysis, context);
      
      // Calculate metrics
      const creativity = this.calculateCreativity(enhanced);
      const naturalness = this.calculateNaturalness(enhanced);
      const appropriateness = this.calculateAppropriateness(enhanced, context);
      
      const result: CreativeResponse = {
        original: response,
        enhanced,
        creativity,
        naturalness,
        appropriateness,
        techniques: analysis.techniques
      };

      logger.debug('Response enhanced', { 
        originalLength: response.length,
        enhancedLength: enhanced.length,
        creativity,
        naturalness
      });

      return result;

    } catch (error) {
      logger.error('Error enhancing response', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        original: response,
        enhanced: response,
        creativity: 0.5,
        naturalness: 0.5,
        appropriateness: 0.5,
        techniques: []
      };
    }
  }

  // Generate conversational flow
  async generateConversationalFlow(userMessage: string, conversationHistory: string[]): Promise<ConversationalFlow> {
    try {
      // Analyze user intent
      const userIntent = this.analyzeUserIntent(userMessage);
      
      // Detect emotional state
      const emotionalState = this.detectEmotionalState(userMessage, conversationHistory);
      
      // Generate context
      const context = this.generateContext(userMessage, conversationHistory);
      
      // Create follow-up questions
      const followUpQuestions = this.generateFollowUpQuestions(userIntent, context);
      
      // Generate transition phrases
      const transitionPhrases = this.generateTransitionPhrases(emotionalState, userIntent);
      
      // Calculate engagement level
      const engagementLevel = this.calculateEngagementLevel(userMessage, conversationHistory);

      return {
        context,
        userIntent,
        emotionalState,
        followUpQuestions,
        transitionPhrases,
        engagementLevel
      };

    } catch (error) {
      logger.error('Error generating conversational flow', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        context: 'General conversation',
        userIntent: 'general_inquiry',
        emotionalState: 'neutral',
        followUpQuestions: [],
        transitionPhrases: [],
        engagementLevel: 0.5
      };
    }
  }

  // Add personality and creativity to responses
  async addPersonality(content: string, style?: Partial<ConversationStyle>): Promise<string> {
    const targetStyle = { ...this.defaultStyle, ...style };
    
    let enhanced = content;
    
    // Adjust formality
    enhanced = this.adjustFormality(enhanced, targetStyle.formality);
    
    // Add creative elements
    if (targetStyle.creativity > 0.5) {
      enhanced = await this.addCreativeElements(enhanced, targetStyle.creativity);
    }
    
    // Add empathy
    if (targetStyle.empathy > 0.5) {
      enhanced = this.addEmpathy(enhanced, targetStyle.empathy);
    }
    
    // Add appropriate humor
    if (targetStyle.humor > 0.3) {
      enhanced = this.addAppropriateHumor(enhanced, targetStyle.humor);
    }
    
    // Adjust verbosity
    enhanced = this.adjustVerbosity(enhanced, targetStyle.verbosity);
    
    return enhanced;
  }

  // Generate creative analogies and metaphors
  generateCreativeAnalogies(concept: string, context?: string): string[] {
    const analogies: string[] = [];
    
    // Technology analogies
    const techAnalogies = [
      `It's like a digital Swiss Army knife - versatile and reliable`,
      `Think of it as the GPS for your project - it guides you to your destination`,
      `It's similar to a well-organized library - everything has its place and purpose`,
      `Consider it like a personal trainer for your goals - it keeps you on track`
    ];
    
    // Nature analogies
    const natureAnalogies = [
      `It grows like a tree - starting small and branching out over time`,
      `It flows like water - finding the path of least resistance`,
      `It's like a garden - needs careful cultivation to flourish`,
      `Think of it as a forest ecosystem - everything interconnected`
    ];
    
    // Business analogies
    const businessAnalogies = [
      `It's like having a co-pilot for your journey - sharing the workload`,
      `Think of it as a Swiss bank account - secure and efficient`,
      `It's similar to a personal concierge service - anticipating your needs`,
      `Consider it like a well-oiled machine - running smoothly and efficiently`
    ];
    
    // Select relevant analogies based on context
    if (context?.toLowerCase().includes('technology') || concept.toLowerCase().includes('tech')) {
      analogies.push(...techAnalogies.slice(0, 2));
    } else if (context?.toLowerCase().includes('nature') || concept.toLowerCase().includes('grow')) {
      analogies.push(...natureAnalogies.slice(0, 2));
    } else if (context?.toLowerCase().includes('business') || concept.toLowerCase().includes('efficient')) {
      analogies.push(...businessAnalogies.slice(0, 2));
    } else {
      // Mix of all types
      analogies.push(
        techAnalogies[0],
        natureAnalogies[1],
        businessAnalogies[2]
      );
    }
    
    return analogies;
  }

  // Private helper methods
  private analyzeResponse(response: string): {
    techniques: string[];
    style: ConversationStyle;
    improvements: string[];
  } {
    const techniques: string[] = [];
    const improvements: string[] = [];
    
    // Detect current techniques
    if (response.includes('like') || response.includes('similar to')) {
      techniques.push('analogy');
    }
    
    if (response.includes('imagine') || response.includes('picture this')) {
      techniques.push('visualization');
    }
    
    if (response.includes('step by step') || response.includes('first, then')) {
      techniques.push('process_explanation');
    }
    
    // Identify improvements
    if (response.length < 50) {
      improvements.push('add_more_detail');
    }
    
    if (!response.includes('?') && !response.includes('!')) {
      improvements.push('add_engagement');
    }
    
    if (response.split(/\s+/).length < 10) {
      improvements.push('expand_vocabulary');
    }

    return {
      techniques,
      style: this.defaultStyle,
      improvements
    };
  }

  private async applyEnhancements(response: string, analysis: any, context?: string): Promise<string> {
    let enhanced = response;
    
    // Apply improvements
    for (const improvement of analysis.improvements) {
      switch (improvement) {
        case 'add_more_detail':
          enhanced = this.addMoreDetail(enhanced, context);
          break;
        case 'add_engagement':
          enhanced = this.addEngagement(enhanced);
          break;
        case 'expand_vocabulary':
          enhanced = this.expandVocabulary(enhanced);
          break;
      }
    }
    
    // Add creative elements
    enhanced = this.addCreativeElements(enhanced, this.defaultStyle.creativity);
    
    return enhanced;
  }

  private addMoreDetail(response: string, context?: string): string {
    // Add contextual details
    const detailPhrases = [
      'To give you more context, ',
      'Let me elaborate on that. ',
      'It\'s worth noting that ',
      'What\'s interesting is that ',
      'Building on this, '
    ];
    
    const randomPhrase = detailPhrases[Math.floor(Math.random() * detailPhrases.length)];
    
    return randomPhrase + response;
  }

  private addEngagement(response: string): string {
    // Add engaging elements
    const engagementElements = [
      'Isn\'t that fascinating?',
      'What are your thoughts on this?',
      'Does this make sense so far?',
      'Let me know if you\'d like me to dive deeper into any aspect.',
      'How does this align with what you were expecting?'
    ];
    
    const randomElement = engagementElements[Math.floor(Math.random() * engagementElements.length)];
    
    return response + ' ' + randomElement;
  }

  private expandVocabulary(response: string): string {
    // Simple vocabulary expansion
    const expansions: Record<string, string> = {
      'good': 'excellent',
      'bad': 'problematic',
      'big': 'substantial',
      'small': 'minimal',
      'fast': 'efficient',
      'slow': 'gradual',
      'easy': 'straightforward',
      'hard': 'challenging'
    };
    
    let expanded = response;
    for (const [simple, advanced] of Object.entries(expansions)) {
      expanded = expanded.replace(new RegExp(`\\b${simple}\\b`, 'gi'), advanced);
    }
    
    return expanded;
  }

  private addCreativeElements(content: string, creativity: number): string {
    if (creativity < 0.3) return content;
    
    // Add creative analogies
    const analogies = this.generateCreativeAnalogies(content.substring(0, 50));
    if (analogies.length > 0 && Math.random() < creativity) {
      const randomAnalogy = analogies[Math.floor(Math.random() * analogies.length)];
      content = content + ' ' + randomAnalogy;
    }
    
    // Add rhetorical questions
    if (Math.random() < creativity * 0.5) {
      const rhetoricalQuestions = [
        'Have you ever considered how this might apply to your situation?',
        'What if we looked at this from a different angle?',
        'Could this change the way you think about the problem?'
      ];
      
      const randomQuestion = rhetoricalQuestions[Math.floor(Math.random() * rhetoricalQuestions.length)];
      content = content + ' ' + randomQuestion;
    }
    
    return content;
  }

  private adjustFormality(content: string, formality: ConversationStyle['formality']): string {
    switch (formality) {
      case 'formal':
        return this.makeFormal(content);
      case 'casual':
        return this.makeCasual(content);
      case 'friendly':
        return this.makeFriendly(content);
      case 'professional':
      default:
        return this.makeProfessional(content);
    }
  }

  private makeFormal(content: string): string {
    const formalReplacements: Record<string, string> = {
      "don't": "do not",
      "won't": "will not",
      "can't": "cannot",
      "it's": "it is",
      "that's": "that is",
      "you're": "you are",
      "we're": "we are",
      "they're": "they are",
      "I'm": "I am",
      "let's": "let us",
      "kind of": "somewhat",
      "sort of": "relatively",
      "really": "indeed",
      "very": "quite"
    };
    
    let formalContent = content;
    for (const [informal, formalWord] of Object.entries(formalReplacements)) {
      formalContent = formalContent.replace(new RegExp(informal, 'gi'), formalWord);
    }
    
    return formalContent;
  }

  private makeCasual(content: string): string {
    const casualReplacements: Record<string, string> = {
      "therefore": "so",
      "consequently": "so",
      "furthermore": "plus",
      "however": "but",
      "nevertheless": "still",
      "additionally": "also",
      "utilize": "use",
      "assist": "help",
      "demonstrate": "show",
      "indicate": "show"
    };
    
    let casualContent = content;
    for (const [formalWord, casualWord] of Object.entries(casualReplacements)) {
      casualContent = casualContent.replace(new RegExp(formalWord, 'gi'), casualWord);
    }
    
    return casualContent;
  }

  private makeFriendly(content: string): string {
    // Add friendly elements
    const friendlyPhrases = [
      "I'd be happy to help you with that!",
      "That's a great question!",
      "Let me walk you through this.",
      "I think you'll find this really helpful.",
      "Feel free to ask if anything is unclear."
    ];
    
    const randomPhrase = friendlyPhrases[Math.floor(Math.random() * friendlyPhrases.length)];
    
    return randomPhrase + ' ' + content;
  }

  private makeProfessional(content: string): string {
    // Balance between formal and casual
    return content;
  }

  private addEmpathy(content: string, empathy: number): string {
    if (empathy < 0.5) return content;
    
    const empatheticPhrases = [
      "I understand this might be challenging.",
      "I can see why this is important to you.",
      "Your perspective is valuable here.",
      "I appreciate you sharing this with me.",
      "This sounds like it matters to you."
    ];
    
    const randomPhrase = empatheticPhrases[Math.floor(Math.random() * empatheticPhrases.length)];
    
    return randomPhrase + ' ' + content;
  }

  private addAppropriateHumor(content: string, humor: number): string {
    if (humor < 0.3) return content;
    
    const lightHumor = [
      "This is almost as exciting as watching paint dry, but I promise it's more useful!",
      "If this were any more straightforward, it would be a ruler!",
      "Don't worry, this won't be as complicated as my last relationship.",
      "This is so clear, even my cat could understand it!"
    ];
    
    const randomHumor = lightHumor[Math.floor(Math.random() * lightHumor.length)];
    
    return content + ' ' + randomHumor;
  }

  private adjustVerbosity(content: string, verbosity: 'concise' | 'balanced' | 'detailed'): string {
    switch (verbosity) {
      case 'concise':
        return this.makeConcise(content);
      case 'detailed':
        return this.makeDetailed(content);
      case 'balanced':
      default:
        return content;
    }
  }

  private makeConcise(content: string): string {
    // Remove redundant words and phrases
    const redundantPhrases = [
      "in order to",
      "due to the fact that",
      "for the purpose of",
      "in the event that",
      "it is important to note that"
    ];
    
    let concise = content;
    for (const phrase of redundantPhrases) {
      concise = concise.replace(new RegExp(phrase, 'gi'), '');
    }
    
    return concise.trim();
  }

  private makeDetailed(content: string): string {
    // Add explanatory details
    const detailAdditions = [
      "To provide more context, ",
      "It's helpful to understand that ",
      "What this means in practice is ",
      "The key insight here is ",
      "Building on this foundation, "
    ];
    
    const randomAddition = detailAdditions[Math.floor(Math.random() * detailAdditions.length)];
    
    return randomAddition + content;
  }

  private calculateCreativity(content: string): number {
    // Simple creativity calculation based on variety of elements
    let creativityScore = 0.5; // Base score
    
    // Check for analogies
    if (content.includes('like') || content.includes('similar to')) {
      creativityScore += 0.1;
    }
    
    // Check for rhetorical questions
    if (content.match(/\?[^?]*\?/)) {
      creativityScore += 0.1;
    }
    
    // Check for varied vocabulary
    const words = content.split(/\s+/);
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const vocabularyDiversity = uniqueWords.size / words.length;
    creativityScore += vocabularyDiversity * 0.2;
    
    return Math.min(1, creativityScore);
  }

  private calculateNaturalness(content: string): number {
    // Naturalness based on conversational patterns
    let naturalnessScore = 0.5; // Base score
    
    // Check for contractions
    if (content.match(/\b\w+'s\b/)) {
      naturalnessScore += 0.1;
    }
    
    // Check for conversational phrases
    const conversationalPhrases = [
      "let me", "I think", "you might", "we can", "feel free"
    ];
    
    for (const phrase of conversationalPhrases) {
      if (content.toLowerCase().includes(phrase)) {
        naturalnessScore += 0.05;
      }
    }
    
    return Math.min(1, naturalnessScore);
  }

  private calculateAppropriateness(content: string, context?: string): number {
    // Appropriateness based on context relevance and tone
    let appropriatenessScore = 0.7; // Base score
    
    // Check for professional language
    const professionalLanguage = content.match(/\b(formal|professional|appropriate|suitable)\b/gi);
    if (professionalLanguage) {
      appropriatenessScore += 0.1;
    }
    
    // Check for inappropriate content (simple check)
    const inappropriateWords = ['damn', 'hell', 'stupid', 'idiot'];
    const hasInappropriate = inappropriateWords.some(word => 
      content.toLowerCase().includes(word)
    );
    
    if (hasInappropriate) {
      appropriatenessScore -= 0.3;
    }
    
    return Math.max(0, Math.min(1, appropriatenessScore));
  }

  private analyzeUserIntent(message: string): string {
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes('help') || messageLower.includes('how to')) {
      return 'seeking_help';
    } else if (messageLower.includes('what') || messageLower.includes('explain')) {
      return 'information_seeking';
    } else if (messageLower.includes('why') || messageLower.includes('reason')) {
      return 'understanding_causality';
    } else if (messageLower.includes('can you') || messageLower.includes('would you')) {
      return 'capability_inquiry';
    } else if (messageLower.includes('thank') || messageLower.includes('appreciate')) {
      return 'expressing_gratitude';
    } else {
      return 'general_inquiry';
    }
  }

  private detectEmotionalState(message: string, history: string[]): string {
    const messageLower = message.toLowerCase();
    
    // Positive emotions
    const positiveWords = ['happy', 'excited', 'great', 'wonderful', 'amazing', 'love', 'fantastic'];
    const hasPositive = positiveWords.some(word => messageLower.includes(word));
    
    // Negative emotions
    const negativeWords = ['sad', 'frustrated', 'angry', 'worried', 'confused', 'stuck', 'lost'];
    const hasNegative = negativeWords.some(word => messageLower.includes(word));
    
    // Questioning emotions
    const questioningWords = ['why', 'how', 'what if', 'uncertain', 'confused'];
    const hasQuestioning = questioningWords.some(word => messageLower.includes(word));
    
    if (hasPositive) return 'positive';
    if (hasNegative) return 'negative';
    if (hasQuestioning) return 'questioning';
    
    return 'neutral';
  }

  private generateContext(message: string, history: string[]): string {
    const recentHistory = history.slice(-3).join(' ');
    return `${recentHistory} ${message}`;
  }

  private generateFollowUpQuestions(intent: string, context: string): string[] {
    const questions: string[] = [];
    
    switch (intent) {
      case 'seeking_help':
        questions.push(
          "What specific aspect would you like me to focus on?",
          "Have you tried any solutions already?",
          "What would success look like for you?"
        );
        break;
      case 'information_seeking':
        questions.push(
          "Would you like more details on any particular aspect?",
          "How does this relate to your situation?",
          "What's most important for you to understand?"
        );
        break;
      case 'understanding_causality':
        questions.push(
          "What factors do you think might be involved?",
          "Have you noticed any patterns?",
          "What would you like to explore further?"
        );
        break;
      default:
        questions.push(
          "Is there anything specific you'd like to know?",
          "How can I help you better understand this?",
          "What's most relevant to your needs?"
        );
    }
    
    return questions.slice(0, 2); // Return top 2 questions
  }

  private generateTransitionPhrases(emotionalState: string, intent: string): string[] {
    const phrases: string[] = [];
    
    if (emotionalState === 'positive') {
      phrases.push(
        "That's great to hear! ",
        "I'm excited to help you with this. ",
        "Wonderful! Let's explore this together. "
      );
    } else if (emotionalState === 'negative') {
      phrases.push(
        "I understand this might be challenging. ",
        "Let's work through this together. ",
        "I'm here to help you find a solution. "
      );
    } else {
      phrases.push(
        "Let me help you with that. ",
        "That's an interesting question. ",
        "I'd be happy to assist you. "
      );
    }
    
    return phrases;
  }

  private calculateEngagementLevel(message: string, history: string[]): number {
    let engagement = 0.5; // Base engagement
    
    // Message length indicates engagement
    const messageLength = message.split(/\s+/).length;
    if (messageLength > 10) engagement += 0.1;
    if (messageLength > 20) engagement += 0.1;
    
    // Question marks indicate engagement
    const questionMarks = (message.match(/\?/g) || []).length;
    engagement += Math.min(0.2, questionMarks * 0.1);
    
    // Exclamation marks indicate engagement
    const exclamationMarks = (message.match(/!/g) || []).length;
    engagement += Math.min(0.1, exclamationMarks * 0.05);
    
    return Math.min(1, engagement);
  }

  private initializeVocabulary(): void {
    // Initialize vocabulary cache
    const vocabCategories = {
      'technology': ['algorithm', 'interface', 'framework', 'architecture', 'optimization'],
      'business': ['synergy', 'leverage', 'paradigm', 'methodology', 'strategic'],
      'science': ['hypothesis', 'empirical', 'methodology', 'analysis', 'synthesis'],
      'general': ['comprehensive', 'facilitate', 'implement', 'optimize', 'enhance']
    };
    
    for (const [category, words] of Object.entries(vocabCategories)) {
      this.vocabularyCache.set(category, words);
    }
  }

  private initializeCulturalPatterns(): void {
    // Initialize cultural communication patterns
    const patterns = {
      'western': ['direct', 'time_oriented', 'individualistic', 'low_context'],
      'eastern': ['indirect', 'relationship_oriented', 'collectivistic', 'high_context'],
      'professional': ['formal', 'structured', 'goal_oriented', 'efficiency_focused'],
      'casual': ['informal', 'flexible', 'relationship_focused', 'comfortable']
    };
    
    for (const [culture, patternList] of Object.entries(patterns)) {
      this.culturalPatterns.set(culture, patternList);
    }
  }
}

// Export singleton instance
export const naturalLanguageEnhancer = new NaturalLanguageEnhancer();
