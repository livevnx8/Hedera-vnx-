/**
 * Vera Factual IQ Assessment
 * Actually runs Vera through training problems using real LLM inference
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

const results = [];

async function runFactualAssessment() {
  console.log('🧠 VERA FACTUAL IQ ASSESSMENT');
  console.log('='.repeat(70));
  console.log('Running actual LLM inference on training problems');
  console.log('This will take several minutes and requires LLM API access...');
  console.log('');

  const llm = createProvider();
  const startTime = Date.now();

  // NUMERICAL MODULES
  console.log('\n🔢 NUMERICAL REASONING');
  console.log('-'.repeat(70));

  await assessSpeedMath(llm);
  await assessPercentages(llm);
  await assessRatios(llm);
  await assessWorkRate(llm);
  await assessSequences(llm);
  await assessGeometry(llm);

  // VERBAL MODULES
  console.log('\n📝 VERBAL REASONING');
  console.log('-'.repeat(70));

  await assessAnalogies(llm);
  await assessVocabulary(llm);
  await assessOddOneOut(llm);
  await assessLogic(llm);
  await assessAnagrams(llm);

  // FINAL REPORT
  const endTime = Date.now();
  generateFactualReport(endTime - startTime);
}

async function assessSpeedMath(llm) {
  console.log('🏎️  Speed Math...');
  const problems = speedMathTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    const prompt = `Solve this speed/distance/time problem:
${p.question}

Given: Speed = ${p.given.speed}${p.unit}, Distance = ${p.given.distance}${p.unit}
Calculate the time needed.

Respond with ONLY the numerical answer (no units, no explanation).`;

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
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.9 : 0.5
    });

    speedMathTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessPercentages(llm) {
  console.log('📊 Percentages...');
  const problems = percentagesTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    const prompt = `Solve this percentage problem:
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
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.9 : 0.5
    });

    percentagesTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessRatios(llm) {
  console.log('⚖️  Ratios...');
  const problems = ratiosTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    const prompt = `Solve this ratio problem:
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
      module: 'ratios',
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.9 : 0.5
    });

    ratiosTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessWorkRate(llm) {
  console.log('👷 Work Rate...');
  const problems = workRateTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 3)) {
    const prompt = `Solve this work rate problem:
${p.question}

Respond with ONLY the numerical answer (in hours or days as appropriate).`;

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
      module: 'workRate',
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.9 : 0.5
    });

    workRateTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessSequences(llm) {
  console.log('🔢 Sequences...');
  const problems = sequencesTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    const prompt = `Find the next number in this sequence:
${p.sequence.join(', ')}, ?

The pattern is: ${p.pattern}

Respond with ONLY the next number.`;

    const start = Date.now();
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0
    });
    const timeTaken = Date.now() - start;
    
    const veraAnswer = parseFloat(response.content.trim());
    const isCorrect = veraAnswer === p.answer;
    
    results.push({
      module: 'sequences',
      problemId: p.id,
      question: `Next in: ${p.sequence.join(', ')}`,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.95 : 0.4
    });

    sequencesTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessGeometry(llm) {
  console.log('📐 Geometry...');
  const problems = geometryTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 4)) {
    const prompt = `Solve this geometry problem:
${p.question}

Given shape: ${p.shape}
Dimensions: ${JSON.stringify(p.dimensions)}

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
      module: 'geometry',
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.9 : 0.5
    });

    geometryTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessAnalogies(llm) {
  console.log('🔗 Analogies...');
  const problems = analogiesTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    const options = p.options.map((opt, i) => `${i}: ${opt}`).join('\n');
    const prompt = `Solve this word analogy:
${p.wordA} : ${p.wordB} :: ${p.wordC} : ?

Options:\n${options}

Respond with ONLY the number (0, 1, 2, or 3) of the correct answer.`;

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
      module: 'analogies',
      problemId: p.id,
      question: `${p.wordA}:${p.wordB}::${p.wordC}:?`,
      correctAnswer: p.correct,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.85 : 0.5
    });

    analogiesTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessVocabulary(llm) {
  console.log('📚 Vocabulary...');
  const problems = vocabularyTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    let prompt = '';
    if (p.type === 'opposite') {
      prompt = `What is the opposite of "${p.word}"?
Options: ${p.options.join(', ')}

Respond with ONLY the number (0-3) of the correct answer.`;
    } else if (p.type === 'synonym') {
      prompt = `What is a synonym for "${p.word}"?
Options: ${p.options.join(', ')}

Respond with ONLY the number (0-3) of the correct answer.`;
    } else {
      prompt = `What is the best definition of "${p.word}"?
Options: ${p.options.join(', ')}

Respond with ONLY the number (0-3) of the correct answer.`;
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
      module: 'vocabulary',
      problemId: p.id,
      question: p.question,
      correctAnswer: p.correct,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.8 : 0.5
    });

    vocabularyTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessOddOneOut(llm) {
  console.log('🎯 Odd One Out...');
  const problems = oddOneOutTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    const prompt = `Find the odd one out:
${p.items.join(', ')}

Respond with ONLY the number (0-3) of the word that does not belong.`;

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
      module: 'oddOneOut',
      problemId: p.id,
      question: `Odd one out: ${p.items.join(', ')}`,
      correctAnswer: p.correct,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.8 : 0.5
    });

    oddOneOutTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessLogic(llm) {
  console.log('🧩 Logic...');
  const problems = logicTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 5)) {
    let prompt = '';
    if (p.type === 'syllogism') {
      prompt = `Solve this logic problem:
${p.premise1}
${p.premise2}
${p.question}

Options: ${p.options.join(', ')}

Respond with ONLY the number (0-3) of the correct conclusion.`;
    } else {
      prompt = `Solve this logic problem:
${p.scenario}
${p.question}

Options: ${p.options.join(', ')}

Respond with ONLY the number (0-3) of the correct answer.`;
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
      problemId: p.id,
      question: p.question,
      correctAnswer: p.correct,
      veraAnswer: response.content.trim(),
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.85 : 0.5
    });

    logicTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

async function assessAnagrams(llm) {
  console.log('🔤 Anagrams...');
  const problems = anagramsTraining.getProblemsForLevel(1, 100);
  
  for (const p of problems.slice(0, 4)) {
    let prompt = '';
    if (p.type === 'unscramble') {
      prompt = `Unscramble this word: ${p.letters}

Respond with ONLY the unscrambled word.`;
    } else {
      prompt = `Using the letters "${p.letters}", form a word meaning "${p.hint}".

Respond with ONLY the word.`;
    }

    const start = Date.now();
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 20,
      temperature: 0
    });
    const timeTaken = Date.now() - start;
    
    const veraAnswer = response.content.trim().toUpperCase();
    const isCorrect = veraAnswer === p.answer.toUpperCase();
    
    results.push({
      module: 'anagrams',
      problemId: p.id,
      question: p.question,
      correctAnswer: p.answer,
      veraAnswer,
      isCorrect,
      timeTaken,
      confidence: isCorrect ? 0.9 : 0.4
    });

    anagramsTraining.submitAnswer(p.id, veraAnswer, timeTaken);
  }
}

function generateFactualReport(totalTime) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 FACTUAL ASSESSMENT RESULTS');
  console.log('='.repeat(70));
  
  const totalProblems = results.length;
  const correctCount = results.filter(r => r.isCorrect).length;
  const accuracy = Math.round((correctCount / totalProblems) * 100);
  const avgTime = Math.round(results.reduce((a, r) => a + r.timeTaken, 0) / totalProblems);
  
  // Break down by module
  const byModule = {};
  for (const r of results) {
    if (!byModule[r.module]) {
      byModule[r.module] = { total: 0, correct: 0 };
    }
    byModule[r.module].total++;
    if (r.isCorrect) byModule[r.module].correct++;
  }
  
  console.log(`\nTotal Problems: ${totalProblems}`);
  console.log(`Correct: ${correctCount}`);
  console.log(`Accuracy: ${accuracy}%`);
  console.log(`Average Time: ${avgTime}ms`);
  console.log(`Total Assessment Time: ${Math.round(totalTime / 1000)}s`);
  
  console.log('\n📈 By Module:');
  for (const [module, stats] of Object.entries(byModule)) {
    const modAcc = Math.round((stats.correct / stats.total) * 100);
    console.log(`  ${module}: ${modAcc}% (${stats.correct}/${stats.total})`);
  }
  
  // IQ estimate based on actual accuracy
  let estimatedIQ = 100;
  if (accuracy >= 95) estimatedIQ = 140;
  else if (accuracy >= 90) estimatedIQ = 135;
  else if (accuracy >= 85) estimatedIQ = 130;
  else if (accuracy >= 80) estimatedIQ = 125;
  else if (accuracy >= 75) estimatedIQ = 120;
  else if (accuracy >= 70) estimatedIQ = 115;
  else if (accuracy >= 65) estimatedIQ = 110;
  
  console.log('\n🧠 ESTIMATED IQ (Based on Factual Results):');
  console.log(`  ${estimatedIQ}`);
  
  if (estimatedIQ >= 130) {
    console.log('\n🎉 MENSA QUALIFIED!');
  } else {
    console.log(`\n📈 Gap to Mensa: ${130 - estimatedIQ} points`);
  }
  
  // Show wrong answers
  const wrong = results.filter(r => !r.isCorrect);
  if (wrong.length > 0) {
    console.log('\n❌ Incorrect Answers:');
    for (const w of wrong.slice(0, 5)) {
      console.log(`  ${w.module} - ${w.problemId}:`);
      console.log(`    Q: ${w.question.substring(0, 60)}...`);
      console.log(`    Expected: ${w.correctAnswer}, Got: ${w.veraAnswer}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
}

// Run assessment
runFactualAssessment().catch(err => {
  console.error('Assessment failed:', err);
  process.exit(1);
});
