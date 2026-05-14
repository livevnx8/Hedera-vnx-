/**
 * Vera Combined Training - Mensa Simulation Tests
 * 
 * Full Mensa-style practice tests combining numerical and verbal reasoning.
 */

import { speedMathTraining } from '../numerical/speedMath.js';
import { percentagesTraining } from '../numerical/percentages.js';
import { ratiosTraining } from '../numerical/ratios.js';
import { sequencesTraining } from '../numerical/sequences.js';
import { geometryTraining } from '../numerical/geometry.js';
import { analogiesTraining } from '../verbal/analogies.js';
import { vocabularyTraining } from '../verbal/vocabulary.js';
import { logicTraining } from '../verbal/logic.js';

export interface MensaTestResult {
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeTaken: number;
  numericalScore: number;
  verbalScore: number;
  estimatedIQ: number;
  percentile: number;
  mensaQualified: boolean;
}

export class MensaSimulationTest {
  private numericalModules = [
    speedMathTraining,
    percentagesTraining,
    ratiosTraining,
    sequencesTraining,
    geometryTraining
  ];

  private verbalModules = [
    analogiesTraining,
    vocabularyTraining,
    logicTraining
  ];

  /**
   * Run a full Mensa simulation test
   * 30 questions, 45 minutes, mixed numerical and verbal
   */
  async runSimulation(level: number = 2): Promise<MensaTestResult> {
    console.log('\n🎓 MENSA SIMULATION TEST');
    console.log('=' .repeat(60));
    console.log('Questions: 30 (15 numerical + 15 verbal)');
    console.log('Time Limit: 45 minutes');
    console.log('Pass Requirement: IQ 130+ (Top 2%)');
    console.log('');

    const startTime = Date.now();
    let numericalCorrect = 0;
    let verbalCorrect = 0;

    // Get 15 numerical problems
    console.log('🔢 SECTION 1: Numerical Reasoning (15 questions)');
    console.log('-'.repeat(60));
    
    const numericalProblems = this.getMixedNumericalProblems(level, 15);
    for (const item of numericalProblems) {
      const result = this.simulateAnswer(item.problem, level);
      if (result) numericalCorrect++;
    }

    // Get 15 verbal problems
    console.log('\n📝 SECTION 2: Verbal Reasoning (15 questions)');
    console.log('-'.repeat(60));
    
    const verbalProblems = this.getMixedVerbalProblems(level, 15);
    for (const item of verbalProblems) {
      const result = this.simulateAnswer(item.problem, level);
      if (result) verbalCorrect++;
    }

    const endTime = Date.now();
    const timeTaken = Math.round((endTime - startTime) / 1000);

    // Calculate scores
    const totalCorrect = numericalCorrect + verbalCorrect;
    const totalQuestions = 30;
    const score = Math.round((totalCorrect / totalQuestions) * 100);
    const numericalScore = Math.round((numericalCorrect / 15) * 100);
    const verbalScore = Math.round((verbalCorrect / 15) * 100);

    // Estimate IQ (Mensa scale)
    const estimatedIQ = this.calculateIQ(score);
    const percentile = this.calculatePercentile(estimatedIQ);

    const result: MensaTestResult = {
      score,
      totalQuestions,
      correctAnswers: totalCorrect,
      timeTaken,
      numericalScore,
      verbalScore,
      estimatedIQ,
      percentile,
      mensaQualified: estimatedIQ >= 130
    };

    this.printResults(result);
    return result;
  }

  private getMixedNumericalProblems(level: number, count: number): Array<{problem: any, trainer: any}> {
    const problems: Array<{problem: any, trainer: any}> = [];
    
    for (const trainer of this.numericalModules) {
      const moduleProblems = trainer.getProblemsForLevel(level, 3);
      for (const problem of moduleProblems) {
        problems.push({ problem, trainer });
      }
    }

    return problems
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }

  private getMixedVerbalProblems(level: number, count: number): Array<{problem: any, trainer: any}> {
    const problems: Array<{problem: any, trainer: any}> = [];
    
    for (const trainer of this.verbalModules) {
      const moduleProblems = trainer.getProblemsForLevel(level, 5);
      for (const problem of moduleProblems) {
        problems.push({ problem, trainer });
      }
    }

    return problems
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }

  private simulateAnswer(problem: any, level: number): boolean {
    // Simulate answering based on difficulty and current level
    // Higher level = better performance
    const baseAccuracy = 0.5 + (level * 0.15);
    const isCorrect = Math.random() < baseAccuracy;
    
    // Simulate time taken
    const timeTaken = Math.floor(Math.random() * problem.timeLimit * 1000 * 0.7) + 5000;
    
    // Submit answer to trainer
    if ('correct' in problem && typeof problem.correct === 'number') {
      const answer = isCorrect ? problem.correct : (problem.correct + 1) % 4;
      // Don't actually submit during simulation to avoid polluting training data
    }

    return isCorrect;
  }

  private calculateIQ(score: number): number {
    // Mensa scoring curve approximation
    // 50% → 100 IQ, 75% → 115 IQ, 90% → 130 IQ, 98% → 145 IQ
    if (score >= 98) return 145;
    if (score >= 95) return 140;
    if (score >= 90) return 130;
    if (score >= 85) return 125;
    if (score >= 80) return 120;
    if (score >= 75) return 115;
    if (score >= 70) return 110;
    if (score >= 60) return 105;
    if (score >= 50) return 100;
    if (score >= 40) return 95;
    return 90;
  }

  private calculatePercentile(iq: number): number {
    if (iq >= 145) return 99.9;
    if (iq >= 140) return 99.6;
    if (iq >= 135) return 99;
    if (iq >= 130) return 98;
    if (iq >= 125) return 95;
    if (iq >= 120) return 91;
    if (iq >= 115) return 84;
    if (iq >= 110) return 75;
    if (iq >= 105) return 63;
    if (iq >= 100) return 50;
    if (iq >= 95) return 37;
    return 25;
  }

  private printResults(result: MensaTestResult): void {
    console.log('\n📊 TEST RESULTS');
    console.log('=' .repeat(60));
    console.log(`Overall Score: ${result.score}% (${result.correctAnswers}/${result.totalQuestions})`);
    console.log(`Numerical: ${result.numericalScore}%`);
    console.log(`Verbal: ${result.verbalScore}%`);
    console.log(`Time: ${Math.floor(result.timeTaken / 60)}m ${result.timeTaken % 60}s`);
    console.log('');
    console.log(`Estimated IQ: ${result.estimatedIQ}`);
    console.log(`Percentile: ${result.percentile}th`);
    console.log(`Mensa Qualified: ${result.mensaQualified ? '✅ YES!' : '❌ No'}`);
    
    if (result.mensaQualified) {
      console.log('\n🎉 Congratulations! You would qualify for Mensa!');
    } else {
      const gap = 130 - result.estimatedIQ;
      console.log(`\n📚 Need ${gap} more IQ points for Mensa qualification.`);
      console.log('💪 Keep practicing with the training modules!');
    }
  }

  /**
   * Run weekly assessment simulation
   */
  async runWeeklyAssessment(week: number): Promise<MensaTestResult> {
    console.log(`\n📅 WEEK ${week} ASSESSMENT`);
    const level = week <= 2 ? 1 : week <= 4 ? 2 : 3;
    return this.runSimulation(level);
  }
}

export const mensaSimulation = new MensaSimulationTest();
