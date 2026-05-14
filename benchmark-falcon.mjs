#!/usr/bin/env node
/**
 * Falcon-512 Performance Benchmark
 * Compare real Falcon vs simulated crypto
 */

import falcon from 'falcon-crypto';
import crypto from 'crypto';

console.log('\n🔬 Falcon-512 Performance Analysis\n');

const ITERATIONS = 100;

async function benchmarkRealFalcon() {
  console.log('Testing REAL Falcon-512 (falcon-crypto)...');
  
  const startKeygen = Date.now();
  const keys = await falcon.keyPair();
  const keygenTime = Date.now() - startKeygen;
  
  const message = Buffer.from('Test message for Falcon signing');
  
  const startSign = Date.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await falcon.signDetached(message, keys.privateKey);
  }
  const signTime = Date.now() - startSign;
  
  const signature = await falcon.signDetached(message, keys.privateKey);
  
  const startVerify = Date.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await falcon.verifyDetached(signature, message, keys.publicKey);
  }
  const verifyTime = Date.now() - startVerify;
  
  return {
    keygen: keygenTime,
    sign: signTime / ITERATIONS,
    verify: verifyTime / ITERATIONS,
    pubKeySize: keys.publicKey.length,
    privKeySize: keys.privateKey.length,
    sigSize: signature.length
  };
}

function benchmarkSimulated() {
  console.log('Testing SIMULATED crypto (SHA-256)...');
  
  const startKeygen = Date.now();
  const seed = crypto.randomBytes(32);
  const keygenTime = Date.now() - startKeygen;
  
  const message = 'Test message for simulated signing';
  
  const startSign = Date.now();
  for (let i = 0; i < ITERATIONS; i++) {
    crypto.createHmac('sha256', seed).update(message).digest();
  }
  const signTime = Date.now() - startSign;
  
  const signature = crypto.createHmac('sha256', seed).update(message).digest();
  
  const startVerify = Date.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const check = crypto.createHmac('sha256', seed).update(message).digest();
    const valid = signature.equals(check);
  }
  const verifyTime = Date.now() - startVerify;
  
  return {
    keygen: keygenTime,
    sign: signTime / ITERATIONS,
    verify: verifyTime / ITERATIONS,
    pubKeySize: 32,
    privKeySize: 32,
    sigSize: 32
  };
}

async function runBenchmark() {
  const sim = benchmarkSimulated();
  const real = await benchmarkRealFalcon();
  
  console.log('\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
  console.log('┃  📊 PERFORMANCE COMPARISON                                    ┃');
  console.log('┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫');
  console.log(`┃  Operation         │ Simulated    │ Real Falcon-512         ┃`);
  console.log('┣━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━━━━━━┫');
  console.log(`┃  Key Generation    │ ${sim.keygen.toString().padStart(3)}ms          │ ${real.keygen.toString().padStart(3)}ms                     ┃`);
  console.log(`┃  Sign (avg)        │ ${sim.sign.toFixed(2).padStart(6)}ms    │ ${real.sign.toFixed(2).padStart(6)}ms               ┃`);
  console.log(`┃  Verify (avg)      │ ${sim.verify.toFixed(2).padStart(6)}ms    │ ${real.verify.toFixed(2).padStart(6)}ms               ┃`);
  console.log('┣━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━━━━━━┫');
  console.log(`┃  Public Key Size   │ ${sim.pubKeySize.toString().padStart(4)} bytes    │ ${real.pubKeySize.toString().padStart(4)} bytes (${(real.pubKeySize/sim.pubKeySize).toFixed(0)}x)           ┃`);
  console.log(`┃  Signature Size    │ ${sim.sigSize.toString().padStart(4)} bytes     │ ${real.sigSize.toString().padStart(4)} bytes (${(real.sigSize/sim.sigSize).toFixed(0)}x)            ┃`);
  console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
  
  console.log('\n📈 Impact Summary:');
  const signRatio = real.sign / sim.sign;
  const verifyRatio = real.verify / sim.verify;
  
  if (signRatio < 10 && verifyRatio < 10) {
    console.log('✅ Performance impact: MINIMAL (< 10x slower)');
    console.log('   Falcon-512 is production-ready speed');
  } else if (signRatio < 100 && verifyRatio < 100) {
    console.log('⚠️  Performance impact: MODERATE (10-100x slower)');
    console.log('   Acceptable for high-security use cases');
  } else {
    console.log('🔴 Performance impact: SIGNIFICANT (>100x slower)');
    console.log('   Consider batching or caching');
  }
  
  console.log('\n💰 HCS Cost Impact:');
  const hcsBaseFee = 0.0001; // HBAR
  const sizeMultiplier = real.sigSize / 1024; // KB
  console.log(`   Base HCS fee: ~${hcsBaseFee} HBAR`);
  console.log(`   With Falcon signature overhead: ~${(hcsBaseFee * (1 + sizeMultiplier)).toFixed(5)} HBAR`);
  console.log(`   Cost increase: ~${((sizeMultiplier) * 100).toFixed(0)}% (negligible)`);
  
  console.log('\n🔐 Security Benefits:');
  console.log('   • NIST standardized post-quantum algorithm');
  console.log('   • Quantum computer resistant (unlike ECDSA/Ed25519)');
  console.log('   • 128-bit security level (NIST Level 1)');
  console.log('   • Future-proof against quantum attacks');
}

runBenchmark().catch(console.error);
