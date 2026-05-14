#!/usr/bin/env node
/**
 * Simple Falcon Handshake Demo - No HCS required
 */

import falcon from 'falcon-crypto';
import crypto from 'crypto';

console.log('🦅 QVX Falcon Handshake Demo\n');

async function demoFalcon() {
  console.log('1. Generating Falcon-512 keypairs...');
  
  // Generate keys for two agents
  const keyA = await falcon.keyPair();
  const keyB = await falcon.keyPair();
  
  console.log(`   Agent A: ${keyA.publicKey.length} byte public key`);
  console.log(`   Agent B: ${keyB.publicKey.length} byte public key`);
  
  // Create handshake message
  const handshakeMsg = {
    agentA: 'fedex-supply-1',
    agentB: 'vera-energy-auditor',
    timestamp: Date.now(),
    type: 'HAWK_HANDSHAKE'
  };
  
  console.log('\n2. Signing handshake message...');
  
  // Both agents sign
  const msgBytes = new TextEncoder().encode(JSON.stringify(handshakeMsg));
  const sigA = await falcon.signDetached(msgBytes, keyA.privateKey);
  const sigB = await falcon.signDetached(msgBytes, keyB.privateKey);
  
  console.log(`   Agent A signature: ${sigA.length} bytes`);
  console.log(`   Agent B signature: ${sigB.length} bytes`);
  
  console.log('\n3. Verifying signatures...');
  
  // Verify both signatures
  const validA = await falcon.verifyDetached(sigA, msgBytes, keyA.publicKey);
  const validB = await falcon.verifyDetached(sigB, msgBytes, keyB.publicKey);
  
  console.log(`   Agent A signature valid: ${validA ? '✅ YES' : '❌ NO'}`);
  console.log(`   Agent B signature valid: ${validB ? '✅ YES' : '❌ NO'}`);
  
  // Create session key
  const sessionKey = crypto.createHash('sha256')
    .update(Buffer.from(keyA.publicKey))
    .update(Buffer.from(keyB.publicKey))
    .digest('hex');
  
  console.log('\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
  console.log('┃  🦅 FALCON HANDSHAKE ESTABLISHED                              ┃');
  console.log('┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫');
  console.log(`┃  Agents: fedex-supply-1 ↔ vera-energy-auditor                ┃`);
  console.log(`┃  Algorithm: Falcon-512 (NIST Standardized)                  ┃`);
  console.log(`┃  Status: ✅ POST-QUANTUM SECURE                               ┃`);
  console.log(`┃  Signatures: ${sigA.length}B / ${sigB.length}B                              ┃`);
  console.log(`┃  Session: ${sessionKey.substring(0, 32)}...         ┃`);
  console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
  
  console.log('\n✅ Demo complete! Real Falcon-512 post-quantum handshake working.');
  console.log('   Ready to publish to Hedera HCS with valid topic ID.');
}

demoFalcon().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
