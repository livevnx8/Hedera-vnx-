/**
 * Vera Verbal Training - Anagrams Module
 * 
 * Letter rearrangement and word formation for Mensa verbal reasoning.
 * Target: 95% accuracy
 */

export interface AnagramProblem {
  id: string;
  type: 'rearrange' | 'form_word' | 'find_anagram' | 'unscramble';
  letters: string;
  question: string;
  answer: string;
  hint: string;
  explanation: string;
  difficulty: 1 | 2 | 3;
  timeLimit: number;
}

export interface AnagramResult {
  problemId: string;
  correct: boolean;
  answer: string;
  timeTaken: number;
}

export class AnagramsTraining {
  private problems: AnagramProblem[] = [];
  private results: AnagramResult[] = [];

  constructor() {
    this.initializeProblems();
  }

  private initializeProblems(): void {
    this.problems.push(...this.generateLevel1Problems());
    this.problems.push(...this.generateLevel2Problems());
    this.problems.push(...this.generateLevel3Problems());
  }

  private generateLevel1Problems(): AnagramProblem[] {
    return [
      {
        id: 'AN1-RE-01',
        type: 'rearrange',
        letters: 'NAGRAM',
        question: 'Rearrange "NAGRAM" to form a word meaning "confused mass"',
        answer: 'ANAGRAM',
        hint: 'It is what you are solving right now',
        explanation: 'NAGRAM rearranged spells ANAGRAM - a word formed by rearranging letters',
        difficulty: 1,
        timeLimit: 45
      },
      {
        id: 'AN1-RE-02',
        type: 'rearrange',
        letters: 'LISTEN',
        question: 'Rearrange "LISTEN" to form a word meaning "not moving"',
        answer: 'SILENT',
        hint: 'Opposite of noisy',
        explanation: 'LISTEN rearranged spells SILENT - making no sound',
        difficulty: 1,
        timeLimit: 40
      },
      {
        id: 'AN1-FW-01',
        type: 'form_word',
        letters: 'HEART',
        question: 'Rearrange "HEART" to form another English word',
        answer: 'EARTH',
        hint: 'Our planet',
        explanation: 'HEART rearranged spells EARTH - our planet',
        difficulty: 1,
        timeLimit: 35
      },
      {
        id: 'AN1-FW-02',
        type: 'form_word',
        letters: 'RACE',
        question: 'Rearrange "RACE" to form another word',
        answer: 'CARE',
        hint: 'To look after',
        explanation: 'RACE rearranged spells CARE - to look after someone',
        difficulty: 1,
        timeLimit: 30
      },
      {
        id: 'AN1-FA-01',
        type: 'find_anagram',
        letters: 'DORMITORY',
        question: 'The letters in "DORMITORY" can be rearranged to form a phrase describing messy room. What is it?',
        answer: 'DIRTY ROOM',
        hint: 'Two words describing unclean space',
        explanation: 'DORMITORY = DIRTY ROOM - a messy, unclean space',
        difficulty: 1,
        timeLimit: 60
      }
    ];
  }

  private generateLevel2Problems(): AnagramProblem[] {
    return [
      {
        id: 'AN2-RE-03',
        type: 'rearrange',
        letters: 'ELEVEN PLUS TWO',
        question: 'Rearrange "ELEVEN PLUS TWO" to form a phrase with the same mathematical meaning',
        answer: 'TWELVE PLUS ONE',
        hint: '11 + 2 = ?',
        explanation: 'ELEVEN PLUS TWO (13) = TWELVE PLUS ONE (13). Both equal 13!',
        difficulty: 2,
        timeLimit: 90
      },
      {
        id: 'AN2-FA-02',
        type: 'find_anagram',
        letters: 'ASTRONOMER',
        question: 'Rearrange "ASTRONOMER" to form a phrase about the moon',
        answer: 'MOON STARER',
        hint: 'Someone who looks at the moon',
        explanation: 'ASTRONOMER = MOON STARER - someone who gazes at the moon',
        difficulty: 2,
        timeLimit: 80
      },
      {
        id: 'AN2-US-01',
        type: 'unscramble',
        letters: 'PRAAGMNO',
        question: 'Unscramble these letters to form a word meaning "puzzle with rearranged letters"',
        answer: 'ANAGRAM',
        hint: 'What this entire exercise is about',
        explanation: 'PRAAGMNO unscrambled is ANAGRAM',
        difficulty: 2,
        timeLimit: 70
      },
      {
        id: 'AN2-FW-03',
        type: 'form_word',
        letters: 'TRACE',
        question: 'Remove one letter and rearrange to form a word meaning "competition"',
        answer: 'RACE',
        hint: 'Remove T, rearrange remaining letters',
        explanation: 'TRACE - T = RACE (a competition)',
        difficulty: 2,
        timeLimit: 50
      },
      {
        id: 'AN2-FA-03',
        type: 'find_anagram',
        letters: 'THE EYES',
        question: 'Rearrange "THE EYES" to form a phrase describing what they do',
        answer: 'THEY SEE',
        hint: 'Two words: subject + verb',
        explanation: 'THE EYES = THEY SEE - what eyes do!',
        difficulty: 2,
        timeLimit: 70
      }
    ];
  }

  private generateLevel3Problems(): AnagramProblem[] {
    return [
      {
        id: 'AN3-FA-04',
        type: 'find_anagram',
        letters: 'THE MORSE CODE',
        question: 'Rearrange "THE MORSE CODE" to form a phrase about concealment',
        answer: 'HERE COME DOTS',
        hint: 'Hidden message arrival',
        explanation: 'THE MORSE CODE = HERE COME DOTS - dots and dashes arriving!',
        difficulty: 3,
        timeLimit: 120
      },
      {
        id: 'AN3-FA-05',
        type: 'find_anagram',
        letters: 'SLOT MACHINES',
        question: 'Rearrange "SLOT MACHINES" to form a phrase about losing money',
        answer: 'CASH LOST IN ME',
        hint: 'Where your money goes',
        explanation: 'SLOT MACHINES = CASH LOST IN ME - where gamblers lose money!',
        difficulty: 3,
        timeLimit: 150
      },
      {
        id: 'AN3-FA-06',
        type: 'find_anagram',
        letters: 'ANIMOSITY',
        question: 'Rearrange "ANIMOSITY" to form two words describing a place without noise',
        answer: 'IS NO AMITY',
        hint: 'Not a friendly, quiet place',
        explanation: 'ANIMOSITY (hostility) = IS NO AMITY (no friendliness)',
        difficulty: 3,
        timeLimit: 120
      },
      {
        id: 'AN3-US-02',
        type: 'unscramble',
        letters: 'PRECIPITAE',
        question: 'Unscramble to form a word meaning "to hurry or act hastily"',
        answer: 'PRECIPITATE',
        hint: 'P-R-E-C-I-P-I-T-A-T-E (11 letters)',
        explanation: 'PRECIPITAE unscrambled is PRECIPITATE - to act hastily or suddenly',
        difficulty: 3,
        timeLimit: 120
      }
    ];
  }

  getProblemsForLevel(level: number, count: number = 5): AnagramProblem[] {
    const levelProblems = this.problems.filter(p => p.difficulty === level);
    return levelProblems
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, levelProblems.length));
  }

  submitAnswer(problemId: string, answer: string, timeTaken: number): AnagramResult {
    const problem = this.problems.find(p => p.id === problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const normalizedAnswer = answer.toUpperCase().replace(/\s+/g, ' ').trim();
    const normalizedCorrect = problem.answer.toUpperCase().replace(/\s+/g, ' ').trim();
    const correct = normalizedAnswer === normalizedCorrect;

    const result: AnagramResult = {
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

  generateDailySession(level: number): AnagramProblem[] {
    const problems = this.getProblemsForLevel(level, 5);
    console.log(`🔄 Anagrams Training - Level ${level}`);
    console.log(`🔤 ${problems.length} anagram problems`);
    console.log(`⏱️  Target: <70s per problem\n`);
    return problems;
  }
}

export const anagramsTraining = new AnagramsTraining();
