/**
 * Simple Retraining Launcher
 * Merges new HCS/DOVU data and prepares for training
 */

import * as fs from 'fs';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🧠 VERA RETRAINING LAUNCHER                                       ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Merge training data
const progressData = fs.readFileSync('./training/vera-progress-update.jsonl', 'utf8');
const existingData = fs.readFileSync('./training/vera-ft-train.jsonl', 'utf8');

const merged = existingData.trim() + '\n' + progressData.trim();
fs.writeFileSync('./training/vera-ft-train.jsonl', merged + '\n');

const newCount = progressData.trim().split('\n').length;
const totalCount = merged.trim().split('\n').length;

console.log('✅ Training Data Merged');
console.log(`   New examples added: ${newCount}`);
console.log(`   Total examples: ${totalCount}\n`);

console.log('📁 Files Updated:');
console.log('   • training/vera-ft-train.jsonl (merged)');
console.log('   • training/vera-progress-update.jsonl (source)\n');

console.log('═'.repeat(70));
console.log('🚀 MANUAL RETRAINING INSTRUCTIONS');
console.log('═'.repeat(70));
console.log('');
console.log('Since automated training scripts are not available,');
console.log('run training manually with one of these options:');
console.log('');
console.log('Option 1: Use existing training infrastructure');
console.log('   Check: python3 scripts/fine-tune-vera.py');
console.log('   Or:    node scripts/full-retrain-vera.js');
console.log('');
console.log('Option 2: Use llama.cpp directly');
console.log('   ./llama-finetune --model-base models/vera-*.gguf');
console.log('   --lora-out models/vera-retrained-v2.gguf');
console.log('   --train-data training/vera-ft-train.jsonl');
console.log('');
console.log('Option 3: Use Axolotl (recommended)');
console.log('   See: fine-tuning/README.md for Axolotl config');
console.log('');
console.log('═'.repeat(70));
console.log('\n🧠 Vera now has updated training data with:');
console.log('   • HCS topic IDs: 0.0.10409351, 0.0.10409353');
console.log('   • DOVU verification metrics');
console.log('   • Wallet: 0.0.10294360');
console.log('   • HashScan integration knowledge');
console.log('   • Live verification commands');
console.log('');
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  ✅ DATA PREP COMPLETE - Ready for training!                       ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
