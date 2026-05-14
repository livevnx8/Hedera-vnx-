import { getCostOptimizedPoW } from '../src/hedera/costOptimizedPoW.js';

console.log('🔒 Creating Merkle Genesis Anchor...\n');

const pow = getCostOptimizedPoW();
await pow.initialize();

const result = await pow.anchorToHCS();

console.log('✅ Genesis Anchor Complete!');
console.log('Root Hash:', result.rootHash.slice(0, 40) + '...');
console.log('Anchor ID:', result.anchorId.slice(0, 16) + '...');
console.log('\n🚀 Ready for 24/7 Auto-Dominance');
