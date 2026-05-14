#!/usr/bin/env node
import { QVXFalconHandshake } from './agents/vera-qvx-falcon-handshake.mjs';

const handshake = new QVXFalconHandshake();

console.log('🦅 Testing QVX Falcon Handshake...\n');

try {
  await handshake.initialize('mainnet');
  
  console.log('\n🔐 Performing handshake: fedex-supply-1 ↔ vera-energy-auditor');
  const result = await handshake.performHandshake('fedex-supply-1', 'vera-energy-auditor');
  
  console.log('\n✅ Handshake successful!');
  console.log('Handshake ID:', result.handshakeId);
  console.log('Status:', result.status);
  console.log('Algorithm:', result.algorithm);
  
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
