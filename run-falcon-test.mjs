#!/usr/bin/env node
import { QVXFalconHandshake } from './agents/vera-qvx-falcon-handshake.mjs';

console.log('🦅 Testing QVX Falcon Handshake with HCS Topic 0.0.10417507...\n');

const handshake = new QVXFalconHandshake();

try {
  await handshake.initialize('mainnet');
  console.log('Topic configured:', handshake.topicId);
  
  console.log('\n🔐 Performing handshake: fedex-supply-1 ↔ vera-energy-auditor');
  const result = await handshake.performHandshake('fedex-supply-1', 'vera-energy-auditor');
  
  console.log('\n✅ SUCCESS! Falcon handshake published to HCS!');
  console.log('Handshake ID:', result.handshakeId);
  console.log('Status:', result.status);
  
  handshake.displayActiveHandshakes();
  
  setTimeout(() => {
    handshake.close();
    process.exit(0);
  }, 2000);
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
