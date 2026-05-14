import { getCostOptimizedPoW } from '../src/hedera/costOptimizedPoW.js';
import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import { config } from '../src/config.js';

console.log('🔒 Creating Genesis Anchor...\n');

const pow = getCostOptimizedPoW();
await pow.initialize();

const client = Client.forMainnet();
const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY || '';
let privateKey;
if (keyStr.length === 64) {
  try { privateKey = PrivateKey.fromStringECDSA(keyStr); } 
  catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
} else {
  privateKey = PrivateKey.fromString(keyStr);
}
client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID || '', privateKey);

const result = await pow.anchorToHCS();

console.log('✅ Genesis Anchor Created!');
console.log('Root:', result.rootHash.slice(0, 32) + '...');
console.log('Anchor ID:', result.anchorId);
console.log('\n🔗 Verify: https://hashscan.io/mainnet/topic/0.0.10407552');
console.log('\n🚀 Ready for 24/7 Live Dominance');
