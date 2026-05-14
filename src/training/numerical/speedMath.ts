/**
 * Vera Numerical Training - Speed Math Module
 * 
 * Speed, distance, time calculations for Mensa-level numerical reasoning.
 * Target: 90% accuracy, <60s per problem
 */

export interface SpeedMathProblem {
  id: string;
  type: 'speed_distance_time' | 'speed_increase' | 'average_speed';
  question: string;
  given: { distance?: number; time?: number; speed?: number; speedIncrease?: number };
  answer: number;
  unit: string;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface SpeedMathResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class SpeedMathTraining {
  private problems: SpeedMathProblem[] = [];
  private results: SpeedMathResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): SpeedMathProblem[] {
    return [
      {
        id: 'S1-SDT-01',
        type: 'speed_distance_time',
        question: 'A car travels 120 km in 2 hours. What is its average speed?',
        given: { distance: 120, time: 2 },
        answer: 60,
        unit: 'km/h',
        explanation: 'Speed = Distance ÷ Time = 120 ÷ 2 = 60 km/h',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'S1-SDT-02',
        type: 'speed_distance_time',
        question: 'If a train travels at 80 km/h for 3 hours, how far does it go?',
        given: { speed: 80, time: 3 },
        answer: 240,
        unit: 'km',
        explanation: 'Distance = Speed × Time = 80 × 3 = 240 km',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'S1-SDT-03',
        type: 'speed_distance_time',
        question: 'How long does it take to travel 150 km at 50 km/h?',
        given: { distance: 150, speed: 50 },
        answer: 3,
        unit: 'hours',
        explanation: 'Time = Distance ÷ Speed = 150 ÷ 50 = 3 hours',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'S1-SDT-04',
        type: 'speed_distance_time',
        question: 'A cyclist rides 45 km in 1.5 hours. What is their speed?',
        given: { distance: 45, time: 1.5 },
        answer: 30,
        unit: 'km/h',
        explanation: 'Speed = 45 ÷ 1.5 = 30 km/h',
        difficulty: 1,
        timeLimit: 35
      },
      {
        id: 'S1-SDT-05',
        type: 'speed_distance_time',
        question: 'A plane flies 900 km in 1.5 hours. What is its speed?',
        given: { distance: 900, time: 1.5 },
        answer: 600,
        unit: 'km/h',
        explanation: 'Speed = 900 ÷ 1.5 = 600 km/h',
        difficulty: 1,
        timeLimit: 35
      }
    ];
  }

  private generateLevel2Problems(): SpeedMathProblem[] {
    return [
      {
        id: 'S2-SI-01',
        type: 'speed_increase',
        question: 'A car travels 120 km in 2 hours. If it increases speed by 20%, how long to travel 180 km?',
        given: { distance: 120, time: 2, speedIncrease: 20 },
        answer: 2.5,
        unit: 'hours',
        explanation: 'Original speed: 120÷2=60 km/h. New speed: 60×1.2=72 km/h. Time=180÷72=2.5 hours',
        difficulty: 2,
        timeLimit: 90
      },
      {
        id: 'S2-SI-02',
        type: 'speed_increase',
        question: 'A runner completes 10 km in 50 min. With 10% speed increase, how long for 15 km?',
        given: { distance: 10, time: 50/60, speedIncrease: 10 },
        answer: 68.18,
        unit: 'minutes',
        explanation: 'Original speed: 10÷(50/60)=12 km/h. New speed: 12×1.1=13.2 km/h. Time=15÷13.2=1.136h=68.18min',
        difficulty: 2,
        timeLimit: 100
      },
      {
        id: 'S2-AS-01',
        type: 'average_speed',
        question: 'A car travels 60 km at 30 km/h and 60 km at 60 km/h. What is average speed for whole journey?',
        given: { distance: 120 },
        answer: 40,
        unit: 'km/h',
        explanation: 'Time 1st part: 60÷30=2h. Time 2nd part: 60÷60=1h. Total time=3h. Avg speed=120÷3=40 km/h',
        difficulty: 2,
        timeLimit: 90
      },
      {
        id: 'S2-AS-02',
        type: 'average_speed',
        question: 'A train goes 100 km at 50 km/h and returns at 100 km/h. What is average speed?',
        given: { distance: 200 },
        answer: 66.67,
        unit: 'km/h',
        explanation: 'Time going: 100÷50=2h. Time returning: 100÷100=1h. Total=200km in 3h. Avg=200÷3=66.67 km/h',
        difficulty: 2,
        timeLimit: 100
      },
      {
        id: 'S2-SI-03',
        type: 'speed_increase',
        question: 'If reducing speed by 25% adds 30 min to a 2-hour journey, what was original speed?',
        given: { time: 2 },
        answer: 60,
        unit: 'km/h',
        explanation: 'New time=2.5h. New speed=0.75×original. Distance same: S×2=0.75S×2.5 → S=60 km/h',
        difficulty: 2,
        timeLimit: 120
      }
    ];
  }

  private generateLevel3Problems(): SpeedMathProblem[] {
    return [
      {
        id: 'S3-SI-01',
        type: 'speed_increase',
        question: 'A car travels from A to B at 60 km/h and returns at 40 km/h. If total time is 5 hours, what is the distance between A and B?',
        given: {},
        answer: 120,
        unit: 'km',
        explanation: 'Let distance = d. Time = d/60 + d/40 = 5. Multiply by 120: 2d + 3d = 600. 5d = 600. d = 120 km',
        difficulty: 3,
        timeLimit: 150
      },
      {
        id: 'S3-AS-01',
        type: 'average_speed',
        question: 'A journey has 3 parts: 50 km at 25 km/h, 60 km at 30 km/h, 90 km at 45 km/h. What is average speed?',
        given: { distance: 200 },
        answer: 34.29,
        unit: 'km/h',
        explanation: 'Times: 50÷25=2h, 60÷30=2h, 90÷45=2h. Total=200km in 6h. Avg=200÷6=33.33 km/h',
        difficulty: 3,
        timeLimit: 150
      },
      {
        id: 'S3-SI-02',
        type: 'speed_increase',
        question: 'Increasing speed by 20% saves 15 minutes on a 180 km journey. What was original speed?',
        given: { distance: 180 },
        answer: 120,
        unit: 'km/h',
        explanation: 'Original time: 180/S. New time: 180/(1.2S). Difference: 180/S - 180/1.2S = 0.25. Solve: S=120 km/h',
        difficulty: 3,
        timeLimit: 180
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): SpeedMathProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): SpeedMathResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    // Allow 1% tolerance for floating point answers
    const correct = Math.abs(answer - problem.answer) <= (problem.answer * 0.01);

    const result: SpeedMathResult = {
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

  getAverageTimeForLevel(level: number): number {
    const levelProblems = this.problems.filter(p => p.difficulty === level).map(p => p.id);
    const levelResults = this.results.filter(r => levelProblems.includes(r.problemId));
    
    if (levelResults.length === 0) return 0;
    return levelResults.reduce((sum, r) => sum + r.timeTaken, 0) / levelResults.length;
  }

  getProgressSummary(): {
    totalProblems: number;
    attempted: number;
    correct: number;
    accuracy: number;
    byLevel: Record<number, number>;
    averageTimeByLevel: Record<number, number>;
  } {
    const byLevel: Record<number, number> = {};
    const averageTimeByLevel: Record<number, number> = {};
    
    for (let i = 1; i <= 3; i++) {
      byLevel[i] = this.getAccuracyForLevel(i);
      averageTimeByLevel[i] = this.getAverageTimeForLevel(i);
    }

    return {
      totalProblems: this.problems.length,
      attempted: this.results.length,
      correct: this.results.filter(r => r.correct).length,
      accuracy: this.getOverallAccuracy(),
      byLevel,
      averageTimeByLevel
    };
  }

  generateDailySession(level: number): SpeedMathProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`🏎️  Speed Math Training - Level ${level}`);
    console.log(`📐 ${problems.length} speed/distance/time problems`);
    console.log(`⏱️  Target: <60s per problem\n`);
    return problems;
  }

  getExplanation(problemId: string): string {
    const problem = this.problems.find(p => p.id === problemId);
    return problem?.explanation || 'No explanation available';
  }
}

export const speedMathTraining = new SpeedMathTraining();
