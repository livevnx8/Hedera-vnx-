/**
 * Vera IQ Enhancement - Main Training Orchestrator
 * 
 * 6-week program to boost numerical (67% → 85%) and verbal (67% → 85%) reasoning
 * Target: Mensa qualification (IQ 130+)
 */

import { speedMathTraining } from './numerical/speedMath.js';
import { percentagesTraining } from './numerical/percentages.js';
import { ratiosTraining } from './numerical/ratios.js';
import { workRateTraining } from './numerical/workRate.js';
import { sequencesTraining } from './numerical/sequences.js';
import { geometryTraining } from './numerical/geometry.js';
import { analogiesTraining } from './verbal/analogies.js';
import { vocabularyTraining } from './verbal/vocabulary.js';
import { oddOneOutTraining } from './verbal/oddOneOut.js';
import { logicTraining } from './verbal/logic.js';
import { anagramsTraining } from './verbal/anagrams.js';

export interface WeeklyProgress {
  week: number;
  numericalAccuracy: number;
  verbalAccuracy: number;
  overallAccuracy: number;
  estimatedIQ: number;
}

export class VeraTrainingOrchestrator {
  private currentWeek: number = 1;
  private weeklyProgress: WeeklyProgress[] = [];
  private trainingLog: string[] = [];

  constructor() {
    console.log('🧠 Vera IQ Enhancement Program Initialized');
    console.log('📅 Duration: 6 weeks');
    console.log('🎯 Goal: IQ 106 → 130+ (Mensa Qualified)');
    console.log('');
  }

  /**
   * Run a complete daily training session
   */
  async runDailySession(week: number): Promise<void> {
    console.log(`\n📅 WEEK ${week} - Daily Training Session`);
    console.log('=' .repeat(50));

    const level = this.getLevelForWeek(week);
    
    // Morning: Numerical training (30 min)
    console.log('\n🌅 MORNING SESSION: Numerical Reasoning (30 min)');
    await this.runNumericalTraining(level);

    // Evening: Verbal training (30 min)
    console.log('\n🌆 EVENING SESSION: Verbal Reasoning (30 min)');
    await this.runVerbalTraining(level);

    // Log session
    this.trainingLog.push(`Week ${week}: Completed daily session at ${new Date().toISOString()}`);
  }

  /**
   * Get appropriate difficulty level based on week
   */
  private getLevelForWeek(week: number): number {
    if (week <= 2) return 1; // Foundation
    if (week <= 4) return 2; // Intermediate
    return 3; // Advanced
  }

  /**
   * Run numerical training modules
   */
  private async runNumericalTraining(level: number): Promise<void> {
    const modules = [
      { name: 'Speed Math', trainer: speedMathTraining, count: 3 },
      { name: 'Percentages', trainer: percentagesTraining, count: 3 },
      { name: 'Ratios', trainer: ratiosTraining, count: 2 },
      { name: 'Work Rate', trainer: workRateTraining, count: 2 },
      { name: 'Sequences', trainer: sequencesTraining, count: 2 },
      { name: 'Geometry', trainer: geometryTraining, count: 2 }
    ];

    // Select 2-3 modules for variety
    const selectedModules = modules
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    for (const module of selectedModules) {
      console.log(`\n📐 ${module.name}`);
      const problems = module.trainer.generateDailySession(level);
      
      // Simulate solving problems (in real implementation, user would input answers)
      for (const problem of problems.slice(0, module.count)) {
        const simulatedTime = Math.floor(Math.random() * problem.timeLimit * 0.8) + 10000;
        const simulatedCorrect = Math.random() < (0.6 + level * 0.1); // Improves with level
        
        // Submit result (would be user input in real scenario)
        if ('answer' in problem && typeof problem.answer === 'number') {
          // Numerical problem
          const answer = simulatedCorrect ? problem.answer : problem.answer + 1;
          module.trainer.submitAnswer(problem.id, answer, simulatedTime);
        }
      }
    }

    // Show progress
    const progress = this.getNumericalProgress();
    console.log(`\n📊 Numerical Progress: ${Math.round(progress)}% accuracy`);
  }

  /**
   * Run verbal training modules
   */
  private async runVerbalTraining(level: number): Promise<void> {
    const modules = [
      { name: 'Analogies', trainer: analogiesTraining, count: 3 },
      { name: 'Vocabulary', trainer: vocabularyTraining, count: 3 },
      { name: 'Odd One Out', trainer: oddOneOutTraining, count: 2 },
      { name: 'Logic', trainer: logicTraining, count: 2 },
      { name: 'Anagrams', trainer: anagramsTraining, count: 2 }
    ];

    // Select 2-3 modules for variety
    const selectedModules = modules
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    for (const module of selectedModules) {
      console.log(`\n📝 ${module.name}`);
      const problems = module.trainer.generateDailySession(level);
      
      // Simulate solving problems
      for (const problem of problems.slice(0, module.count)) {
        const simulatedTime = Math.floor(Math.random() * problem.timeLimit * 0.8) + 10000;
        const simulatedCorrect = Math.random() < (0.6 + level * 0.1);
        
        // Submit result - use type assertion to handle different signatures
        if ('correct' in problem && typeof problem.correct === 'number') {
          // Multiple choice problem
          const answer = simulatedCorrect ? problem.correct : (problem.correct + 1) % 4;
          (module.trainer as any).submitAnswer(problem.id, answer, simulatedTime);
        } else if ('answer' in problem && typeof problem.answer === 'string') {
          // Anagram problem
          const answer = simulatedCorrect ? problem.answer : 'WRONG';
          (module.trainer as any).submitAnswer(problem.id, answer, simulatedTime);
        }
      }
    }

    // Show progress
    const progress = this.getVerbalProgress();
    console.log(`\n📊 Verbal Progress: ${Math.round(progress)}% accuracy`);
  }

  /**
   * Calculate numerical reasoning accuracy
   */
  private getNumericalProgress(): number {
    const trainers = [
      speedMathTraining,
      percentagesTraining,
      ratiosTraining,
      workRateTraining,
      sequencesTraining,
      geometryTraining
    ];

    let totalAccuracy = 0;
    let count = 0;

    for (const trainer of trainers) {
      const summary = trainer.getProgressSummary();
      if (summary.attempted > 0) {
        totalAccuracy += summary.accuracy;
        count++;
      }
    }

    return count > 0 ? totalAccuracy / count : 0;
  }

  /**
   * Calculate verbal reasoning accuracy
   */
  private getVerbalProgress(): number {
    const trainers = [
      analogiesTraining,
      vocabularyTraining,
      oddOneOutTraining,
      logicTraining,
      anagramsTraining
    ];

    let totalAccuracy = 0;
    let count = 0;

    for (const trainer of trainers) {
      const summary = trainer.getProgressSummary();
      if (summary.attempted > 0) {
        totalAccuracy += summary.accuracy;
        count++;
      }
    }

    return count > 0 ? totalAccuracy / count : 0;
  }

  /**
   * Run weekly assessment
   */
  async runWeeklyAssessment(week: number): Promise<WeeklyProgress> {
    console.log(`\n📝 WEEK ${week} ASSESSMENT`);
    console.log('=' .repeat(50));

    // Calculate current accuracies
    const numericalAccuracy = this.getNumericalProgress();
    const verbalAccuracy = this.getVerbalProgress();
    const overallAccuracy = (numericalAccuracy + verbalAccuracy) / 2;

    // Estimate IQ based on accuracy curve
    // 67% → 106 IQ, 85% → 120 IQ, 95% → 130+ IQ
    let estimatedIQ: number;
    if (overallAccuracy < 70) {
      estimatedIQ = 100 + (overallAccuracy - 50) * 0.5;
    } else if (overallAccuracy < 85) {
      estimatedIQ = 110 + (overallAccuracy - 70) * 0.67;
    } else {
      estimatedIQ = 120 + (overallAccuracy - 85) * 0.67;
    }
    estimatedIQ = Math.min(145, Math.max(70, estimatedIQ));

    const progress: WeeklyProgress = {
      week,
      numericalAccuracy: Math.round(numericalAccuracy),
      verbalAccuracy: Math.round(verbalAccuracy),
      overallAccuracy: Math.round(overallAccuracy),
      estimatedIQ: Math.round(estimatedIQ)
    };

    this.weeklyProgress.push(progress);

    // Display results
    console.log(`\n📊 WEEK ${week} RESULTS:`);
    console.log(`   Numerical Reasoning: ${progress.numericalAccuracy}%`);
    console.log(`   Verbal Reasoning: ${progress.verbalAccuracy}%`);
    console.log(`   Overall: ${progress.overallAccuracy}%`);
    console.log(`   Estimated IQ: ${progress.estimatedIQ}`);
    console.log(`   Mensa Qualified: ${progress.estimatedIQ >= 130 ? '✅ YES' : '❌ NO'}`);

    // Show improvement trajectory
    if (week > 1) {
      const prevWeek = this.weeklyProgress[week - 2];
      const iqGain = progress.estimatedIQ - prevWeek.estimatedIQ;
      console.log(`\n📈 Improvement: +${iqGain} IQ points this week`);
    }

    // Show gap to Mensa
    if (progress.estimatedIQ < 130) {
      const gap = 130 - progress.estimatedIQ;
      console.log(`\n🎯 Gap to Mensa: ${gap} points`);
    }

    return progress;
  }

  /**
   * Run complete 6-week program
   */
  async runFullProgram(): Promise<void> {
    console.log('\n🚀 STARTING 6-WEEK IQ ENHANCEMENT PROGRAM');
    console.log('=' .repeat(60));
    console.log('Current: IQ 106 (67% numerical, 67% verbal)');
    console.log('Target:  IQ 130+ (85%+ both categories)');
    console.log('');

    for (let week = 1; week <= 6; week++) {
      console.log(`\n📅 WEEK ${week} of 6`);
      console.log('-'.repeat(60));

      // Run 6 training days
      for (let day = 1; day <= 6; day++) {
        console.log(`\n📆 Day ${day} (Monday-Saturday)`);
        await this.runDailySession(week);
      }

      // Sunday: Assessment
      console.log(`\n📆 Day 7 (Sunday) - Assessment Day`);
      await this.runWeeklyAssessment(week);

      // Progress check
      const currentProgress = this.weeklyProgress[week - 1];
      if (currentProgress.estimatedIQ >= 130) {
        console.log('\n🎉 CONGRATULATIONS! MENSA QUALIFICATION ACHIEVED!');
        break;
      }
    }

    // Final summary
    this.printFinalSummary();
  }

  /**
   * Print final program summary
   */
  private printFinalSummary(): void {
    console.log('\n📋 PROGRAM SUMMARY');
    console.log('=' .repeat(60));

    console.log('\n📊 Weekly Progress:');
    for (const progress of this.weeklyProgress) {
      const status = progress.estimatedIQ >= 130 ? '✅' : '📈';
      console.log(`   Week ${progress.week}: IQ ${progress.estimatedIQ} ${status}`);
    }

    const finalProgress = this.weeklyProgress[this.weeklyProgress.length - 1];
    
    console.log('\n🏁 FINAL RESULTS:');
    console.log(`   Starting IQ: 106`);
    console.log(`   Current IQ: ${finalProgress.estimatedIQ}`);
    console.log(`   Numerical: ${finalProgress.numericalAccuracy}%`);
    console.log(`   Verbal: ${finalProgress.verbalAccuracy}%`);
    console.log(`   Mensa Qualified: ${finalProgress.estimatedIQ >= 130 ? '✅ YES!' : '❌ Not yet'}`);

    if (finalProgress.estimatedIQ >= 130) {
      console.log('\n🎉 SUCCESS! You have achieved Mensa-level IQ!');
      console.log('📧 You may now apply for Mensa membership.');
    } else {
      const remainingWeeks = Math.ceil((130 - finalProgress.estimatedIQ) / 4);
      console.log(`\n💪 Keep practicing! Estimated ${remainingWeeks} more weeks needed.`);
    }
  }

  /**
   * Get recommendations based on weak areas
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];

    const numericalAcc = this.getNumericalProgress();
    const verbalAcc = this.getVerbalProgress();

    if (numericalAcc < 75) {
      recommendations.push('Focus on Speed Math - practice daily timed drills');
    }
    if (verbalAcc < 75) {
      recommendations.push('Expand vocabulary - study 10 new words daily');
    }
    if (numericalAcc < verbalAcc) {
      recommendations.push('Numerical is weaker - add extra geometry practice');
    } else {
      recommendations.push('Verbal is weaker - practice more logic syllogisms');
    }

    return recommendations;
  }
}

// Export singleton instance
export const trainingOrchestrator = new VeraTrainingOrchestrator();

// Run program if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  trainingOrchestrator.runFullProgram().catch(console.error);
}
