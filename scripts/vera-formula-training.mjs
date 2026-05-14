/**
 * Vera Formula-Injected Assessment
 * Provides formulas BEFORE problems to test skill acquisition
 */

import { speedMathTraining } from '../dist/training/numerical/speedMath.js';
import { percentagesTraining } from '../dist/training/numerical/percentages.js';
import { ratiosTraining } from '../dist/training/numerical/ratios.js';
import { workRateTraining } from '../dist/training/numerical/workRate.js';
import { sequencesTraining } from '../dist/training/numerical/sequences.js';
import { geometryTraining } from '../dist/training/numerical/geometry.js';
import { analogiesTraining } from '../dist/training/verbal/analogies.js';
import { vocabularyTraining } from '../dist/training/verbal/vocabulary.js';
import { oddOneOutTraining } from '../dist/training/verbal/oddOneOut.js';
import { logicTraining } from '../dist/training/verbal/logic.js';
import { anagramsTraining } from '../dist/training/verbal/anagrams.js';
import { createProvider } from '../dist/llm/realProvider.js';
import { getFormulaPrompt } from '../dist/training/formulaInjection.js';

const results = [];

async function runFormulaInjectedAssessment() {
  console.log('🧠 VERA FORMULA-INJECTED ASSESSMENT');
  console.log('='.repeat(70));
  console.log('Pre-training formulas, then testing retention');
  console.log('Comparing: Baseline (55%) → With Formulas → Target (85%)');
  console.log('');

  const llm = createProvider();
  const startTime = Date.now();

  // WEAK AREAS - Test with formula injection
  console.log('\n🔴 CRITICAL WEAK AREAS (With Formula Support)');
  console.log('-'.repeat(70));

  await assessWorkRateWithFormulas(llm);
  await assessSpeedMathWithFormulas(llm);
  await assessPercentagesWithFormulas(llm);
  await assessLogicWithFormulas(llm);

  // STRONG AREAS - Baseline comparison
  console.log('\n🟢 STRONG AREAS (No formulas needed)');
  console.log('-'.repeat(70));

  await assessSequences(llm);
  await assessGeometry(llm);

  // REPORT
  const endTime = Date.now();
  generateComparisonReport(endTime - startTime);
}

async function assessWorkRateWithFormulas(llm) {
  console.log('👷 Work Rate (+Formulas)...');
  const formulaPrompt = getFormulaPrompt('workRate');
  const problems = workRateTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems) {
    const prompt = `${formulaPrompt}NOW SOLVE:
${p.question}

Respond with ONLY the numerical answer (in hours or days).`;

    const start = Date.now();
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0
    });
    const timeTaken = Date.now() - start;
    
    const veraAnswer = parseFloat(response.content.trim());
    const isCorrect = Math.abs(veraAnswer - p.answer) < 0.1;
    
    results.push({
      module: 'workRate',
      withFormulas: true,
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken
    });

    workRateTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessSpeedMathWithFormulas(llm) {
  console.log('🏎️  Speed Math (+Formulas)...');
  const formulaPrompt = getFormulaPrompt('speedMath');
  const problems = speedMathTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems) {
    const prompt = `${formulaPrompt}NOW SOLVE:
${p.question}

Given: Speed = ${p.given.speed}${p.unit}, Distance = ${p.given.distance}${p.unit}
Calculate the time needed.

Respond with ONLY the numerical answer.`;

    const start = Date.now();
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0
    });
    const timeTaken = Date.now() - start;
    
    const veraAnswer = parseFloat(response.content.trim());
    const isCorrect = Math.abs(veraAnswer - p.answer) < 0.01;
    
    results.push({
      module: 'speedMath',
      withFormulas: true,
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken
    });

    speedMathTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessPercentagesWithFormulas(llm) {
  console.log('📊 Percentages (+Formulas)...');
  const formulaPrompt = getFormulaPrompt('percentages');
  const problems = percentagesTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems) {
    const prompt = `${formulaPrompt}NOW SOLVE:
${p.question}

Respond with ONLY the numerical answer.`;

    const start = Date.now();
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0
    });
    const timeTaken = Date.now() - start;
    
    const veraAnswer = parseFloat(response.content.trim());
    const isCorrect = Math.abs(veraAnswer - p.answer) < 0.01;
    
    results.push({
      module: 'percentages',
      withFormulas: true,
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken
    });

    percentagesTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessLogicWithFormulas(llm) {
  console.log('🧩 Logic (+Patterns)...');
  const formulaPrompt = getFormulaPrompt('logic');
  const problems = logicTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems) {
    let prompt = `${formulaPrompt}NOW SOLVE:\n`;
    
    if (p.type === 'syllogism') {
      prompt += `${p.premise1}\n${p.premise2}\n${p.question}\n\nOptions: ${p.options.join(', ')}\n\nRespond with ONLY the number (0-3).`;
    } else {
      prompt += `${p.scenario}\n${p.question}\n\nOptions: ${p.options.join(', ')}\n\nRespond with ONLY the number (0-3).`;
    }

    const start = Date.now();
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0
    });
    const timeTaken = Date.now() - start;
    
    const veraAnswer = parseInt(response.content.trim());
    const isCorrect = veraAnswer === p.correct;
    
    results.push({
      module: 'logic',
      withFormulas: true,
      problemId: p.id,
      question: p.question,
      correctAnswer: p.correct,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken
    });

    logicTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessSequences(llm) {
  console.log('🔢 Sequences (Baseline)...');
  const problems = sequencesTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    const prompt = `Find the next number: ${p.sequence.join(', ')}, ?\n\nRespond with ONLY the number.`;

    const start = Date.now();
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0
    });
    const timeTaken = Date.now() - start;
    
    const veraAnswer = parseFloat(response.content.trim());
    const isCorrect = veraAnswer === p.answer;
    
    results.push({
      module: 'sequences',
      withFormulas: false,
      problemId: p.id,
      isCorrect,
      timeTaken
    });

    sequencesTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessGeometry(llm) {
  console.log('📐 Geometry (Baseline)...');
  const problems = geometryTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 4)) {
    const prompt = `Solve: ${p.question}\nRespond with ONLY the number.`;

    const start = Date.now();
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0
    });
    const timeTaken = Date.now() - start;
    
    const veraAnswer = parseFloat(response.content.trim());
    const isCorrect = Math.abs(veraAnswer - p.answer) < 0.01;
    
    results.push({
      module: 'geometry',
      withFormulas: false,
      problemId: p.id,
      isCorrect,
      timeTaken
    });

    geometryTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

function generateComparisonReport(totalTime) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 FORMULA INJECTION RESULTS');
  console.log('='.repeat(70));
  
  const byModule = {};
  for (const r of results) {
    if (!byModule[r.module]) {
      byModule[r.module] = { total: 0, correct: 0, withFormulas: r.withFormulas };
    }
    byModule[r.module].total++;
    if (r.isCorrect) byModule[r.module].correct++;
  }
  
  console.log('\n📈 Accuracy Comparison:');
  console.log('-'.repeat(70));
  console.log('Module            | Baseline | +Formulas | Improvement');
  console.log('-'.repeat(70));
  
  const baselines = {
    workRate: 0,
    speedMath: 40,
    percentages: 40,
    logic: 40,
    sequences: 100,
    geometry: 100
  };
  
  let totalBaseline = 0;
  let totalNew = 0;
  let count = 0;
  
  for (const [module, stats] of Object.entries(byModule)) {
    const baseline = baselines[module] || 50;
    const newAcc = Math.round((stats.correct / stats.total) * 100);
    const improvement = newAcc - baseline;
    const symbol = improvement > 0 ? '↑' : improvement < 0 ? '↓' : '=';
    
    console.log(`${module.padEnd(17)} | ${baseline.toString().padStart(3)}%    | ${newAcc.toString().padStart(3)}%      | ${symbol}${Math.abs(improvement)}%`);
    
    totalBaseline += baseline;
    totalNew += newAcc;
    count++;
  }
  
  console.log('-'.repeat(70));
  const avgBaseline = Math.round(totalBaseline / count);
  const avgNew = Math.round(totalNew / count);
  const avgImprovement = avgNew - avgBaseline;
  
  console.log(`AVERAGE           | ${avgBaseline.toString().padStart(3)}%    | ${avgNew.toString().padStart(3)}%      | ↑${avgImprovement}%`);
  
  // IQ estimates
  console.log('\n🧠 IQ Estimate:');
  console.log(`  Baseline (no formulas):   ${getIQ(avgBaseline)}`);
  console.log(`  With formula injection:   ${getIQ(avgNew)}`);
  console.log(`  Gap to Mensa (130 IQ):    ${130 - getIQ(avgNew)} points`);
  
  // Training recommendation
  console.log('\n📋 Training Strategy:');
  const weakModules = Object.entries(byModule)
    .filter(([m, s]) => (s.correct / s.total) * 100 < 70)
    .map(([m]) => m);
  
  if (weakModules.length > 0) {
    console.log(`  Focus areas: ${weakModules.join(', ')}`);
    console.log('  Recommendation: Repeat with formula injection until 70%+');
    console.log('  Then: Remove formulas to test true skill acquisition');
  } else {
    console.log('  ✅ All modules above 70% with formula support');
    console.log('  Next: Test WITHOUT formulas to verify skill retention');
  }
  
  console.log('\n' + '='.repeat(70));
}

function getIQ(accuracy) {
  if (accuracy >= 95) return 140;
  if (accuracy >= 90) return 135;
  if (accuracy >= 85) return 130;
  if (accuracy >= 80) return 125;
  if (accuracy >= 75) return 120;
  if (accuracy >= 70) return 115;
  if (accuracy >= 65) return 110;
  return 100;
}

// Run
runFormulaInjectedAssessment().catch(err => {
  console.error('Assessment failed:', err);
  process.exit(1);
});
