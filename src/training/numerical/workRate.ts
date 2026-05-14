/**
 * Vera Numerical Training - Work Rate Module
 * 
 * Work rate problems (workers, pipes, machines) for Mensa tests.
 * Target: 85% accuracy
 */

export interface WorkRateProblem {
  id: string;
  type: 'workers' | 'pipes' | 'combined_work' | 'efficiency';
  question: string;
  answer: number;
  unit: string;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface WorkRateResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class WorkRateTraining {
  private problems: WorkRateProblem[] = [];
  private results: WorkRateResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): WorkRateProblem[] {
    return [
      {
        id: 'W1-WK-01',
        type: 'workers',
        question: 'If 4 workers can complete a job in 6 days, how many days would 8 workers take?',
        answer: 3,
        unit: 'days',
        explanation: 'Double the workers = half the time. 6 ÷ 2 = 3 days',
        difficulty: 1,
        timeLimit: 40
      },
      {
        id: 'W1-PP-01',
        type: 'pipes',
        question: 'Pipe A fills a tank in 2 hours. Pipe B empties it in 4 hours. How long to fill if both open?',
        answer: 4,
        unit: 'hours',
        explanation: 'A fills 1/2 per hour, B empties 1/4 per hour. Net: 1/2 - 1/4 = 1/4 per hour. Time = 4 hours',
        difficulty: 1,
        timeLimit: 60
      },
      {
        id: 'W1-CW-01',
        type: 'combined_work',
        question: 'A can do a job in 3 days, B in 6 days. How long working together?',
        answer: 2,
        unit: 'days',
        explanation: 'A does 1/3 per day, B does 1/6 per day. Together: 1/3 + 1/6 = 1/2 per day. Time = 2 days',
        difficulty: 1,
        timeLimit: 60
      }
    ];
  }

  private generateLevel2Problems(): WorkRateProblem[] {
    return [
      {
        id: 'W2-WK-01',
        type: 'workers',
        question: '3 workers can build 5 houses in 30 days. How many days for 6 workers to build 10 houses?',
        answer: 30,
        unit: 'days',
        explanation: 'Double workers = half time. Double houses = double time. Effects cancel. Same 30 days',
        difficulty: 2,
        timeLimit: 90
      },
      {
        id: 'W2-CW-02',
        type: 'combined_work',
        question: 'A, B, C can complete work in 2, 3, 6 days respectively. How long working together?',
        answer: 1,
        unit: 'day',
        explanation: 'A=1/2, B=1/3, C=1/6 per day. Total: 3/6+2/6+1/6=6/6=1 per day. Time=1 day',
        difficulty: 2,
        timeLimit: 90
      },
      {
        id: 'W2-EF-01',
        type: 'efficiency',
        question: 'Machine A is 50% more efficient than B. If B takes 12 hours, how long does A take?',
        answer: 8,
        unit: 'hours',
        explanation: '50% more efficient = 1.5x speed. Time = 12 ÷ 1.5 = 8 hours',
        difficulty: 2,
        timeLimit: 70
      }
    ];
  }

  private generateLevel3Problems(): WorkRateProblem[] {
    return [
      {
        id: 'W3-CW-03',
        type: 'combined_work',
        question: 'A and B together take 12 days, B and C take 15 days, A and C take 20 days. How long for A, B, C together?',
        answer: 10,
        unit: 'days',
        explanation: '1/A+1/B=1/12, 1/B+1/C=1/15, 1/A+1/C=1/20. Add all: 2(1/A+1/B+1/C)=1/12+1/15+1/20=1/5. So together=1/10 per day=10 days',
        difficulty: 3,
        timeLimit: 180
      },
      {
        id: 'W3-WK-02',
        type: 'workers',
        question: '8 men or 12 women can complete a job in 24 days. How long for 6 men and 9 women?',
        answer: 16,
        unit: 'days',
        explanation: '8 men = 12 women, so 1 man = 1.5 women. 6 men = 9 women. 6 men + 9 women = 9+9=18 women. 12 women take 24 days, 18 women take 12×24÷18=16 days',
        difficulty: 3,
        timeLimit: 150
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): WorkRateProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): WorkRateResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const correct = Math.abs(answer - problem.answer) <= (problem.answer * 0.02);

    const result: WorkRateResult = {
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

  generateDailySession(level: number): WorkRateProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`⚙️  Work Rate Training - Level ${level}`);
    console.log(`🏗️  ${problems.length} work rate problems`);
    console.log(`⏱️  Target: <90s per problem\n`);
    return problems;
  }
}

export const workRateTraining = new WorkRateTraining();
