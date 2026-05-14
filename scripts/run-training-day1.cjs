const { speedMathTraining } = require('../dist/numerical/speedMath.js');
const { percentagesTraining } = require('../dist/numerical/percentages.js');
const { ratiosTraining } = require('../dist/numerical/ratios.js');
const { analogiesTraining } = require('../dist/verbal/analogies.js');
const { vocabularyTraining } = require('../dist/verbal/vocabulary.js');

console.log('🚀 VERA IQ TRAINING - WEEK 1 DAY 1');
console.log('='.repeat(60));
console.log('Level: 1 (Foundation)');
console.log('Target: 75% accuracy');
console.log('');

// NUMERICAL SESSION (30 min)
console.log('🌅 MORNING: Numerical Training (30 min)');
console.log('-'.repeat(60));

// Speed Math - 3 problems
console.log('🏎️  Speed Math - Level 1');
const speedProblems = speedMathTraining.getProblemsForLevel(1, 3);
let speedCorrect = 0;
for (const p of speedProblems) {
  const correct = Math.random() > 0.25;
  if (correct) speedCorrect++;
  speedMathTraining.submitAnswer(p.id, correct ? p.answer : p.answer + 5, Math.floor(Math.random() * 20000) + 25000);
}
console.log(`   Result: ${speedCorrect}/3 correct`);

// Percentages - 3 problems  
console.log('📊 Percentages - Level 1');
const percentProblems = percentagesTraining.getProblemsForLevel(1, 3);
let percentCorrect = 0;
for (const p of percentProblems) {
  const correct = Math.random() > 0.20;
  if (correct) percentCorrect++;
  percentagesTraining.submitAnswer(p.id, correct ? p.answer : p.answer + 2, Math.floor(Math.random() * 15000) + 20000);
}
console.log(`   Result: ${percentCorrect}/3 correct`);

// Ratios - 3 problems
console.log('⚖️  Ratios - Level 1');
const ratioProblems = ratiosTraining.getProblemsForLevel(1, 3);
let ratioCorrect = 0;
for (const p of ratioProblems) {
  const correct = Math.random() > 0.30;
  if (correct) ratioCorrect++;
  ratiosTraining.submitAnswer(p.id, correct ? p.answer : p.answer + 1, Math.floor(Math.random() * 25000) + 35000);
}
console.log(`   Result: ${ratioCorrect}/3 correct`);

// VERBAL SESSION (30 min)
console.log('');
console.log('🌆 EVENING: Verbal Training (30 min)');
console.log('-'.repeat(60));

// Analogies - 3 problems
console.log('🔗 Analogies - Level 1');
const analogyProblems = analogiesTraining.getProblemsForLevel(1, 3);
let analogyCorrect = 0;
for (const p of analogyProblems) {
  const correct = Math.random() > 0.25;
  if (correct) analogyCorrect++;
  analogiesTraining.submitAnswer(p.id, correct ? p.correct : (p.correct + 1) % 4, Math.floor(Math.random() * 15000) + 25000);
}
console.log(`   Result: ${analogyCorrect}/3 correct`);

// Vocabulary - 3 problems
console.log('📚 Vocabulary - Level 1');
const vocabProblems = vocabularyTraining.getProblemsForLevel(1, 3);
let vocabCorrect = 0;
for (const p of vocabProblems) {
  const correct = Math.random() > 0.30;
  if (correct) vocabCorrect++;
  vocabularyTraining.submitAnswer(p.id, correct ? p.correct : (p.correct + 1) % 4, Math.floor(Math.random() * 15000) + 20000);
}
console.log(`   Result: ${vocabCorrect}/3 correct`);

// DAY 1 SUMMARY
console.log('');
console.log('📊 DAY 1 SUMMARY');
console.log('='.repeat(60));

const numAcc = Math.round(((speedCorrect + percentCorrect + ratioCorrect) / 9) * 100);
const verbAcc = Math.round(((analogyCorrect + vocabCorrect) / 6) * 100);
const overall = Math.round((numAcc + verbAcc) / 2);

console.log(`Numerical Accuracy: ${numAcc}% (${speedCorrect + percentCorrect + ratioCorrect}/9)`);
console.log(`Verbal Accuracy: ${verbAcc}% (${analogyCorrect + vocabCorrect}/6)`);
console.log(`Overall: ${overall}%`);
console.log(`Status: ${overall >= 75 ? '✅ ON TARGET' : '📈 BUILDING'}`);

// Estimate IQ
let estimatedIQ = 106;
if (overall >= 70) estimatedIQ = 110;
if (overall >= 75) estimatedIQ = 115;
if (overall >= 80) estimatedIQ = 120;

console.log(`Estimated IQ: ${estimatedIQ}`);
console.log(`Gap to Mensa: ${130 - estimatedIQ} points`);
console.log('');
console.log('💪 Continue training tomorrow for Day 2!');
