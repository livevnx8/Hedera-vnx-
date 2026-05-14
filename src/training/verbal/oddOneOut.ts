/**
 * Vera Verbal Training - Odd One Out Module
 * 
 * Category detection and odd one out problems for Mensa verbal reasoning.
 * Target: 90% accuracy
 */

export interface OddOneOutProblem {
  id: string;
  type: 'category' | 'attribute' | 'function' | 'relationship';
  items: string[];
  question: string;
  correct: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface OddOneOutResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class OddOneOutTraining {
  private problems: OddOneOutProblem[] = [];
  private results: OddOneOutResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): OddOneOutProblem[] {
    return [
      {
        id: 'OO1-CA-01',
        type: 'category',
        items: ['Apple', 'Banana', 'Carrot', 'Orange'],
        question: 'Which is the odd one out?',
        correct: 2,
        explanation: 'Apple, Banana, and Orange are fruits. Carrot is a vegetable',
        difficulty: 1,
        timeLimit: 25
      },
      {
        id: 'OO1-AT-01',
        type: 'attribute',
        items: ['Circle', 'Square', 'Triangle', 'Sphere'],
        question: 'Which is the odd one out?',
        correct: 3,
        explanation: 'Circle, Square, and Triangle are 2D shapes. Sphere is 3D',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'OO1-FN-01',
        type: 'function',
        items: ['Knife', 'Fork', 'Spoon', 'Plate'],
        question: 'Which is the odd one out?',
        correct: 3,
        explanation: 'Knife, Fork, and Spoon are eating utensils. Plate is serving ware',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'OO1-CA-02',
        type: 'category',
        items: ['Dog', 'Cat', 'Bird', 'Fish'],
        question: 'Which is the odd one out (based on habitat)?',
        correct: 2,
        explanation: 'Bird is the only one that flies (primarily aerial)',
        difficulty: 1,
        timeLimit: 35
      },
      {
        id: 'OO1-AT-02',
        type: 'attribute',
        items: ['Red', 'Blue', 'Green', 'Colorless'],
        question: 'Which is the odd one out?',
        correct: 3,
        explanation: 'Red, Blue, and Green are colors. Colorless is the absence of color',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'OO1-RL-01',
        type: 'relationship',
        items: ['Pen : Paper', 'Brush : Canvas', 'Chalk : Blackboard', 'Eraser : Mistake'],
        question: 'Which pair has a different relationship?',
        correct: 3,
        explanation: 'First three are tools used ON surfaces. Eraser removes mistakes (different relationship)',
        difficulty: 1,
        timeLimit: 40
      }
    ];
  }

  private generateLevel2Problems(): OddOneOutProblem[] {
    return [
      {
        id: 'OO2-CA-03',
        type: 'category',
        items: ['Ephemeral', 'Transient', 'Permanent', 'Fleeting'],
        question: 'Which is the odd one out?',
        correct: 2,
        explanation: 'Ephemeral, transient, and fleeting all mean temporary. Permanent means lasting',
        difficulty: 2,
        timeLimit: 60
      },
      {
        id: 'OO2-FN-02',
        type: 'function',
        items: ['Shovel', 'Rake', 'Hoe', 'Hammer'],
        question: 'Which is the odd one out?',
        correct: 3,
        explanation: 'Shovel, Rake, and Hoe are gardening tools. Hammer is a construction tool',
        difficulty: 2,
        timeLimit: 45
      },
      {
        id: 'OO2-AT-03',
        type: 'attribute',
        items: ['Walk', 'Run', 'Jog', 'Stand'],
        question: 'Which is the odd one out?',
        correct: 3,
        explanation: 'Walk, run, and jog involve movement. Stand is stationary',
        difficulty: 2,
        timeLimit: 40
      },
      {
        id: 'OO2-CA-04',
        type: 'category',
        items: ['2', '3', '5', '9'],
        question: 'Which is the odd one out?',
        correct: 3,
        explanation: '2, 3, and 5 are prime numbers. 9 is composite (3×3)',
        difficulty: 2,
        timeLimit: 50
      },
      {
        id: 'OO2-RL-02',
        type: 'relationship',
        items: ['Hot : Cold', 'Tall : Short', 'Big : Small', 'Fast : Quick'],
        question: 'Which pair has a different relationship?',
        correct: 3,
        explanation: 'First three are opposites. Fast and quick are synonyms',
        difficulty: 2,
        timeLimit: 60
      },
      {
        id: 'OO2-AT-04',
        type: 'attribute',
        items: ['Million', 'Billion', 'Thousand', 'Trillion'],
        question: 'Which is the odd one out?',
        correct: 2,
        explanation: 'Million, Billion, Trillion are larger numbers (powers of 1000). Thousand is different scale',
        difficulty: 2,
        timeLimit: 50
      }
    ];
  }

  private generateLevel3Problems(): OddOneOutProblem[] {
    return [
      {
        id: 'OO3-RL-03',
        type: 'relationship',
        items: ['Square is to Cube', 'Circle is to Sphere', 'Triangle is to Pyramid', 'Rectangle is to Polygon'],
        question: 'Which pair has a different relationship?',
        correct: 3,
        explanation: 'First three are 2D to 3D versions. Rectangle to polygon is category relationship (different type)',
        difficulty: 3,
        timeLimit: 90
      },
      {
        id: 'OO3-CA-05',
        type: 'category',
        items: ['A', 'E', 'I', 'U', 'B'],
        question: 'Which is the odd one out?',
        correct: 4,
        explanation: 'A, E, I, U are vowels. B is a consonant',
        difficulty: 3,
        timeLimit: 40
      },
      {
        id: 'OO3-FN-03',
        type: 'function',
        items: ['Catalyst', 'Enzyme', 'Catalyst', 'Inhibitor'],
        question: 'Which has a different function?',
        correct: 3,
        explanation: 'Catalysts and enzymes speed up reactions. Inhibitors slow them down',
        difficulty: 3,
        timeLimit: 80
      },
      {
        id: 'OO3-AT-05',
        type: 'attribute',
        items: ['Mercury', 'Venus', 'Earth', 'Sun'],
        question: 'Which is the odd one out?',
        correct: 3,
        explanation: 'Mercury, Venus, Earth are planets. Sun is a star',
        difficulty: 3,
        timeLimit: 50
      },
      {
        id: 'OO3-CA-06',
        type: 'category',
        items: ['Fiction', 'Biography', 'Novel', 'Mystery'],
        question: 'Which is the odd one out?',
        correct: 1,
        explanation: 'Novel, Mystery, and Fiction are fiction genres. Biography is non-fiction',
        difficulty: 3,
        timeLimit: 70
      },
      {
        id: 'OO3-RL-04',
        type: 'relationship',
        items: ['Carpenter : Wood', 'Sculptor : Stone', 'Painter : Canvas', 'Musician : Instrument'],
        question: 'Which pair has a different relationship?',
        correct: 3,
        explanation: 'First three are artist : material they work ON. Musician plays instrument (different relationship)',
        difficulty: 3,
        timeLimit: 90
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): OddOneOutProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): OddOneOutResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const result: OddOneOutResult = {
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

  generateDailySession(level: number): OddOneOutProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`🎯 Odd One Out Training - Level ${level}`);
    console.log(`🔍 ${problems.length} categorization problems`);
    console.log(`⏱️  Target: <60s per problem\n`);
    return problems;
  }
}

export const oddOneOutTraining = new OddOneOutTraining();
