// Debug Falcon-512 library
const falcon = require('falcon-crypto');

async function testFalcon() {
  console.log('Testing Falcon-512...\n');
  
  // Test key generation
  console.log('1. Generating keypair...');
  const keys = await falcon.keyPair();
  console.log('   Public key:', keys.publicKey.length, 'bytes');
  console.log('   Private key:', keys.privateKey.length, 'bytes');
  
  // Test signing
  console.log('\n2. Signing message...');
  const message = new TextEncoder().encode('Test message');
  console.log('   Message:', message.length, 'bytes');
  
  const signature = await falcon.signDetached(message, keys.privateKey);
  console.log('   Signature:', signature.length, 'bytes');
  
  // Test verification
  console.log('\n3. Verifying signature...');
  const valid = await falcon.verifyDetached(signature, message, keys.publicKey);
  console.log('   Valid:', valid);
  
  // Test with wrong message
  console.log('\n4. Testing with wrong message (should fail)...');
  const wrongMessage = new TextEncoder().encode('Wrong message');
  const invalid = await falcon.verifyDetached(signature, wrongMessage, keys.publicKey);
  console.log('   Valid:', invalid, '(should be false)');
  
  console.log('\n✅ Falcon-512 working correctly!');
}

testFalcon().catch(e => {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
});
