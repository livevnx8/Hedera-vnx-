/**
 * Vera Comprehensive Training System
 * Implements A (isolated training), B (adaptive methods), C (high-impact focus)
 */

import { speedMathTraining } from '../dist/training/numerical/speedMath.js';
import { percentagesTraining } from '../dist/training/numerical/percentages.js';
import { workRateTraining } from '../dist/training/numerical/workRate.js';
import { logicTraining } from '../dist/training/verbal/logic.js';
import { sequencesTraining } from '../dist/training/numerical/sequences.js';
import { geometryTraining } from '../dist/training/numerical/geometry.js';
import { createProvider } from '../dist/llm/realProvider.js';

// Approach B: Adaptive method selection based on skill type
const ADAPTIVE_METHODS = {
  speedMath: {
    type: 'procedural',
    method: 'formula-drill',
    intervention: 'DST-triangle'
  },
  workRate: {
    type: 'procedural', 
    method: 'micro-training',
    intervention: 'rate-concept'
  },
  percentages: {
    type: 'conceptual',
    method: 'worked-example',
    intervention: 'multiplier-technique'
  },
  logic: {
    type: 'pattern-recognition',
    method: 'pattern-drill',
    intervention: 'syllogism-patterns'
  },
  sequences: {
    type: 'pattern-recognition',
    method: 'none-needed',
    intervention: null
  },
  geometry: {
    type: 'procedural',
    method: 'formula-drill',
    intervention: null
  }
};

const results = {
  baseline: {},
  trained: {},
  retention: {}
};

async function runComprehensiveTraining() {
  console.log('🎯 VERA COMPREHENSIVE TRAINING SYSTEM');
  console.log('='.repeat(70));
  console.log('A: Isolated per-module training');
  console.log('B: Adaptive method selection');
  console.log('C: High-impact focus (speed math + percentages)');
  console.log('='.repeat(70));

  const llm = createProvider();

  // ============================================
  // PHASE 1: Baseline Assessment (All Modules)
  // ============================================
  console.log('\n📊 PHASE 1: Baseline Assessment');
  console.log('-'.repeat(70));
  
  await assessBaseline(llm, 'speedMath');
  await assessBaseline(llm, 'percentages');
  await assessBaseline(llm, 'workRate');
  await assessBaseline(llm, 'logic');
  await assessBaseline(llm, 'sequences');
  await assessBaseline(llm, 'geometry');
  
  // ============================================
  // PHASE 2: Isolated Training (Per Module)
  // ============================================
  console.log('\n📚 PHASE 2: Isolated Training (A)');
  console.log('-'.repeat(70));
  
  // Approach C: Focus on high-impact areas first
  console.log('\n🔥 HIGH-IMPACT FOCUS (C): Speed Math + Percentages');
  await isolatedTraining(llm, 'speedMath');
  await isolatedTraining(llm, 'percentages');
  
  // Then train other areas
  console.log('\n📖 Other Modules:');
  await isolatedTraining(llm, 'workRate');
  await isolatedTraining(llm, 'logic');
  
  // ============================================
  // PHASE 3: Post-Training Assessment
  // ============================================
  console.log('\n📊 PHASE 3: Post-Training Assessment');
  console.log('-'.repeat(70));
  
  await assessTrained(llm, 'speedMath');
  await assessTrained(llm, 'percentages');
  await assessTrained(llm, 'workRate');
  await assessTrained(llm, 'logic');
  await assessTrained(llm, 'sequences');
  await assessTrained(llm, 'geometry');
  
  // ============================================
  // PHASE 4: Retention Test (5 min delay)
  // ============================================
  console.log('\n⏱️  PHASE 4: Retention Test (A)');
  console.log('-'.repeat(70));
  console.log('Waiting 5 minutes to test skill retention...');
  
  await delay(5 * 60 * 1000); // 5 minutes
  
  await assessRetention(llm, 'speedMath');
  await assessRetention(llm, 'percentages');
  await assessRetention(llm, 'workRate');
  await assessRetention(llm, 'logic');
  
  // ============================================
  // FINAL REPORT
  // ============================================
  generateComprehensiveReport();
}

// ============================================
// BASELINE ASSESSMENT
// ============================================
async function assessBaseline(llm, module) {
  const problems = getProblems(module, 3);
  let correct = 0;
  
  for (const p of problems) {
    const answer = await getAnswer(llm, module, p, false);
    if (checkCorrect(module, answer, p)) correct++;
  }
  
  const accuracy = Math.round((correct / problems.length) * 100);
  results.baseline[module] = accuracy;
  
  const method = ADAPTIVE_METHODS[module];
  console.log(`  ${module.padEnd(14)} | ${accuracy.toString().padStart(3)}% | ${method.type} | ${method.method}`);
}

// ============================================
// APPROACH B: ADAPTIVE TRAINING
// ============================================
async function isolatedTraining(llm, module) {
  const method = ADAPTIVE_METHODS[module];
  console.log(`\n🎓 ${module.toUpperCase()}: ${method.method}`);
  
  switch (method.method) {
    case 'formula-drill':
      await trainFormulaDrill(llm, module);
      break;
    case 'micro-training':
      await trainMicroSteps(llm, module);
      break;
    case 'worked-example':
      await trainWorkedExample(llm, module);
      break;
    case 'pattern-drill':
      await trainPatternDrill(llm, module);
      break;
    case 'none-needed':
      console.log(`  Skipping (baseline already strong)`);
      break;
  }
}

async function trainFormulaDrill(llm, module) {
  // Speed math: DST triangle
  if (module === 'speedMath') {
    const prompt = `Learn this formula:

DISTANCE-SPEED-TIME TRIANGLE:
        D
       / \\
      S × T

- Distance = Speed × Time
- Speed = Distance / Time
- Time = Distance / Speed

Practice: Speed = 60 km/h, Time = 2 hours. Distance?`;

    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0
    });
    
    console.log(`  DST Triangle: ${response.content.includes('120') ? '✅' : '❌'}`);
  }
}

async function trainMicroSteps(llm, module) {
  // Work rate: tiny steps
  if (module === 'workRate') {
    // Step 1: Rate concept
    const step1 = await llm.chat({
      messages: [{ 
        role: 'user', 
        content: 'If worker takes 4 days, rate = 1/4 per day. Worker takes 8 days, rate = ?' 
      }],
      max_tokens: 20,
      temperature: 0
    });
    const s1 = step1.content.includes('1/8') || step1.content.includes('0.125');
    console.log(`  Step 1 (Rate): ${s1 ? '✅' : '❌'}`);
    
    // Step 2: Combined rate
    const step2 = await llm.chat({
      messages: [{ 
        role: 'user', 
        content: 'A: 6 days (rate=1/6), B: 3 days (rate=1/3=2/6). Combined rate = 1/6+2/6=3/6=1/2. Time = 2 days. Now: A=4 days, B=4 days. Together?' 
      }],
      max_tokens: 20,
      temperature: 0
    });
    const s2 = step2.content.includes('2');
    console.log(`  Step 2 (Combined): ${s2 ? '✅' : '❌'}`);
    
    // Step 3: Multiple workers
    const step3 = await llm.chat({
      messages: [{ 
        role: 'user', 
        content: '4 workers, each takes 8 days. Time together = 8/4 = ?' 
      }],
      max_tokens: 20,
      temperature: 0
    });
    const s3 = step3.content.includes('2');
    console.log(`  Step 3 (Multiple): ${s3 ? '✅' : '❌'}`);
  }
}

async function trainWorkedExample(llm, module) {
  // Percentages: Show then practice
  if (module === 'percentages') {
    const example = `EXAMPLE: Price $80 increases by 25%

Step 1: Convert % to multiplier: 25% = 1.25
Step 2: Multiply: $80 × 1.25 = $100

NOW YOU: Price $60 decreases by 20%. New price?`;

    const response = await llm.chat({
      messages: [{ role: 'user', content: example }],
      max_tokens: 50,
      temperature: 0
    });
    
    console.log(`  Worked Example: ${response.content.includes('48') ? '✅' : '❌'}`);
  }
}

async function trainPatternDrill(llm, module) {
  // Logic: Pattern recognition
  if (module === 'logic') {
    const pattern = `PATTERN: All A are B, All B are C → All A are C ✓

Example: All dogs are mammals, all mammals are animals → All dogs are animals ✓

NOW: All squares are rectangles, all rectangles are shapes. Conclusion?`;

    const response = await llm.chat({
      messages: [{ role: 'user', content: pattern }],
      max_tokens: 50,
      temperature: 0
    });
    
    const correct = response.content.toLowerCase().includes('squares') && 
                    response.content.toLowerCase().includes('shapes');
    console.log(`  Pattern Drill: ${correct ? '✅' : '❌'}`);
  }
}

// ============================================
// POST-TRAINING ASSESSMENT
// ============================================
async function assessTrained(llm, module) {
  const problems = getProblems(module, 3);
  let correct = 0;
  
  for (const p of problems) {
    const answer = await getAnswer(llm, module, p, false);
    if (checkCorrect(module, answer, p)) correct++;
  }
  
  const accuracy = Math.round((correct / problems.length) * 100);
  results.trained[module] = accuracy;
  
  const baseline = results.baseline[module];
  const improvement = accuracy - baseline;
  const symbol = improvement > 0 ? '↑' : improvement < 0 ? '↓' : '=';
  
  console.log(`  ${module.padEnd(14)} | ${baseline.toString().padStart(3)}% → ${accuracy.toString().padStart(3)}% | ${symbol}${Math.abs(improvement)}%`);
}

// ============================================
// RETENTION TEST
// ============================================
async function assessRetention(llm, module) {
  const problems = getProblems(module, 3);
  let correct = 0;
  
  for (const p of problems) {
    const answer = await getAnswer(llm, module, p, false);
    if (checkCorrect(module, answer, p)) correct++;
  }
  
  const accuracy = Math.round((correct / problems.length) * 100);
  results.retention[module] = accuracy;
  
  const trained = results.trained[module];
  const retentionLoss = trained - accuracy;
  
  console.log(`  ${module.padEnd(14)} | ${trained.toString().padStart(3)}% → ${accuracy.toString().padStart(3)}% | Loss: ${retentionLoss}%`);
}

// ============================================
// HELPERS
// ============================================
function getProblems(module, count) {
  switch (module) {
    case 'speedMath': return speedMathTraining.getProblemsForLevel(1, count);
    case 'percentages': return percentagesTraining.getProblemsForLevel(1, count);
    case 'workRate': return workRateTraining.getProblemsForLevel(1, count);
    case 'logic': return logicTraining.getProblemsForLevel(1, count);
    case 'sequences': return sequencesTraining.getProblemsForLevel(1, count);
    case 'geometry': return geometryTraining.getProblemsForLevel(1, count);
    default: return [];
  }
}

async function getAnswer(llm, module, problem, withHelp) {
  // Simplified - just get answer
  let prompt = '';
  
  switch (module) {
    case 'speedMath':
      const { speed, distance, time } = problem.given;
      if (speed !== undefined && time !== undefined) {
        prompt = `Speed = ${speed}${problem.unit}, Time = ${time} hours. Distance?`;
      } else if (speed !== undefined && distance !== undefined) {
        prompt = `Speed = ${speed}${problem.unit}, Distance = ${distance}${problem.unit}. Time?`;
      } else {
        prompt = `Distance = ${distance}${problem.unit}, Time = ${time} hours. Speed?`;
      }
      break;
    case 'percentages':
    case 'workRate':
      prompt = `${problem.question}\nAnswer with just the number.`;
      break;
    case 'logic':
      prompt = problem.type === 'syllogism' 
        ? `${problem.premise1}\n${problem.premise2}\n${problem.question}\nAnswer 0-3.`
        : `${problem.scenario}\n${problem.question}\nAnswer 0-3.`;
      break;
    default:
      prompt = `${problem.question}\nAnswer with number.`;
  }
  
  const response = await llm.chat({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 20,
    temperature: 0
  });
  
  return response.content.trim();
}

function checkCorrect(module, answer, problem) {
  const num = parseFloat(answer);
  if (isNaN(num)) return false;
  
  switch (module) {
    case 'logic':
      return num === problem.correct;
    case 'workRate':
      return Math.abs(num - problem.answer) < 0.1;
    default:
      return Math.abs(num - problem.answer) < 0.01;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// COMPREHENSIVE REPORT
// ============================================
function generateComprehensiveReport() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 COMPREHENSIVE TRAINING RESULTS');
  console.log('='.repeat(70));
  
  console.log('\nModule         | Baseline | Trained | Retention | Method');
  console.log('-'.repeat(70));
  
  let totalBase = 0;
  let totalTrain = 0;
  let totalRet = 0;
  let count = 0;
  
  for (const module of Object.keys(results.baseline)) {
    const base = results.baseline[module] || 0;
    const train = results.trained[module] || 0;
    const ret = results.retention[module] || train;
    const method = ADAPTIVE_METHODS[module]?.method || 'none';
    
    console.log(`${module.padEnd(14)} | ${base.toString().padStart(3)}%     | ${train.toString().padStart(3)}%    | ${ret.toString().padStart(3)}%      | ${method}`);
    
    totalBase += base;
    totalTrain += train;
    totalRet += ret;
    count++;
  }
  
  console.log('-'.repeat(70));
  const avgBase = Math.round(totalBase / count);
  const avgTrain = Math.round(totalTrain / count);
  const avgRet = Math.round(totalRet / count);
  
  console.log(`AVERAGE        | ${avgBase.toString().padStart(3)}%     | ${avgTrain.toString().padStart(3)}%    | ${avgRet.toString().padStart(3)}%`);
  
  // IQ estimates
  console.log('\n🧠 IQ Estimates:');
  console.log(`  Baseline:  ${getIQ(avgBase)}`);
  console.log(`  Trained:   ${getIQ(avgTrain)}`);
  console.log(`  Retention: ${getIQ(avgRet)}`);
  
  // High-impact analysis (Approach C)
  console.log('\n🔥 HIGH-IMPACT ANALYSIS (C):');
  const highImpactModules = ['speedMath', 'percentages'];
  let hiBase = 0, hiTrain = 0, hiRet = 0;
  
  for (const m of highImpactModules) {
    hiBase += results.baseline[m] || 0;
    hiTrain += results.trained[m] || 0;
    hiRet += results.retention[m] || (results.trained[m] || 0);
  }
  
  console.log(`  Speed Math + Percentages:`);
  console.log(`    Before: ${Math.round(hiBase/2)}% → After: ${Math.round(hiTrain/2)}% → Retention: ${Math.round(hiRet/2)}%`);
  
  // Approach B: Adaptive effectiveness
  console.log('\n🎯 ADAPTIVE METHOD EFFECTIVENESS (B):');
  for (const [module, method] of Object.entries(ADAPTIVE_METHODS)) {
    const base = results.baseline[module] || 0;
    const train = results.trained[module] || 0;
    const improvement = train - base;
    const effectiveness = improvement > 10 ? 'HIGH' : improvement > 0 ? 'MODERATE' : improvement < 0 ? 'NEGATIVE' : 'NONE';
    
    console.log(`  ${method.method.padEnd(18)} | ${module.padEnd(12)} | ${effectiveness}`);
  }
  
  // Recommendations
  console.log('\n📋 RECOMMENDATIONS:');
  
  const weakRetention = Object.entries(results.retention)
    .filter(([m, r]) => (results.trained[m] || 0) - r > 20)
    .map(([m]) => m);
  
  if (weakRetention.length > 0) {
    console.log(`  ⚠️  Weak retention in: ${weakRetention.join(', ')}`);
    console.log(`      Needs: Spaced repetition (review every 24h, 72h, 7d)`);
  }
  
  const failedTraining = Object.entries(results.trained)
    .filter(([m, t]) => t < (results.baseline[m] || 0))
    .map(([m]) => m);
  
  if (failedTraining.length > 0) {
    console.log(`  ❌ Methods failed for: ${failedTraining.join(', ')}`);
    console.log(`      Needs: Different intervention strategy`);
  }
  
  const successStories = Object.entries(results.trained)
    .filter(([m, t]) => t - (results.baseline[m] || 0) > 20)
    .map(([m]) => m);
  
  if (successStories.length > 0) {
    console.log(`  ✅ Major gains in: ${successStories.join(', ')}`);
    console.log(`      Continue current methods + advance to Level 2`);
  }
  
  console.log('='.repeat(70));
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
runComprehensiveTraining().catch(err => {
  console.error('Training failed:', err);
  process.exit(1);
});
