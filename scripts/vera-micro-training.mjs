/**
 * Vera Micro-Training for Work Rate
 * One concept at a time with immediate feedback loops
 */

import { workRateTraining } from '../dist/training/numerical/workRate.js';
import { createProvider } from '../dist/llm/realProvider.js';

async function runMicroTraining() {
  console.log('🔬 VERA MICRO-TRAINING: Work Rate Fundamentals');
  console.log('='.repeat(70));
  console.log('Teaching one concept at a time with immediate feedback');
  console.log('');

  const llm = createProvider();

  // Module 1: Understanding Rate vs Time
  await module1RateVsTime(llm);
  
  // Module 2: Two Workers Different Rates
  await module2TwoWorkers(llm);
  
  // Module 3: Multiple Same Workers
  await module3MultipleWorkers(llm);
  
  // Final Assessment
  await finalAssessment(llm);
}

async function module1RateVsTime(llm) {
  console.log('\n📚 MODULE 1: Rate vs Time (The Foundation)');
  console.log('-'.repeat(70));
  
  const concept = `
THE KEY INSIGHT: Rate and Time are INVERSES

If a worker takes 4 days to complete a job:
- Their TIME is 4 days
- Their RATE is 1/4 of the job per day

Think of it like speed:
- If you take 4 hours to drive somewhere, your speed isn't 4
- Your speed is 1/4 of the trip per hour

FORMULA: Rate = 1 / Time
`;

  console.log(concept);
  
  // Example with heavy scaffolding
  const example = `
Example: Worker takes 5 days
Step 1: What is the TIME? → 5 days
Step 2: What is the RATE? → 1/5 per day
Step 3: Check: In 5 days at 1/5 per day = 5 × (1/5) = 1 complete job ✓
`;
  console.log(example);
  
  // Test 1: Simple rate identification
  const test1 = await llm.chat({
    messages: [{ 
      role: 'user', 
      content: `If a worker takes 4 days to paint a house:
1. What is their TIME? (answer in days)
2. What is their RATE? (answer as a fraction per day)

Format: "Time: X days, Rate: Y per day"` 
    }],
    max_tokens: 50,
    temperature: 0
  });
  
  console.log('\n📝 Test 1 - Rate Identification:');
  console.log(test1.content);
  
  const test1Correct = test1.content.includes('1/4') || test1.content.includes('0.25');
  console.log(test1Correct ? '✅ Correct!' : '❌ Expected: Rate = 1/4 per day');
  
  // Test 2: Rate calculation
  const test2 = await llm.chat({
    messages: [{ 
      role: 'user', 
      content: `Quick check: If a pipe fills a tank in 2 hours, what is its filling rate per hour?` 
    }],
    max_tokens: 20,
    temperature: 0
  });
  
  console.log('\n📝 Test 2 - Rate Calculation:');
  console.log(test2.content);
  
  const test2Correct = test2.content.includes('1/2') || test2.content.includes('0.5');
  console.log(test2Correct ? '✅ Correct!' : '❌ Expected: 1/2 per hour');
  
  return { module: 1, passed: test1Correct && test2Correct };
}

async function module2TwoWorkers(llm) {
  console.log('\n📚 MODULE 2: Two Workers Together');
  console.log('-'.repeat(70));
  
  const concept = `
COMBINING RATES:
When two workers work together, their RATES add up.

Example:
- Worker A: 6 days → Rate = 1/6 per day
- Worker B: 3 days → Rate = 1/3 = 2/6 per day
- Combined: 1/6 + 2/6 = 3/6 = 1/2 per day
- Time together: 1 / (1/2) = 2 days

SHORTCUT: (A's time × B's time) / (A's time + B's time)
= (6 × 3) / (6 + 3) = 18/9 = 2 days ✓
`;

  console.log(concept);
  
  // Walk through together
  const example = `
Example: A takes 4 days, B takes 4 days
Step 1: A's rate = 1/4, B's rate = 1/4
Step 2: Combined rate = 1/4 + 1/4 = 2/4 = 1/2 per day
Step 3: Time = 1 / (1/2) = 2 days
Shortcut: (4×4)/(4+4) = 16/8 = 2 days ✓
`;
  console.log(example);
  
  // Practice with immediate feedback
  const practice1 = await llm.chat({
    messages: [{ 
      role: 'user', 
      content: `Worker A takes 6 days. Worker B takes 6 days.
How long together?

Show: 1. A's rate 2. B's rate 3. Combined rate 4. Final answer` 
    }],
    max_tokens: 100,
    temperature: 0
  });
  
  console.log('\n📝 Practice 1:');
  console.log(practice1.content);
  
  const answer1 = practice1.content.match(/(\d+\.?\d*)/);
  const isCorrect1 = answer1 && Math.abs(parseFloat(answer1[0]) - 3) < 0.1;
  console.log(isCorrect1 ? '✅ Correct! (Expected: 3 days)' : '❌ Expected: 3 days');
  
  // Practice 2
  const practice2 = await llm.chat({
    messages: [{ 
      role: 'user', 
      content: `A takes 3 days, B takes 6 days. How long together?
Use the shortcut: (3×6)/(3+6)` 
    }],
    max_tokens: 30,
    temperature: 0
  });
  
  console.log('\n📝 Practice 2:');
  console.log(practice2.content);
  
  const answer2 = practice2.content.match(/(\d+\.?\d*)/);
  const isCorrect2 = answer2 && Math.abs(parseFloat(answer2[0]) - 2) < 0.1;
  console.log(isCorrect2 ? '✅ Correct! (Expected: 2 days)' : '❌ Expected: 2 days');
  
  return { module: 2, passed: isCorrect1 && isCorrect2 };
}

async function module3MultipleWorkers(llm) {
  console.log('\n📚 MODULE 3: Multiple Workers Same Rate');
  console.log('-'.repeat(70));
  
  const concept = `
MULTIPLE WORKERS WITH SAME TIME:

If 1 worker takes 12 days:
- 2 workers take 12/2 = 6 days
- 3 workers take 12/3 = 4 days
- 4 workers take 12/4 = 3 days

RULE: Time = Single worker time / Number of workers
`;

  console.log(concept);
  
  // Practice
  const practice = await llm.chat({
    messages: [{ 
      role: 'user', 
      content: `If 1 worker takes 8 days:
- How long for 2 workers?
- How long for 4 workers?

Answer with two numbers.` 
    }],
    max_tokens: 30,
    temperature: 0
  });
  
  console.log('\n📝 Practice:');
  console.log(practice.content);
  
  const answers = practice.content.match(/(\d+\.?\d*)/g);
  const correct1 = answers && answers[0] && parseFloat(answers[0]) === 4;
  const correct2 = answers && answers[1] && parseFloat(answers[1]) === 2;
  
  console.log(correct1 ? '✅ 2 workers = 4 days' : '❌ 2 workers should = 4 days');
  console.log(correct2 ? '✅ 4 workers = 2 days' : '❌ 4 workers should = 2 days');
  
  return { module: 3, passed: correct1 && correct2 };
}

async function finalAssessment(llm) {
  console.log('\n📝 FINAL ASSESSMENT');
  console.log('-'.repeat(70));
  console.log('Now testing on REAL training problems (no help):\n');
  
  const problems = workRateTraining.getProblemsForLevel(1, 3);
  let correct = 0;
  
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    const prompt = `Problem ${i + 1}: ${p.question}\n\nShow your work, then give final numerical answer.`;
    
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0
    });
    
    const answerMatch = response.content.match(/(\d+\.?\d*)/g);
    const lastNumber = answerMatch ? parseFloat(answerMatch[answerMatch.length - 1]) : null;
    const isCorrect = lastNumber && Math.abs(lastNumber - p.answer) < 0.1;
    
    if (isCorrect) correct++;
    
    console.log(`Problem ${i + 1}: ${isCorrect ? '✅' : '❌'} (Got: ${lastNumber}, Expected: ${p.answer})`);
    console.log(`Q: ${p.question.substring(0, 60)}...`);
    if (!isCorrect) {
      console.log(`Vera's answer: ${lastNumber}`);
      console.log(`Work shown: ${response.content.substring(0, 100)}...`);
    }
    console.log('');
  }
  
  const accuracy = Math.round((correct / problems.length) * 100);
  
  console.log('='.repeat(70));
  console.log('📊 MICRO-TRAINING RESULTS');
  console.log('='.repeat(70));
  console.log(`Final Score: ${correct}/${problems.length} = ${accuracy}%`);
  console.log(`Baseline: 0% → After micro-training: ${accuracy}%`);
  
  if (accuracy === 0) {
    console.log('\n⚠️  CRITICAL: Still failing after micro-training');
    console.log('Diagnosis: Work rate may require different learning approach');
    console.log('Suggestion: Try visual/metaphor-based learning (not formulas)');
  } else if (accuracy < 50) {
    console.log('\n📋 Partial success - needs more repetition');
  } else {
    console.log('\n🎉 Significant improvement achieved!');
  }
  
  console.log('='.repeat(70));
}

// Run
runMicroTraining().catch(err => {
  console.error('Training failed:', err);
  process.exit(1);
});
