import { PrivateKey } from '@hashgraph/sdk';

const keyStr = '9cfa3e5df71a208161cde815aa4fe918bc1a3ed0d98c1317b9181b6fc07b5f6b';

console.log('Testing key...');
console.log('Key length:', keyStr.length);

if (keyStr.length === 64) {
  try {
    const pk = PrivateKey.fromStringECDSA(keyStr);
    console.log('✅ ECDSA key loaded successfully');
    console.log('Public key:', pk.publicKey.toString().substring(0, 30) + '...');
  } catch (e) {
    console.log('❌ ECDSA failed:', e.message);
    try {
      const pk = PrivateKey.fromStringED25519(keyStr);
      console.log('✅ Ed25519 key loaded successfully');
    } catch (e2) {
      console.log('❌ Ed25519 also failed:', e2.message);
    }
  }
}
