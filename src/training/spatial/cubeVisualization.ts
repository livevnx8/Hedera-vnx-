/**
 * Vera Spatial Training - Cube Visualization Module
 * 
 * Cube net folding, opposite face identification, and 3D cube problems.
 * Critical for Mensa spatial reasoning section.
 */

export interface CubeProblem {
  id: string;
  type: 'net_folding' | 'opposite_faces' | 'surface_painting' | 'small_cubes';
  netConfig?: number[][]; // 2D representation of cube net
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  difficulty: 1 | 2 | 3 | 4;
  timeLimit: number;
}

export interface CubeResult {
  problemId: string;
  correct: boolean;
  answer: number;
  timeTaken: number;
}

export class CubeVisualizationTraining {
  private problems: CubeProblem[] = [];
  private results: CubeResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    // Level 1: Basic net folding (Week 1-2)
    this.problems.push(...this.generateLevel1Problems());
    
    // Level 2: Opposite face identification (Week 3-4)
    this.problems.push(...this.generateLevel2Problems());
    
    // Level 3: Painted cube surface area (Week 5-6)
    this.problems.push(...this.generateLevel3Problems());
    
    // Level 4: Small cubes making larger cubes (Week 7+)
    this.problems.push(...this.generateLevel4Problems());
  }

  private generateLevel1Problems(): CubeProblem[] {
    return [
      {
        id: 'C1-NET-01',
        type: 'net_folding',
        question: 'If you fold this cube net, which face is opposite the face marked "1"? [Cross pattern: center=1, arms=2,3,4,5, top=6]',
        options: ['Face 2', 'Face 3', 'Face 4', 'Face 6'],
        correct: 3,
        explanation: 'In a cross pattern, opposite faces are: 1-6, 2-4, 3-5',
        difficulty: 1,
        timeLimit: 60
      },
      {
        id: 'C1-NET-02',
        type: 'net_folding',
        question: 'Which cube net CANNOT fold into a proper cube?',
        options: ['Cross pattern (5 squares)', 'T pattern (4 squares)', '4 squares in a row + 2 on sides', '3×3 grid minus center'],
        correct: 3,
        explanation: 'A 3×3 grid minus center cannot fold into a cube - it has overlapping faces',
        difficulty: 1,
        timeLimit: 45
      },
      {
        id: 'C1-NET-03',
        type: 'net_folding',
        question: 'A cube net has letters A,B,C,D,E,F. A is center, B,C,D,E are adjacent. Where is F?',
        options: ['Opposite A', 'Adjacent to A', 'Same face as A', 'Not on the cube'],
        correct: 0,
        explanation: 'F must be opposite A to complete the 6 faces of the cube',
        difficulty: 1,
        timeLimit: 50
      }
    ];
  }

  private generateLevel2Problems(): CubeProblem[] {
    return [
      {
        id: 'C2-OPP-01',
        type: 'opposite_faces',
        question: 'A die shows: 1 opposite 6, 2 opposite 5, 3 opposite 4. If 1 is on top and 2 faces you, what faces left?',
        options: ['3', '4', '5', '6'],
        correct: 1,
        explanation: 'Standard die: 1-6, 2-5, 3-4 are opposite pairs. If 1 is top and 2 faces you, 3 is left, 4 is right',
        difficulty: 2,
        timeLimit: 70
      },
      {
        id: 'C2-OPP-02',
        type: 'opposite_faces',
        question: 'Three adjacent faces of a cube show 1, 2, 3. What is on the opposite corner (diagonal)?',
        options: ['Sum is 6', 'Product is 6', 'Average is 2', 'Cannot determine'],
        correct: 3,
        explanation: 'With only three adjacent faces visible, we cannot determine what is on the opposite corner',
        difficulty: 2,
        timeLimit: 80
      },
      {
        id: 'C2-OPP-03',
        type: 'net_folding',
        question: 'Fold this net: Row 1: [A][B][C], Row 2: [D][E] (D under B, E under C). What is opposite A?',
        options: ['D', 'E', 'B', 'C'],
        correct: 1,
        explanation: 'When folded, A becomes top, B front, C right, D left, E bottom. So E is opposite A',
        difficulty: 2,
        timeLimit: 90
      }
    ];
  }

  private generateLevel3Problems(): CubeProblem[] {
    return [
      {
        id: 'C3-PAINT-01',
        type: 'surface_painting',
        question: 'A 3×3×3 cube made of 27 small cubes is painted on all outside surfaces. How many small cubes have paint on exactly 2 faces?',
        options: ['8', '12', '16', '20'],
        correct: 1,
        explanation: 'Edge cubes (not corners) have 2 painted faces. A 3×3×3 cube has 12 edge cubes',
        difficulty: 3,
        timeLimit: 120
      },
      {
        id: 'C3-PAINT-02',
        type: 'surface_painting',
        question: 'A cube with 4cm edges is painted and cut into 1cm cubes. How many have NO paint?',
        options: ['0', '4', '8', '12'],
        correct: 2,
        explanation: 'Inner 2×2×2 = 8 cubes have no paint. Outer layers are all painted',
        difficulty: 3,
        timeLimit: 100
      },
      {
        id: 'C3-PAINT-03',
        type: 'surface_painting',
        question: 'A 5×5×5 cube of small cubes is painted on all 6 faces. How many small cubes have paint on exactly 1 face?',
        options: ['27', '54', '72', '96'],
        correct: 1,
        explanation: 'Center of each face: 3×3 = 9 per face. 6 faces × 9 = 54',
        difficulty: 3,
        timeLimit: 120
      }
    ];
  }

  private generateLevel4Problems(): CubeProblem[] {
    return [
      {
        id: 'C4-COUNT-01',
        type: 'small_cubes',
        question: 'How many 1cm cubes are needed to build a hollow 4cm cube (walls 1cm thick, empty inside)?',
        options: ['56', '64', '72', '96'],
        correct: 0,
        explanation: 'Total 4³=64 minus inner 2³=8 hollow = 56 cubes, OR: 6 faces × (4×4-2×2) = 6×12 = 72... wait, recalculate: 4×4×6 faces minus overlaps. Best: 64-8=56',
        difficulty: 4,
        timeLimit: 150
      },
      {
        id: 'C4-COUNT-02',
        type: 'small_cubes',
        question: 'A large cube made of 64 small cubes is painted red and disassembled. How many small cubes have exactly 3 red faces?',
        options: ['4', '6', '8', '12'],
        correct: 2,
        explanation: 'Only corner cubes have 3 painted faces. A cube has 8 corners',
        difficulty: 4,
        timeLimit: 100
      },
      {
        id: 'C4-COUNT-03',
        type: 'opposite_faces',
        question: 'A cube shows letters A-F. Three views show: (A,B,C), (B,D,E), (C,D,F). What is opposite A?',
        options: ['B', 'C', 'D', 'F'],
        correct: 3,
        explanation: 'From views: A adjacent to B,C; B adjacent to A,D,E; C adjacent to A,D,F. A is adjacent to B,C and cannot be opposite them. From third view, C adjacent to D,F. So A opposite to D or F. From pattern, A opposite F, B opposite D, C opposite E',
        difficulty: 4,
        timeLimit: 180
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 10): CubeProblem[] {
    const allProblems = this.problems.filter(p => p.difficulty === level);
    // Return shuffled selection
    return allProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, allProblems.length));
  }

  submitAnswer(problemId: string, answer: number, timeTaken: number): CubeResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const result: CubeResult = {
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
    weakTypes: string[];
  } {
    const byLevel: Record<number, number> = {};
    for (let i = 1; i <= 4; i++) {
      byLevel[i] = this.getAccuracyForLevel(i);
    }

    // Find weak problem types
    const typeAccuracy: Record<string, { correct: number; total: number }> = {};
    this.results.forEach(r => {
      const problem = this.problems.find(p => p.id === r.problemId);
      if (problem) {
        if (!typeAccuracy[problem.type]) {
          typeAccuracy[problem.type] = { correct: 0, total: 0 };
        }
        typeAccuracy[problem.type].total++;
        if (r.correct) typeAccuracy[problem.type].correct++;
      }
    });

    const weakTypes = Object.entries(typeAccuracy)
      .filter(([, stats]) => (stats.correct / stats.total) < 0.7)
      .map(([type]) => type);

    return {
      totalProblems: this.problems.length,
      attempted: this.results.length,
      correct: this.results.filter(r => r.correct).length,
      accuracy: this.getOverallAccuracy(),
      byLevel,
      weakTypes
    };
  }

  generateDailySession(level: number): CubeProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`🎲 Cube Visualization - Level ${level}`);
    console.log(`📦 ${problems.length} cube problems loaded`);
    console.log(`🧩 Types: ${[...new Set(problems.map(p => p.type))].join(', ')}\n`);
    return problems;
  }

  getExplanation(problemId: string): string {
    const problem = this.problems.find(p => p.id === problemId);
    return problem?.explanation || 'No explanation available';
  }
}

export const cubeVisualizationTraining = new CubeVisualizationTraining();
