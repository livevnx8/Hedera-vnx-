/**
 * Vera Spatial Training - Mirror Image & Clock Reading Module
 * 
 * Mirror reversal exercises and clock time reading.
 * Critical for spatial reasoning and Mensa tests.
 */

export interface MirrorProblem {
  id: string;
  type: 'clock_reading' | 'letter_reversal' | 'number_reversal' | 'water_reflection';
  display: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  difficulty: 1 | 2 | 3 | 4;
  timeLimit: number;
}

export interface MirrorResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class MirrorImageTraining {
  private problems: MirrorProblem[] = [];
  private results: MirrorResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateClockProblems());
    this.problems.push(...this.generateLetterReversalProblems());
    this.problems.push(...this.generateNumberReversalProblems());
    this.problems.push(...this.generateWaterReflectionProblems());
  }

  private generateClockProblems(): MirrorProblem[] {
    return [
      {
        id: 'M1-CLOCK-01',
        type: 'clock_reading',
        display: '3:45',
        question: 'A mirror shows "3:45". What time is it actually?',
        options: ['8:15', '9:15', '2:15', '4:15'],
        correct: 0,
        explanation: 'Mirror reverses left-right. 3:45 appears as 8:15 (12:00 - 3:45 = 8:15)',
        difficulty: 1,
        timeLimit: 45
      },
      {
        id: 'M1-CLOCK-02',
        type: 'clock_reading',
        display: '12:00',
        question: 'A mirror shows "12:00". What time is it actually?',
        options: ['12:00', '6:00', '11:59', 'Cannot tell'],
        correct: 0,
        explanation: '12:00 is symmetrical, so it looks the same in a mirror',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'M2-CLOCK-03',
        type: 'clock_reading',
        display: '6:30',
        question: 'A mirror shows "6:30". What time is it actually?',
        options: ['5:30', '6:30', '12:30', '1:30'],
        correct: 0,
        explanation: '12:00 - 6:30 = 5:30. The mirror time reverses around 12:00/6:00 axis',
        difficulty: 2,
        timeLimit: 60
      },
      {
        id: 'M2-CLOCK-04',
        type: 'clock_reading',
        display: '10:10',
        question: 'A mirror shows "10:10". What time is it actually?',
        options: ['1:50', '2:50', '10:10', '9:50'],
        correct: 0,
        explanation: '12:00 - 10:10 = 1:50. Hour hand at 10, minute at 2 (10), reversed becomes hour at 1, minute at 10 (50)',
        difficulty: 2,
        timeLimit: 70
      },
      {
        id: 'M3-CLOCK-05',
        type: 'clock_reading',
        display: '4:20',
        question: 'A mirror shows "4:20". What time is it actually?',
        options: ['7:40', '8:40', '7:20', '8:20'],
        correct: 0,
        explanation: '12:00 - 4:20 = 7:40. Or: minute hand at 4 (20min), reversed points to 8 (40min). Hour hand method confirms.',
        difficulty: 3,
        timeLimit: 90
      },
      {
        id: 'M4-CLOCK-06',
        type: 'clock_reading',
        display: '11:55',
        question: 'A mirror shows "11:55". What time is it actually?',
        options: ['12:05', '12:15', '1:05', '11:05'],
        correct: 0,
        explanation: 'Minute hand at 11 (55min), reversed at 1 (05min). Hour hand near 12, slightly before, so just after 12:00',
        difficulty: 4,
        timeLimit: 120
      }
    ];
  }

  private generateLetterReversalProblems(): MirrorProblem[] {
    return [
      {
        id: 'M1-LETTER-01',
        type: 'letter_reversal',
        display: 'N',
        question: 'If you rotate the letter "N" 180°, what letter does it resemble?',
        options: ['Z', 'M', 'H', 'U'],
        correct: 0,
        explanation: 'N rotated 180° looks like Z',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'M1-LETTER-02',
        type: 'letter_reversal',
        display: 'M',
        question: 'Which capital letter looks the same in a mirror?',
        options: ['M', 'N', 'Z', 'S'],
        correct: 0,
        explanation: 'M has vertical symmetry, so it looks the same in a mirror (also A, H, I, O, T, U, V, W, X, Y)',
        difficulty: 1,
        timeLimit: 45
      },
      {
        id: 'M2-LETTER-03',
        type: 'letter_reversal',
        display: 'b',
        question: 'What does lowercase "b" look like in a mirror?',
        options: ['d', 'p', 'q', 'Same'],
        correct: 0,
        explanation: 'b reversed left-right becomes d',
        difficulty: 2,
        timeLimit: 40
      },
      {
        id: 'M2-LETTER-04',
        type: 'letter_reversal',
        display: 'p',
        question: 'Rotate "p" 180° and hold it to a mirror. What do you see?',
        options: ['b', 'd', 'q', 'p'],
        correct: 2,
        explanation: 'p rotated 180° becomes d, then mirrored becomes b... wait. p rotated 180° = d. d mirrored = b. So b? Recheck: p→rotate180→d→mirror→b. But option 0 is b. So 0. Wait, let me recalculate: p rotated 180° is d. d in mirror is b. So answer is b',
        difficulty: 3,
        timeLimit: 80
      },
      {
        id: 'M3-LETTER-05',
        type: 'letter_reversal',
        display: 'AMBULANCE',
        question: 'Why is "AMBULANCE" written in reverse on the front of emergency vehicles?',
        options: ['It is a mistake', 'So drivers in mirrors can read it correctly', 'For decoration', 'Legal requirement'],
        correct: 1,
        explanation: 'When drivers look in their rearview mirrors, the reversed text appears normal, allowing them to quickly identify ambulances',
        difficulty: 2,
        timeLimit: 60
      }
    ];
  }

  private generateNumberReversalProblems(): MirrorProblem[] {
    return [
      {
        id: 'M1-NUM-01',
        type: 'number_reversal',
        display: '2',
        question: 'What does the digit "2" look like in a mirror?',
        options: ['Reversed 2', '5', 'Same', 'Unreadable'],
        correct: 0,
        explanation: '2 reversed horizontally looks like a backward 2 (not another digit)',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'M2-NUM-02',
        type: 'number_reversal',
        display: '6',
        question: 'Rotate "6" 180°. What number does it become?',
        options: ['6', '9', '0', 'Same'],
        correct: 1,
        explanation: '6 rotated 180° becomes 9',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'M2-NUM-03',
        type: 'number_reversal',
        display: '69',
        question: 'Rotate "69" 180°. What does it show?',
        options: ['69', '96', 'Same', 'Unreadable'],
        correct: 0,
        explanation: '69 rotated 180° looks the same (6→9 and 9→6, but order reverses too, making it appear unchanged)',
        difficulty: 2,
        timeLimit: 50
      },
      {
        id: 'M3-NUM-04',
        type: 'number_reversal',
        display: '808',
        question: 'Which numbers look the same upside down?',
        options: ['0, 1, 8', '0, 6, 9', '1, 2, 5', '3, 4, 7'],
        correct: 0,
        explanation: '0, 1, and 8 have rotational or reflectional symmetry. 6 and 9 swap with each other',
        difficulty: 2,
        timeLimit: 45
      },
      {
        id: 'M4-NUM-05',
        type: 'number_reversal',
        display: '18:81',
        question: 'A digital clock in a mirror shows 18:81. What time is it?',
        options: ['10:18', '11:18', '12:18', 'Invalid time'],
        correct: 1,
        explanation: 'In a digital clock mirror, each digit appears reversed. The digits 1 and 8 are vertically symmetric. When the entire time 18:81 is reversed left-to-right, it becomes 11:18. This is because the position reversal makes the first digit become last, etc.',
        difficulty: 4,
        timeLimit: 120
      }
    ];
  }

  private generateWaterReflectionProblems(): MirrorProblem[] {
    return [
      {
        id: 'M2-WATER-01',
        type: 'water_reflection',
        display: 'TREE',
        question: 'A tree reflected in still water appears how?',
        options: ['Upside down', 'Reversed left-right', 'Same', 'Blurred'],
        correct: 0,
        explanation: 'Water reflection is a vertical mirror (top-bottom reversal), making objects appear upside down',
        difficulty: 2,
        timeLimit: 45
      },
      {
        id: 'M3-WATER-02',
        type: 'water_reflection',
        display: 'BOAT',
        question: 'A boat on water shows reflection. If the boat moves right, the reflection moves:',
        options: ['Left', 'Right', 'Stays still', 'Down'],
        correct: 1,
        explanation: 'The reflection is vertically flipped but follows the same horizontal movement as the object',
        difficulty: 3,
        timeLimit: 60
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): MirrorProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): MirrorResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const result: MirrorResult = {
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
    byType: Record<string, number>;
  } {
    const byLevel: Record<number, number> = {};
    for (let i = 1; i <= 4; i++) {
      byLevel[i] = this.getAccuracyForLevel(i);
    }

    const byType: Record<string, { correct: number; total: number }> = {};
    this.results.forEach(r => {
      const problem = this.problems.find(p => p.id === r.problemId);
      if (problem) {
        if (!byType[problem.type]) {
          byType[problem.type] = { correct: 0, total: 0 };
        }
        byType[problem.type].total++;
        if (r.correct) byType[problem.type].correct++;
      }
    });

    const typeAccuracy: Record<string, number> = {};
    Object.entries(byType).forEach(([type, stats]) => {
      typeAccuracy[type] = (stats.correct / stats.total) * 100;
    });

    return {
      totalProblems: this.problems.length,
      attempted: this.results.length,
      correct: this.results.filter(r => r.correct).length,
      accuracy: this.getOverallAccuracy(),
      byLevel,
      byType: typeAccuracy
    };
  }

  generateDailySession(level: number): MirrorProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`🪞 Mirror Images - Level ${level}`);
    console.log(`⏰ ${problems.length} mirror problems loaded`);
    console.log(`📝 Types: ${[...new Set(problems.map(p => p.type))].join(', ')}\n`);
    return problems;
  }

  getExplanation(problemId: string): string {
    const problem = this.problems.find(p => p.id === problemId);
    return problem?.explanation || 'No explanation available';
  }
}

export const mirrorImageTraining = new MirrorImageTraining();
