/**
 * Vera Verbal Training - Vocabulary Module
 * 
 * Word opposites, synonyms, and definitions for Mensa verbal reasoning.
 * Target: 85% accuracy
 */

export interface VocabularyProblem {
  id: string;
  type: 'opposites' | 'synonyms' | 'definitions' | 'word_usage';
  word: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface VocabularyResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class VocabularyTraining {
  private problems: VocabularyProblem[] = [];
  private results: VocabularyResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): VocabularyProblem[] {
    return [
      {
        id: 'V1-OP-01',
        type: 'opposites',
        word: 'hot',
        question: 'What is the opposite of HOT?',
        options: ['warm', 'cold', 'cool', 'boiling'],
        correct: 1,
        explanation: 'Cold is the direct opposite of hot',
        difficulty: 1,
        timeLimit: 20
      },
      {
        id: 'V1-OP-02',
        type: 'opposites',
        word: 'begin',
        question: 'What is the opposite of BEGIN?',
        options: ['start', 'commence', 'end', 'continue'],
        correct: 2,
        explanation: 'End is the opposite of begin',
        difficulty: 1,
        timeLimit: 20
      },
      {
        id: 'V1-SY-01',
        type: 'synonyms',
        word: 'happy',
        question: 'Which word means the same as HAPPY?',
        options: ['sad', 'joyful', 'angry', 'tired'],
        correct: 1,
        explanation: 'Joyful is a synonym for happy',
        difficulty: 1,
        timeLimit: 25
      },
      {
        id: 'V1-DE-01',
        type: 'definitions',
        word: 'cautious',
        question: 'What does CAUTIOUS mean?',
        options: ['brave', 'careful', 'fast', 'loud'],
        correct: 1,
        explanation: 'Cautious means careful and avoiding risks',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'V1-OP-03',
        type: 'opposites',
        word: 'increase',
        question: 'What is the opposite of INCREASE?',
        options: ['grow', 'decrease', 'rise', 'expand'],
        correct: 1,
        explanation: 'Decrease is the opposite of increase',
        difficulty: 1,
        timeLimit: 20
      },
      {
        id: 'V1-SY-02',
        type: 'synonyms',
        word: 'rapid',
        question: 'Which word means the same as RAPID?',
        options: ['slow', 'quick', 'steady', 'gradual'],
        correct: 1,
        explanation: 'Quick is a synonym for rapid',
        difficulty: 1,
        timeLimit: 25
      }
    ];
  }

  private generateLevel2Problems(): VocabularyProblem[] {
    return [
      {
        id: 'V2-OP-04',
        type: 'opposites',
        word: 'dearth',
        question: 'If "dearth" means scarcity, what does "plethora" mean?',
        options: ['lack', 'scarcity', 'abundance', 'shortage'],
        correct: 2,
        explanation: 'Plethora means abundance, the opposite of scarcity (dearth)',
        difficulty: 2,
        timeLimit: 50
      },
      {
        id: 'V2-OP-05',
        type: 'opposites',
        word: 'ephemeral',
        question: 'Which word is the odd one out: ephemeral, transient, permanent, fleeting?',
        options: ['ephemeral', 'transient', 'permanent', 'fleeting'],
        correct: 2,
        explanation: 'Ephemeral, transient, and fleeting all mean temporary. Permanent means lasting forever',
        difficulty: 2,
        timeLimit: 60
      },
      {
        id: 'V2-DE-02',
        type: 'definitions',
        word: 'ambiguous',
        question: 'What does AMBIGUOUS mean?',
        options: ['clear', 'uncertain', 'simple', 'direct'],
        correct: 1,
        explanation: 'Ambiguous means having multiple possible meanings; uncertain or unclear',
        difficulty: 2,
        timeLimit: 45
      },
      {
        id: 'V2-SY-03',
        type: 'synonyms',
        word: 'prudent',
        question: 'Which word means the same as PRUDENT?',
        options: ['reckless', 'careless', 'wise', 'hasty'],
        correct: 2,
        explanation: 'Prudent means acting with care and thought for the future; wise and careful',
        difficulty: 2,
        timeLimit: 50
      },
      {
        id: 'V2-OP-06',
        type: 'opposites',
        word: 'generous',
        question: 'What is the opposite of GENEROUS?',
        options: ['kind', 'stingy', 'giving', 'helpful'],
        correct: 1,
        explanation: 'Stingy means unwilling to give or spend; the opposite of generous',
        difficulty: 2,
        timeLimit: 40
      },
      {
        id: 'V2-DE-03',
        type: 'definitions',
        word: 'benevolent',
        question: 'What does BENEVOLENT mean?',
        options: ['evil', 'kind', 'angry', 'selfish'],
        correct: 1,
        explanation: 'Benevolent means well-meaning and kindly; doing good',
        difficulty: 2,
        timeLimit: 50
      }
    ];
  }

  private generateLevel3Problems(): VocabularyProblem[] {
    return [
      {
        id: 'V3-DE-04',
        type: 'definitions',
        word: 'esoteric',
        question: 'What does ESOTERIC mean?',
        options: ['common', 'widely known', 'understood by few', 'simple'],
        correct: 2,
        explanation: 'Esoteric means intended for or likely to be understood by only a small number of people with specialized knowledge',
        difficulty: 3,
        timeLimit: 70
      },
      {
        id: 'V3-OP-07',
        type: 'opposites',
        word: 'belligerent',
        question: 'What is the opposite of BELLIGERENT?',
        options: ['aggressive', 'hostile', 'peaceful', 'angry'],
        correct: 2,
        explanation: 'Belligerent means hostile and aggressive; peaceful is its opposite',
        difficulty: 3,
        timeLimit: 80
      },
      {
        id: 'V3-SY-04',
        type: 'synonyms',
        word: 'ubiquitous',
        question: 'Which word means the same as UBIQUITOUS?',
        options: ['rare', 'omnipresent', 'scarce', 'hidden'],
        correct: 1,
        explanation: 'Ubiquitous means present, appearing, or found everywhere; omnipresent',
        difficulty: 3,
        timeLimit: 80
      },
      {
        id: 'V3-DE-05',
        type: 'definitions',
        word: 'pragmatic',
        question: 'What does PRAGMATIC mean?',
        options: ['idealistic', 'theoretical', 'practical', 'imaginative'],
        correct: 2,
        explanation: 'Pragmatic means dealing with things sensibly and realistically; practical',
        difficulty: 3,
        timeLimit: 70
      },
      {
        id: 'V3-OP-08',
        type: 'opposites',
        word: 'verbose',
        question: 'What is the opposite of VERBOSE?',
        options: ['wordy', 'concise', 'talkative', 'lengthy'],
        correct: 1,
        explanation: 'Verbose means using more words than needed; concise (brief) is the opposite',
        difficulty: 3,
        timeLimit: 70
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): VocabularyProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): VocabularyResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const result: VocabularyResult = {
      problemId,
      correct: answer === problem.correct,
      answer,
      timeTaken
    };

    this.results.push(result);
    return result;
  }

  getAccuracyForLevel(level: number): number {
    const levelProblems = this.problems.filter(p => p.difficulty === level).map(p => p.id);
    const levelResults = this.results.filter(r => levelProblems.includes(r.problemId));
    
    if (levelResults.length === 0) return 0;
    return (levelResults.filter(r => r.correct).length / levelResults.length) * 100;
  }

  getOverallAccuracy(): number {
    if (this.results.length === 0) return 0;
    return (this.results.filter(r => r.correct).length / this.results.length) * 100;
  }

  getProgressSummary(): {
    totalProblems: number;
    attempted: number;
    correct: number;
    accuracy: number;
    byLevel: Record<number, number>;
  } {
    const byLevel: Record<number, number> = {};
    for (let i = 1; i <= 3; i++) {
      byLevel[i] = this.getAccuracyForLevel(i);
    }

    return {
      totalProblems: this.problems.length,
      attempted: this.results.length,
      correct: this.results.filter(r => r.correct).length,
      accuracy: this.getOverallAccuracy(),
      byLevel
    };
  }

  generateDailySession(level: number): VocabularyProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`📚 Vocabulary Training - Level ${level}`);
    console.log(`🗣️  ${problems.length} vocabulary problems`);
    console.log(`⏱️  Target: <50s per problem\n`);
    return problems;
  }
}

export const vocabularyTraining = new VocabularyTraining();
