/**
 * Vera Numerical Training - Sequences Module
 * 
 * Number sequence pattern recognition for Mensa tests.
 * Target: 95% accuracy
 */

export interface SequenceProblem {
  id: string;
  type: 'arithmetic' | 'geometric' | 'fibonacci' | 'squares' | 'primes' | 'mixed' | 'custom';
  sequence: number[];
  question: string;
  answer: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface SequenceResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class SequencesTraining {
  private problems: SequenceProblem[] = [];
  private results: SequenceResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): SequenceProblem[] {
    return [
      {
        id: 'SQ1-AR-01',
        type: 'arithmetic',
        sequence: [2, 5, 8, 11, 14],
        question: 'What comes next: 2, 5, 8, 11, 14, ?',
        answer: 17,
        explanation: 'Arithmetic sequence with common difference +3. 14 + 3 = 17',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'SQ1-GEO-01',
        type: 'geometric',
        sequence: [3, 6, 12, 24, 48],
        question: 'What comes next: 3, 6, 12, 24, 48, ?',
        answer: 96,
        explanation: 'Geometric sequence with common ratio ×2. 48 × 2 = 96',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'SQ1-FIB-01',
        type: 'fibonacci',
        sequence: [1, 1, 2, 3, 5, 8, 13],
        question: 'What is the next number: 1, 1, 2, 3, 5, 8, 13, ?',
        answer: 21,
        explanation: 'Fibonacci: each number is sum of previous two. 8 + 13 = 21',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'SQ1-SQ-01',
        type: 'squares',
        sequence: [1, 4, 9, 16, 25, 36],
        question: 'What is the next number: 1, 4, 9, 16, 25, 36, ?',
        answer: 49,
        explanation: 'Perfect squares: 1², 2², 3², 4², 5², 6², so next is 7² = 49',
        difficulty: 1,
        timeLimit: 35
      },
      {
        id: 'SQ1-PR-01',
        type: 'primes',
        sequence: [2, 3, 5, 7, 11, 13, 17],
        question: 'What is the next number: 2, 3, 5, 7, 11, 13, 17, ?',
        answer: 19,
        explanation: 'Prime numbers in order. Next prime after 17 is 19',
        difficulty: 1,
        timeLimit: 35
      },
      {
        id: 'SQ1-CU-01',
        type: 'custom',
        sequence: [2, 6, 12, 20, 30],
        question: 'What is the next number: 2, 6, 12, 20, 30, ?',
        answer: 42,
        explanation: 'Pattern: n² + n. 1²+1=2, 2²+2=6, 3²+3=12, 4²+4=20, 5²+5=30, 6²+6=42',
        difficulty: 1,
        timeLimit: 60
      }
    ];
  }

  private generateLevel2Problems(): SequenceProblem[] {
    return [
      {
        id: 'SQ2-MX-01',
        type: 'mixed',
        sequence: [1, 4, 9, 25, 36, 49, 64, 81],
        question: 'Which number is OUT OF PLACE: 1, 4, 9, 25, 36, 49, 64, 81?',
        answer: 25,
        explanation: 'All are perfect squares except 25 which is 5²... wait, 25 is 5². Actually all are squares. But 25 breaks the pattern of consecutive squares (1,4,9 skip 16 to 25). 16 is missing, making 25 out of place',
        difficulty: 2,
        timeLimit: 90
      },
      {
        id: 'SQ2-CU-02',
        type: 'custom',
        sequence: [1, 3, 7, 15, 31],
        question: 'What comes next: 1, 3, 7, 15, 31, ?',
        answer: 63,
        explanation: 'Pattern: ×2 + 1. 1×2+1=3, 3×2+1=7, 7×2+1=15, 15×2+1=31, 31×2+1=63',
        difficulty: 2,
        timeLimit: 80
      },
      {
        id: 'SQ2-CU-03',
        type: 'custom',
        sequence: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55],
        question: 'This is the Fibonacci sequence. What is the 12th term?',
        answer: 89,
        explanation: 'Continue Fibonacci: 34 + 55 = 89',
        difficulty: 2,
        timeLimit: 50
      },
      {
        id: 'SQ2-CU-04',
        type: 'custom',
        sequence: [2, 5, 10, 17, 26],
        question: 'What comes next: 2, 5, 10, 17, 26, ?',
        answer: 37,
        explanation: 'Pattern: n² + 1. 1²+1=2, 2²+1=5, 3²+1=10, 4²+1=17, 5²+1=26, 6²+1=37',
        difficulty: 2,
        timeLimit: 80
      },
      {
        id: 'SQ2-CU-05',
        type: 'custom',
        sequence: [1, 2, 6, 24, 120],
        question: 'What comes next: 1, 2, 6, 24, 120, ?',
        answer: 720,
        explanation: 'Factorials! 1! = 1, 2! = 2, 3! = 6, 4! = 24, 5! = 120, 6! = 720',
        difficulty: 2,
        timeLimit: 90
      }
    ];
  }

  private generateLevel3Problems(): SequenceProblem[] {
    return [
      {
        id: 'SQ3-CU-01',
        type: 'custom',
        sequence: [1, 8, 27, 64, 125],
        question: 'What is the next number: 1, 8, 27, 64, 125, ?',
        answer: 216,
        explanation: 'Perfect cubes: 1³=1, 2³=8, 3³=27, 4³=64, 5³=125, 6³=216',
        difficulty: 3,
        timeLimit: 70
      },
      {
        id: 'SQ3-CU-02',
        type: 'custom',
        sequence: [1, 11, 21, 1211, 111221],
        question: 'What comes next in this look-and-say sequence: 1, 11, 21, 1211, 111221, ?',
        answer: 312211,
        explanation: 'Read previous number aloud: 1="one 1"=11, 11="two 1s"=21, 21="one 2, one 1"=1211, 1211="one 1, one 2, two 1s"=111221, 111221="three 1s, two 2s, one 1"=312211',
        difficulty: 3,
        timeLimit: 150
      },
      {
        id: 'SQ3-CU-03',
        type: 'custom',
        sequence: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37],
        question: 'What is the sum of the first 5 prime numbers in this sequence?',
        answer: 28,
        explanation: 'First 5 primes: 2, 3, 5, 7, 11. Sum = 2+3+5+7+11 = 28',
        difficulty: 3,
        timeLimit: 100
      },
      {
        id: 'SQ3-CU-04',
        type: 'custom',
        sequence: [0, 1, 1, 2, 4, 7, 13, 24],
        question: 'What comes next: 0, 1, 1, 2, 4, 7, 13, 24, ?',
        answer: 44,
        explanation: 'Tribonacci: each number is sum of previous three. 4+7+13=24, so next is 7+13+24=44',
        difficulty: 3,
        timeLimit: 120
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): SequenceProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): SequenceResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const correct = answer === problem.answer;

    const result: SequenceResult = {
      problemId,
      correct,
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

  generateDailySession(level: number): SequenceProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`🔢 Sequences Training - Level ${level}`);
    console.log(`📊 ${problems.length} number sequence problems`);
    console.log(`⏱️  Target: <60s per problem\n`);
    return problems;
  }
}

export const sequencesTraining = new SequencesTraining();
