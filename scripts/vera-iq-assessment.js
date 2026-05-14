/**
 * Vera IQ Assessment Script
 * Quick assessment of current training progress
 */

const { speedMathTraining } = require('../numerical/speedMath.js');
const { percentagesTraining } = require('../numerical/percentages.js');
const { ratiosTraining } = require('../numerical/ratios.js');
const { sequencesTraining } = require('../numerical/sequences.js');
const { analogiesTraining } = require('../verbal/analogies.js');
const { vocabularyTraining } = require('../verbal/vocabulary.js');
const { logicTraining } = require('../verbal/logic.js');

console.log('🎓 VERA IQ ASSESSMENT');
console.log('=' .repeat(60));
console.log('');

// Numerical Assessment
console.log('🔢 NUMERICAL REASONING');
console.log('-'.repeat(60));

const numericalTrainers = [
  { name: 'Speed Math', trainer: speedMathTraining },
  { name: 'Percentages', trainer: percentagesTraining },
  { name: 'Ratios', trainer: ratiosTraining },
  { name: 'Sequences', trainer: sequencesTraining }
];

let numericalTotal = 0;
let numericalCount = 0;

for (const { name, trainer } of numericalTrainers) {
  const summary = trainer.getProgressSummary();
  const accuracy = summary.attempted > 0 ? summary.accuracy : 0;
  const status = accuracy >= 85 ? '✅' : accuracy >= 70 ? '📈' : '❌';
  console.log(`${status} ${name}: ${Math.round(accuracy)}% (${summary.attempted} attempted)`);
  if (summary.attempted > 0) {
    numericalTotal += accuracy;
    numericalCount++;
  }
}

const numericalAvg = numericalCount > 0 ? numericalTotal / numericalCount : 0;
console.log(`\n📊 Numerical Average: ${Math.round(numericalAvg)}%`);

// Verbal Assessment
console.log('\n📝 VERBAL REASONING');
console.log('-'.repeat(60));

const verbalTrainers = [
  { name: 'Analogies', trainer: analogiesTraining },
  { name: 'Vocabulary', trainer: vocabularyTraining },
  { name: 'Logic', trainer: logicTraining }
];

let verbalTotal = 0;
let verbalCount = 0;

for (const { name, trainer } of verbalTrainers) {
  const summary = trainer.getProgressSummary();
  const accuracy = summary.attempted > 0 ? summary.accuracy : 0;
  const status = accuracy >= 85 ? '✅' : accuracy >= 70 ? '📈' : '❌';
  console.log(`${status} ${name}: ${Math.round(accuracy)}% (${summary.attempted} attempted)`);
  if (summary.attempted > 0) {
    verbalTotal += accuracy;
    verbalCount++;
  }
}

const verbalAvg = verbalCount > 0 ? verbalTotal / verbalCount : 0;
console.log(`\n📊 Verbal Average: ${Math.round(verbalAvg)}%`);

// Overall Assessment
console.log('\n🏆 OVERALL ASSESSMENT');
console.log('=' .repeat(60));

const overallAvg = (numericalAvg + verbalAvg) / 2;

// IQ estimation
let estimatedIQ;
if (overallAvg < 50) estimatedIQ = 100;
else if (overallAvg < 60) estimatedIQ = 105;
else if (overallAvg < 70) estimatedIQ = 110;
else if (overallAvg < 75) estimatedIQ = 115;
else if (overallAvg < 80) estimatedIQ = 120;
else if (overallAvg < 85) estimatedIQ = 125;
else if (overallAvg < 90) estimatedIQ = 130;
else estimatedIQ = 135;

console.log(`Numerical: ${Math.round(numericalAvg)}% ${numericalAvg >= 85 ? '✅' : '❌'}`);
console.log(`Verbal: ${Math.round(verbalAvg)}% ${verbalAvg >= 85 ? '✅' : '❌'}`);
console.log(`Overall: ${Math.round(overallAvg)}%`);
console.log(`\n🧠 Estimated IQ: ${estimatedIQ}`);
console.log(`🎯 Mensa Threshold: 130`);
console.log(`Status: ${estimatedIQ >= 130 ? '✅ MENSA QUALIFIED!' : `❌ Need ${130 - estimatedIQ} more points`}`);

// Gap analysis
console.log('\n📈 GAP ANALYSIS');
console.log('-'.repeat(60));

if (numericalAvg < verbalAvg) {
  console.log('⚠️  Numerical reasoning is weaker');
  console.log('💡 Focus on: Speed Math, Ratios, Percentages');
} else if (verbalAvg < numericalAvg) {
  console.log('⚠️  Verbal reasoning is weaker');
  console.log('💡 Focus on: Vocabulary, Logic, Analogies');
} else {
  console.log('✅ Both areas balanced');
}

console.log('');
