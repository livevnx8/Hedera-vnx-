/**
 * Vera Numerical Training - Ratios Module
 * 
 * Ratio and proportion problems for Mensa numerical reasoning.
 * Target: 90% accuracy, <75s per problem
 */

export interface RatioProblem {
  id: string;
  type: 'simple_ratio' | 'compound_ratio' | 'proportional_division' | 'map_scale' | 'classroom_ratio';
  question: string;
  given: { ratio?: number[]; total?: number; parts?: number[]; scale?: number };
  answer: number;
  unit: string;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface RatioResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class RatiosTraining {
  private problems: RatioProblem[] = [];
  private results: RatioResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): RatioProblem[] {
    return [
      {
        id: 'R1-SR-01',
        type: 'simple_ratio',
        question: 'If the ratio of apples to oranges is 3:5 and there are 15 apples, how many oranges are there?',
        given: { ratio: [3, 5] },
        answer: 25,
        unit: 'oranges',
        explanation: '3 parts = 15 apples, so 1 part = 5. 5 parts = 5 × 5 = 25 oranges',
        difficulty: 1,
        timeLimit: 40
      },
      {
        id: 'R1-SR-02',
        type: 'simple_ratio',
        question: 'A recipe uses flour and sugar in ratio 4:1. If 2 cups of sugar are used, how much flour?',
        given: { ratio: [4, 1] },
        answer: 8,
        unit: 'cups',
        explanation: 'Sugar is 1 part = 2 cups. Flour is 4 parts = 4 × 2 = 8 cups',
        difficulty: 1,
        timeLimit: 35
      },
      {
        id: 'R1-PD-01',
        type: 'proportional_division',
        question: 'Divide 60 in the ratio 2:3. What is the larger part?',
        given: { ratio: [2, 3], total: 60 },
        answer: 36,
        unit: '',
        explanation: 'Total parts = 5. Value per part = 60 ÷ 5 = 12. Larger part = 3 × 12 = 36',
        difficulty: 1,
        timeLimit: 45
      },
      {
        id: 'R1-MS-01',
        type: 'map_scale',
        question: 'On a map, 1 cm represents 5 km. If two towns are 8 cm apart on the map, what is the actual distance?',
        given: { scale: 5 },
        answer: 40,
        unit: 'km',
        explanation: '8 cm × 5 km/cm = 40 km',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'R1-CR-01',
        type: 'classroom_ratio',
        question: 'If the ratio of boys to girls in a class is 3:5 and there are 24 girls, how many students total?',
        given: { ratio: [3, 5] },
        answer: 38,
        unit: 'students',
        explanation: '5 parts = 24 girls, so 1 part = 4.8. Boys = 3 × 4.8 = 14.4 ≈ 14. Total = 24 + 14 = 38 (or 8 parts × 4.8 = 38.4 ≈ 38)',
        difficulty: 1,
        timeLimit: 60
      }
    ];
  }

  private generateLevel2Problems(): RatioProblem[] {
    return [
      {
        id: 'R2-CR-01',
        type: 'compound_ratio',
        question: 'If A:B = 2:3 and B:C = 4:5, what is A:C?',
        given: {},
        answer: 8,
        unit: ':15',
        explanation: 'A:B = 2:3 = 8:12. B:C = 4:5 = 12:15. So A:C = 8:15',
        difficulty: 2,
        timeLimit: 90
      },
      {
        id: 'R2-PD-02',
        type: 'proportional_division',
        question: 'Divide $120 among three people in ratio 1:2:3. How much does the person with the smallest share get?',
        given: { ratio: [1, 2, 3], total: 120 },
        answer: 20,
        unit: '$',
        explanation: 'Total parts = 6. Value per part = 120 ÷ 6 = 20. Smallest share = 1 × 20 = $20',
        difficulty: 2,
        timeLimit: 70
      },
      {
        id: 'R2-SR-03',
        type: 'simple_ratio',
        question: 'Two numbers are in ratio 5:7. If their sum is 72, what is the difference between them?',
        given: { ratio: [5, 7], total: 72 },
        answer: 12,
        unit: '',
        explanation: 'Total parts = 12. Value per part = 72 ÷ 12 = 6. Numbers are 30 and 42. Difference = 12',
        difficulty: 2,
        timeLimit: 80
      },
      {
        id: 'R2-CR-02',
        type: 'compound_ratio',
        question: 'The ratio of men to women is 3:4, and women to children is 5:2. What is the ratio of men to children?',
        given: {},
        answer: 15,
        unit: ':8',
        explanation: 'M:W = 3:4 = 15:20. W:C = 5:2 = 20:8. So M:C = 15:8',
        difficulty: 2,
        timeLimit: 100
      },
      {
        id: 'R2-MS-02',
        type: 'map_scale',
        question: 'On a map with scale 1:50000, a rectangular field measures 3 cm × 4 cm. What is the actual area in hectares?',
        given: { scale: 50000 },
        answer: 300,
        unit: 'hectares',
        explanation: 'Actual dimensions: 3×50000=150000cm=1.5km, 4×50000=200000cm=2km. Area=3 sq km=300 hectares',
        difficulty: 2,
        timeLimit: 120
      }
    ];
  }

  private generateLevel3Problems(): RatioProblem[] {
    return [
      {
        id: 'R3-PD-03',
        type: 'proportional_division',
        question: 'An inheritance of $24000 is divided among A, B, C such that A gets 1/3, and B:C = 3:5. How much does C get?',
        given: { total: 24000 },
        answer: 10000,
        unit: '$',
        explanation: 'A gets 1/3 = $8000. Remaining $16000 divided 3:5. Total parts = 8. C gets 5/8 × 16000 = $10000',
        difficulty: 3,
        timeLimit: 150
      },
      {
        id: 'R3-CR-03',
        type: 'compound_ratio',
        question: 'If 3 workers can build 5 houses in 30 days, how many days would 6 workers need to build 10 houses?',
        given: {},
        answer: 30,
        unit: 'days',
        explanation: 'Double workers (2x) means half the time for same work. Double houses (2x) means double the time. 2x and 0.5x cancel out. Same 30 days',
        difficulty: 3,
        timeLimit: 120
      },
      {
        id: 'R3-SR-04',
        type: 'simple_ratio',
        question: 'Two numbers are in ratio 7:11. If 6 is added to each, the new ratio is 5:7. What is the larger original number?',
        given: { ratio: [7, 11] },
        answer: 33,
        unit: '',
        explanation: 'Let numbers be 7x and 11x. (7x+6)/(11x+6) = 5/7. Cross multiply: 49x+42 = 55x+30. 6x=12. x=2. Larger number = 11×2 = 33',
        difficulty: 3,
        timeLimit: 180
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): RatioProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): RatioResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const correct = Math.abs(answer - problem.answer) <= (problem.answer * 0.01);

    const result: RatioResult = {
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

  generateDailySession(level: number): RatioProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`⚖️  Ratios Training - Level ${level}`);
    console.log(`📏 ${problems.length} ratio and proportion problems`);
    console.log(`⏱️  Target: <75s per problem\n`);
    return problems;
  }
}

export const ratiosTraining = new RatiosTraining();
