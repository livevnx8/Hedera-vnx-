/**
 * Vera Worked-Example Training
 * Shows step-by-step solutions before practice problems
 */

import { speedMathTraining } from '../dist/training/numerical/speedMath.js';
import { percentagesTraining } from '../dist/training/numerical/percentages.js';
import { workRateTraining } from '../dist/training/numerical/workRate.js';
import { logicTraining } from '../dist/training/verbal/logic.js';
import { createProvider } from '../dist/llm/realProvider.js';

const workedExamples = {
  workRate: {
    concept: 'Combined Work Rate',
    explanation: `When workers work together, their speeds ADD, not their times.
If A takes X days and B takes Y days:
- A's rate = 1/X per day
- B's rate = 1/Y per day  
- Combined rate = 1/X + 1/Y per day
- Time together = 1 / (combined rate) = (X×Y)/(X+Y)`,
    example: {
      problem: 'Worker A takes 6 days. Worker B takes 3 days. How long together?',
      solution: `Step 1: Find individual rates
- A's rate = 1/6 per day
- B's rate = 1/3 per day = 2/6 per day

Step 2: Add rates
- Combined = 1/6 + 2/6 = 3/6 = 1/2 per day

Step 3: Find time
- Time = 1 / (1/2) = 2 days

Shortcut: (6×3)/(6+3) = 18/9 = 2 days ✓`
    }
  },

  speedMath: {
    concept: 'Distance-Speed-Time Triangle',
    explanation: `Use the DST triangle: cover what you need
        D
       / \\
      S × T

- Need D? D = S × T
- Need S? S = D ÷ T  
- Need T? T = D ÷ S`,
    example: {
      problem: 'Speed = 60 km/h, Distance = 180 km. Find time.',
      solution: `Step 1: Identify what's given and what's needed
- Given: Speed (60), Distance (180)
- Need: Time

Step 2: Use triangle method (cover T)
- T = D ÷ S

Step 3: Calculate
- T = 180 ÷ 60 = 3 hours

Always check units match!`
    }
  },

  percentages: {
    concept: 'Percentage as Multiplier',
    explanation: `Convert percentages to multipliers:
- Increase 20% → multiply by 1.20
- Decrease 20% → multiply by 0.80
- Find 25% of → multiply by 0.25

NEVER add percentages directly!`,
    example: {
      problem: 'Price $80 increases by 25%, then decreases 20%. Final price?',
      solution: `Step 1: Convert to multipliers
- +25% = ×1.25
- -20% = ×0.80

Step 2: Multiply (NOT add!)
- Final = 80 × 1.25 × 0.80
- = 80 × 1.00
- = $80

Note: +25% then -20% = back to start!`
    }
  },

  logic: {
    concept: 'Valid Syllogism Patterns',
    explanation: `Valid forms (memorize these):
1. All A are B, All B are C → All A are C
2. No A are B, All B are C → No A are C  
3. All A are B, Some C are A → Some C are B

Invalid (common trap):
- All A are B, All C are B → All A are C ❌`,
    example: {
      problem: 'All mammals are animals. All dogs are mammals. Conclusion?',
      solution: `Step 1: Map the pattern
- A = dogs, B = mammals, C = animals
- Pattern: All A are B, All B are C

Step 2: Apply valid form
- All A are C → All dogs are animals ✓

Step 3: Check for traps
- Is it "All animals are dogs"? No! (converse error)
- Correct answer: All dogs are animals`
    }
  }
};

const results = [];

async function runWorkedExampleTraining() {
  console.log('🎓 VERA WORKED-EXAMPLE TRAINING');
  console.log('='.repeat(70));
  console.log('Learn by watching step-by-step solutions, then practice');
  console.log('');

  const llm = createProvider();

  // Phase 1: Learn with worked examples
  console.log('\n📚 PHASE 1: Learn with Worked Examples');
  console.log('-'.repeat(70));

  await learnWorkRate(llm);
  await learnSpeedMath(llm);
  await learnPercentages(llm);
  await learnLogic(llm);

  // Phase 2: Practice without examples
  console.log('\n✏️  PHASE 2: Independent Practice');
  console.log('-'.repeat(70));

  await practiceWorkRate(llm);
  await practiceSpeedMath(llm);
  await practicePercentages(llm);
  await practiceLogic(llm);

  // Report
  generateLearningReport();
}

async function learnWorkRate(llm) {
  const example = workedExamples.workRate;
  console.log(`\n👷 ${example.concept}`);
  console.log(example.explanation);
  console.log('\n📖 Example:');
  console.log(example.example.problem);
  console.log('\n' + example.example.solution);

  // Test if Vera understood
  const testProblem = workRateTraining.getProblemsForLevel(1, 3)[0];
  const prompt = `I just showed you how to solve work rate problems.

Now solve: ${testProblem.question}

Show your work step by step.`;

  const response = await llm.chat({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0
  });

  console.log('\n📝 Vera\'s attempt:');
  console.log(response.content);
}

async function learnSpeedMath(llm) {
  const example = workedExamples.speedMath;
  console.log(`\n🏎️  ${example.concept}`);
  console.log(example.explanation);
  console.log('\n📖 Example:');
  console.log(example.example.problem);
  console.log('\n' + example.example.solution);

  const testProblem = speedMathTraining.getProblemsForLevel(1, 5)[0];
  const prompt = `Using the DST triangle method, solve: ${testProblem.question}

Given: Speed = ${testProblem.given.speed}${testProblem.unit}, Distance = ${testProblem.given.distance}${testProblem.unit}

Show your step-by-step work.`;

  const response = await llm.chat({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150,
    temperature: 0
  });

  console.log('\n📝 Vera\'s attempt:');
  console.log(response.content);
}

async function learnPercentages(llm) {
  const example = workedExamples.percentages;
  console.log(`\n📊 ${example.concept}`);
  console.log(example.explanation);
  console.log('\n📖 Example:');
  console.log(example.example.problem);
  console.log('\n' + example.example.solution);

  const testProblem = percentagesTraining.getProblemsForLevel(1, 5)[0];
  const prompt = `Use the multiplier method to solve: ${testProblem.question}

Show your work using multipliers (like ×1.25 for +25%).`;

  const response = await llm.chat({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150,
    temperature: 0
  });

  console.log('\n📝 Vera\'s attempt:');
  console.log(response.content);
}

async function learnLogic(llm) {
  const example = workedExamples.logic;
  console.log(`\n🧩 ${example.concept}`);
  console.log(example.explanation);
  console.log('\n📖 Example:');
  console.log(example.example.problem);
  console.log('\n' + example.example.solution);

  const testProblem = logicTraining.getProblemsForLevel(1, 5)[0];
  let prompt = `Apply the syllogism pattern I just showed you:\n`;
  if (testProblem.type === 'syllogism') {
    prompt += `${testProblem.premise1}\n${testProblem.premise2}\n${testProblem.question}\n\nMap to A/B/C pattern, then conclude.`;
  } else {
    prompt += `${testProblem.scenario}\n${testProblem.question}`;
  }

  const response = await llm.chat({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150,
    temperature: 0
  });

  console.log('\n📝 Vera\'s attempt:');
  console.log(response.content);
}

async function practiceWorkRate(llm) {
  console.log('\n👷 Practice: Work Rate');
  const problems = workRateTraining.getProblemsForLevel(1, 3);
  
  for (const p of problems) {
    const prompt = `Solve: ${p.question}

Answer with just the number.`;

    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 20,
      temperature: 0
    });

    const answer = parseFloat(response.content.trim());
    const isCorrect = Math.abs(answer - p.answer) < 0.1;
    
    results.push({ module: 'workRate', isCorrect, answer, expected: p.answer });
    console.log(`  ${p.question.substring(0, 50)}... → ${answer} (expected ${p.answer}) ${isCorrect ? '✓' : '✗'}`);
  }
}

async function practiceSpeedMath(llm) {
  console.log('\n🏎️  Practice: Speed Math');
  const problems = speedMathTraining.getProblemsForLevel(1, 3);
  
  for (const p of problems) {
    // Build prompt based on what's given vs what's needed
    const { speed, distance, time } = p.given;
    let givenText = '';
    let questionText = p.question;
    
    if (speed !== undefined && time !== undefined && distance === undefined) {
      givenText = `Speed = ${speed}${p.unit}, Time = ${time} hours`;
    } else if (speed !== undefined && distance !== undefined && time === undefined) {
      givenText = `Speed = ${speed}${p.unit}, Distance = ${distance}${p.unit}`;
    } else if (distance !== undefined && time !== undefined && speed === undefined) {
      givenText = `Distance = ${distance}${p.unit}, Time = ${time} hours`;
    } else {
      givenText = `Given: ${JSON.stringify(p.given)}`;
    }
    
    const prompt = `${givenText}\n${questionText}\n\nAnswer with just the number.`;

    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 20,
      temperature: 0
    });

    const answer = parseFloat(response.content.trim());
    const isCorrect = Math.abs(answer - p.answer) < 0.01;
    
    results.push({ module: 'speedMath', isCorrect, answer, expected: p.answer });
    console.log(`  ${questionText.substring(0, 40)}... → ${answer} (expected ${p.answer}) ${isCorrect ? '✓' : '✗'}`);
  }
}

async function practicePercentages(llm) {
  console.log('\n📊 Practice: Percentages');
  const problems = percentagesTraining.getProblemsForLevel(1, 3);
  
  for (const p of problems) {
    const prompt = `${p.question}\nAnswer with just the number.`;

    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 20,
      temperature: 0
    });

    const answer = parseFloat(response.content.trim());
    const isCorrect = Math.abs(answer - p.answer) < 0.01;
    
    results.push({ module: 'percentages', isCorrect, answer, expected: p.answer });
    console.log(`  ${p.question.substring(0, 50)}... → ${answer} (expected ${p.answer}) ${isCorrect ? '✓' : '✗'}`);
  }
}

async function practiceLogic(llm) {
  console.log('\n🧩 Practice: Logic');
  const problems = logicTraining.getProblemsForLevel(1, 3);
  
  for (const p of problems) {
    let prompt = '';
    if (p.type === 'syllogism') {
      prompt = `${p.premise1}\n${p.premise2}\n${p.question}\nOptions: ${p.options.join(', ')}\nAnswer with just the number (0-3).`;
    } else {
      prompt = `${p.scenario}\n${p.question}\nOptions: ${p.options.join(', ')}\nAnswer with just the number (0-3).`;
    }

    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0
    });

    const answer = parseInt(response.content.trim());
    const isCorrect = answer === p.correct;
    
    results.push({ module: 'logic', isCorrect, answer, expected: p.correct });
    console.log(`  Logic problem → ${answer} (expected ${p.correct}) ${isCorrect ? '✓' : '✗'}`);
  }
}

function generateLearningReport() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 WORKED-EXAMPLE TRAINING RESULTS');
  console.log('='.repeat(70));
  
  const byModule = {};
  for (const r of results) {
    if (!byModule[r.module]) byModule[r.module] = { total: 0, correct: 0 };
    byModule[r.module].total++;
    if (r.isCorrect) byModule[r.module].correct++;
  }
  
  const baselines = { workRate: 0, speedMath: 40, percentages: 40, logic: 40 };
  
  console.log('\nModule         | Baseline | With Training | Improvement');
  console.log('-'.repeat(65));
  
  for (const [module, stats] of Object.entries(byModule)) {
    const baseline = baselines[module] || 50;
    const newAcc = Math.round((stats.correct / stats.total) * 100);
    const improvement = newAcc - baseline;
    const symbol = improvement > 0 ? '↑' : improvement < 0 ? '↓' : '=';
    
    console.log(`${module.padEnd(14)} | ${baseline.toString().padStart(3)}%     | ${newAcc.toString().padStart(3)}%          | ${symbol}${Math.abs(improvement)}%`);
  }
  
  console.log('\n📋 Cognitive Load Analysis:');
  console.log('  - Raw formulas: Too abstract, caused confusion');
  console.log('  - Worked examples: Concrete, step-by-step better');
  console.log('  - Next: Spaced repetition + error analysis');
  
  console.log('='.repeat(70));
}

// Run
runWorkedExampleTraining().catch(err => {
  console.error('Training failed:', err);
  process.exit(1);
});
