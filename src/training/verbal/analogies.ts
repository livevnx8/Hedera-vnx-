/**
 * Vera Verbal Training - Analogies Module
 * 
 * Word analogies for Mensa verbal reasoning.
 * Target: 90% accuracy
 */

export interface AnalogyProblem {
  id: string;
  type: 'professional' | 'functional' | 'causal' | 'part_whole' | 'degree';
  pair: [string, string];
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface AnalogyResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class AnalogiesTraining {
  private problems: AnalogyProblem[] = [];
  private results: AnalogyResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): AnalogyProblem[] {
    return [
      {
        id: 'A1-PR-01',
        type: 'professional',
        pair: ['doctor', 'patient'],
        question: 'Doctor is to patient as lawyer is to _____?',
        options: ['judge', 'court', 'client', 'case'],
        correct: 2,
        explanation: 'Doctor provides service to patient; lawyer provides service to client',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'A1-FN-01',
        type: 'functional',
        pair: ['scissors', 'cut'],
        question: 'Scissors are to cut as pencil is to _____?',
        options: ['paper', 'write', 'eraser', 'lead'],
        correct: 1,
        explanation: 'Scissors function is to cut; pencil function is to write',
        difficulty: 1,
        timeLimit: 25
      },
      {
        id: 'A1-FN-02',
        type: 'functional',
        pair: ['hammer', 'nail'],
        question: 'Hammer is to nail as screwdriver is to _____?',
        options: ['wood', 'screw', 'metal', 'toolbox'],
        correct: 1,
        explanation: 'Hammer is used on nails; screwdriver is used on screws',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'A1-CA-01',
        type: 'causal',
        pair: ['fire', 'smoke'],
        question: 'Fire is to smoke as rain is to _____?',
        options: ['cloud', 'wet', 'puddle', 'storm'],
        correct: 2,
        explanation: 'Fire produces smoke; rain produces puddles',
        difficulty: 1,
        timeLimit: 35
      },
      {
        id: 'A1-PW-01',
        type: 'part_whole',
        pair: ['wheel', 'car'],
        question: 'Wheel is to car as page is to _____?',
        options: ['book', 'paper', 'print', 'read'],
        correct: 0,
        explanation: 'Wheel is part of car; page is part of book',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'A1-PR-02',
        type: 'professional',
        pair: ['teacher', 'student'],
        question: 'Teacher is to student as coach is to _____?',
        options: ['team', 'athlete', 'game', 'sport'],
        correct: 1,
        explanation: 'Teacher instructs student; coach trains athlete',
        difficulty: 1,
        timeLimit: 30
      }
    ];
  }

  private generateLevel2Problems(): AnalogyProblem[] {
    return [
      {
        id: 'A2-DG-01',
        type: 'degree',
        pair: ['warm', 'hot'],
        question: 'Warm is to hot as cool is to _____?',
        options: ['warm', 'freezing', 'cold', 'chilly'],
        correct: 2,
        explanation: 'Warm to hot is increasing intensity; cool to cold is increasing intensity',
        difficulty: 2,
        timeLimit: 40
      },
      {
        id: 'A2-CA-02',
        type: 'causal',
        pair: ['exercise', 'fitness'],
        question: 'Exercise is to fitness as studying is to _____?',
        options: ['books', 'knowledge', 'school', 'grades'],
        correct: 1,
        explanation: 'Exercise leads to fitness; studying leads to knowledge',
        difficulty: 2,
        timeLimit: 45
      },
      {
        id: 'A2-FN-03',
        type: 'functional',
        pair: ['key', 'lock'],
        question: 'Key is to lock as password is to _____?',
        options: ['computer', 'account', 'security', 'login'],
        correct: 1,
        explanation: 'Key unlocks lock; password unlocks account',
        difficulty: 2,
        timeLimit: 50
      },
      {
        id: 'A2-PW-02',
        type: 'part_whole',
        pair: ['finger', 'hand'],
        question: 'Finger is to hand as leaf is to _____?',
        options: ['tree', 'branch', 'forest', 'plant'],
        correct: 1,
        explanation: 'Finger is part of hand; leaf is part of branch (or tree)',
        difficulty: 2,
        timeLimit: 45
      },
      {
        id: 'A2-PR-03',
        type: 'professional',
        pair: ['chef', 'restaurant'],
        question: 'Chef is to restaurant as director is to _____?',
        options: ['movie', 'actor', 'film', 'theater'],
        correct: 2,
        explanation: 'Chef works in restaurant; director works on film',
        difficulty: 2,
        timeLimit: 50
      }
    ];
  }

  private generateLevel3Problems(): AnalogyProblem[] {
    return [
      {
        id: 'A3-CA-03',
        type: 'causal',
        pair: ['seed', 'plant'],
        question: 'Seed is to plant as idea is to _____?',
        options: ['thought', 'innovation', 'creation', 'action'],
        correct: 1,
        explanation: 'Seed grows into plant; idea grows into innovation',
        difficulty: 3,
        timeLimit: 70
      },
      {
        id: 'A3-DG-02',
        type: 'degree',
        pair: ['drop', 'flood'],
        question: 'Drop is to flood as whisper is to _____?',
        options: ['shout', 'quiet', 'noise', 'scream'],
        correct: 3,
        explanation: 'Drop to flood is quantity escalation; whisper to scream is volume escalation',
        difficulty: 3,
        timeLimit: 80
      },
      {
        id: 'A3-PW-03',
        type: 'part_whole',
        pair: ['cell', 'organism'],
        question: 'Cell is to organism as individual is to _____?',
        options: ['group', 'society', 'person', 'community'],
        correct: 1,
        explanation: 'Cell is the basic unit of organism; individual is the basic unit of society',
        difficulty: 3,
        timeLimit: 80
      },
      {
        id: 'A3-FN-04',
        type: 'functional',
        pair: ['catalyst', 'reaction'],
        question: 'Catalyst is to reaction as mentor is to _____?',
        options: ['student', 'growth', 'learning', 'career'],
        correct: 1,
        explanation: 'Catalyst accelerates reaction; mentor accelerates growth',
        difficulty: 3,
        timeLimit: 90
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): AnalogyProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): AnalogyResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const result: AnalogyResult = {
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

  generateDailySession(level: number): AnalogyProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`🔗 Analogies Training - Level ${level}`);
    console.log(`📝 ${problems.length} analogy problems`);
    console.log(`⏱️  Target: <45s per problem\n`);
    return problems;
  }
}

export const analogiesTraining = new AnalogiesTraining();
