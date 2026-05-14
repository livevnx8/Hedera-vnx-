#!/usr/bin/env node
/**
 * Quick test of optimized Falcon handshake
 */

import { QVXFalconHandshake } from './agents/vera-qvx-falcon-handshake.mjs';

console.log('🧪 Testing Phase 1 Optimizations...\n');

const handshake = new QVXFalconHandshake();

try {
  await handshake.initialize('mainnet');
  
  console.log('\n🔐 Test 1: First handshake (generates new keys)');
  const result1 = await handshake.performHandshake('fedex-supply-1', 'vera-energy-auditor');
  console.log('✅ First handshake complete:', result1.handshakeId);
  
  console.log('\n🔐 Test 2: Second handshake (should use cached keys)');
  const result2 = await handshake.performHandshake('fedex-supply-1', 'vera-security-guardian');
  console.log('✅ Second handshake complete:', result2.handshakeId);
  
  // Display stats
  handshake.displayPerformanceStats();
  handshake.displayActiveHandshakes();
  
  // Wait for batch to flush then close
  setTimeout(() => {
    handshake.close();
    console.log('\n✅ Phase 1 optimizations working!');
    process.exit(0);
  }, 5000);
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
