/**
 * Vera Numerical Training - Percentages Module
 * 
 * Quick percentage calculations for Mensa numerical reasoning.
 * Target: 95% accuracy, <30s per problem
 */

export interface PercentageProblem {
  id: string;
  type: 'find_percentage' | 'find_original' | 'percentage_change' | 'combined_percentage';
  question: string;
  given: { value?: number; percentage?: number; original?: number; newValue?: number };
  answer: number;
  unit: string;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface PercentageResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class PercentagesTraining {
  private problems: PercentageProblem[] = [];
  private results: PercentageResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): PercentageProblem[] {
    return [
      {
        id: 'P1-FP-01',
        type: 'find_percentage',
        question: 'What is 15% of 200?',
        given: { percentage: 15, value: 200 },
        answer: 30,
        unit: '',
        explanation: '15% of 200 = 0.15 × 200 = 30',
        difficulty: 1,
        timeLimit: 20
      },
      {
        id: 'P1-FP-02',
        type: 'find_percentage',
        question: 'What is 25% of 80?',
        given: { percentage: 25, value: 80 },
        answer: 20,
        unit: '',
        explanation: '25% of 80 = 0.25 × 80 = 20',
        difficulty: 1,
        timeLimit: 20
      },
      {
        id: 'P1-FO-01',
        type: 'find_original',
        question: 'If 20% of a number is 40, what is the number?',
        given: { percentage: 20, value: 40 },
        answer: 200,
        unit: '',
        explanation: 'If 20% = 40, then 100% = 40 × (100/20) = 40 × 5 = 200',
        difficulty: 1,
        timeLimit: 25
      },
      {
        id: 'P1-FO-02',
        type: 'find_original',
        question: 'If 15% of x equals 30, what is x?',
        given: { percentage: 15, value: 30 },
        answer: 200,
        unit: '',
        explanation: '0.15x = 30, so x = 30 ÷ 0.15 = 200',
        difficulty: 1,
        timeLimit: 25
      },
      {
        id: 'P1-PC-01',
        type: 'percentage_change',
        question: 'A price increases from $80 to $100. What is the percentage increase?',
        given: { original: 80, newValue: 100 },
        answer: 25,
        unit: '%',
        explanation: 'Increase = $20. Percentage = (20/80) × 100 = 25%',
        difficulty: 1,
        timeLimit: 30
      }
    ];
  }

  private generateLevel2Problems(): PercentageProblem[] {
    return [
      {
        id: 'P2-FO-01',
        type: 'find_original',
        question: 'If 15% of x equals 30, and 20% of y equals the same amount, what is x + y?',
        given: { value: 30 },
        answer: 350,
        unit: '',
        explanation: '0.15x = 30, so x = 200. 0.20y = 30, so y = 150. x + y = 350',
        difficulty: 2,
        timeLimit: 60
      },
      {
        id: 'P2-CP-01',
        type: 'combined_percentage',
        question: 'A shirt costs $50 with 20% off, then an additional 10% off the sale price. What is the final price?',
        given: { original: 50 },
        answer: 36,
        unit: '$',
        explanation: 'First discount: $50 × 0.80 = $40. Second discount: $40 × 0.90 = $36',
        difficulty: 2,
        timeLimit: 50
      },
      {
        id: 'P2-PC-02',
        type: 'percentage_change',
        question: 'A value decreases by 20%, then increases by 25%. What is the net percentage change?',
        given: {},
        answer: 0,
        unit: '%',
        explanation: 'Start with 100. After 20% decrease: 80. After 25% increase: 80 × 1.25 = 100. Net change: 0%',
        difficulty: 2,
        timeLimit: 60
      },
      {
        id: 'P2-FO-02',
        type: 'find_original',
        question: 'After a 15% discount, an item costs $85. What was the original price?',
        given: { value: 85, percentage: 15 },
        answer: 100,
        unit: '$',
        explanation: 'If discounted price is 85% of original, then original = 85 ÷ 0.85 = $100',
        difficulty: 2,
        timeLimit: 45
      },
      {
        id: 'P2-CP-02',
        type: 'combined_percentage',
        question: 'If A is 20% of B, and B is 25% of C, what percentage of C is A?',
        given: {},
        answer: 5,
        unit: '%',
        explanation: 'A = 0.20 × B = 0.20 × (0.25 × C) = 0.05 × C = 5% of C',
        difficulty: 2,
        timeLimit: 70
      }
    ];
  }

  private generateLevel3Problems(): PercentageProblem[] {
    return [
      {
        id: 'P3-CP-01',
        type: 'combined_percentage',
        question: 'A population increases by 10% in year 1, then 20% in year 2, then decreases by 15% in year 3. What is the total percentage change?',
        given: {},
        answer: 12.4,
        unit: '% increase',
        explanation: 'Multiply factors: 1.10 × 1.20 × 0.85 = 1.122. Total increase = 12.2% (closest: 12.4%)',
        difficulty: 3,
        timeLimit: 120
      },
      {
        id: 'P3-FO-01',
        type: 'find_original',
        question: 'If 120% of a number minus 80% of the same number equals 40, what is the number?',
        given: {},
        answer: 100,
        unit: '',
        explanation: '1.20x - 0.80x = 0.40x = 40. So x = 100',
        difficulty: 3,
        timeLimit: 90
      },
      {
        id: 'P3-PC-03',
        type: 'percentage_change',
        question: 'A rectangle has length increased by 20% and width decreased by 20%. What is the percentage change in area?',
        given: {},
        answer: -4,
        unit: '% (decrease)',
        explanation: 'New area = 1.20L × 0.80W = 0.96 × original area. Decrease of 4%',
        difficulty: 3,
        timeLimit: 100
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): PercentageProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): PercentageResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const correct = Math.abs(answer - problem.answer) <= (problem.answer * 0.02);

    const result: PercentageResult = {
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

  generateDailySession(level: number): PercentageProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`📊 Percentages Training - Level ${level}`);
    console.log(`🧮 ${problems.length} percentage problems`);
    console.log(`⏱️  Target: <30s per problem\n`);
    return problems;
  }
}

export const percentagesTraining = new PercentagesTraining();
