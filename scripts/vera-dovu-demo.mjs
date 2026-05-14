/**
 * Vera Dovu Integration Demo
 * Demonstrates Vera verifying data and earning DOVU tokens
 */

import { dovuAdapter, verificationEngine, notaryService, paymentOrchestrator } from '../dist/dovu/index.js';

async function runDovuDemo() {
  console.log('🌍 VERA DOVU VERIFICATION DEMO');
  console.log('='.repeat(70));
  console.log('Demonstrating Vera\'s ability to verify Dovu OS data');
  console.log('and earn DOVU tokens for her work\n');

  // Step 1: Initialize all services
  console.log('1️⃣  Initializing services...');
  try {
    await dovuAdapter.initialize();
    console.log('   ✅ DovuAdapter initialized');
  } catch (err) {
    console.log('   ⚠️  DovuAdapter init warning:', err.message);
  }
  
  try {
    await notaryService.initialize();
    console.log('   ✅ NotaryService initialized');
  } catch (err) {
    console.log('   ⚠️  NotaryService init warning (HCS topics):', err.message);
    console.log('   📋 Continuing with local-only notarization');
  }
  
  try {
    await paymentOrchestrator.initialize();
    console.log('   ✅ PaymentOrchestrator initialized');
  } catch (err) {
    console.log('   ⚠️  PaymentOrchestrator init warning:', err.message);
  }
  console.log('');

  // Step 2: Fetch data from Dovu OS
  console.log('2️⃣  Fetching carbon credit data from Dovu OS...');
  const dataId = 'CC-2024-001-COLOMBIA';
  const payload = await dovuAdapter.fetchDovuData(dataId);
  
  if (!payload) {
    console.error('   ❌ Failed to fetch data');
    return;
  }
  
  console.log(`   📊 Data received:`);
  console.log(`      - Type: ${payload.type}`);
  console.log(`      - Project: ${payload.data.projectId}`);
  console.log(`      - Carbon: ${payload.data.carbonTons} tons`);
  console.log(`      - Standard: ${payload.data.standard}`);
  console.log(`      - Location: ${payload.data.location}\n`);

  // Step 3: Verify the data
  console.log('3️⃣  Verifying data authenticity...');
  const result = await verificationEngine.verify(payload, 'standard');
  
  console.log(`   🔍 Verification Results:`);
  console.log(`      - Status: ${result.verified ? '✅ VERIFIED' : '❌ FAILED'}`);
  console.log(`      - Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`      - Risk Score: ${result.riskScore}/100`);
  console.log(`      - Depth: ${result.verificationDepth}`);
  console.log(`      - Checks passed: ${Object.values(result.checks).filter(Boolean).length}/${Object.keys(result.checks).length}`);
  console.log(`      - Hash: ${result.verificationHash.substring(0, 20)}...\n`);

  // Step 4: Create notarization
  console.log('4️⃣  Creating HCS notarization...');
  const notarization = await notaryService.notarize(payload, result);
  
  if (!notarization) {
    console.error('   ❌ Failed to create notarization');
    return;
  }
  
  console.log(`   📝 Notarization created:`);
  console.log(`      - ID: ${notarization.id}`);
  console.log(`      - HCS Topic: ${notarization.hcsTopicId}`);
  console.log(`      - HCS Sequence: ${notarization.hcsSequenceNumber}`);
  console.log(`      - Attestation Hash: ${notarization.attestationHash.substring(0, 20)}...`);
  console.log(`      - Timestamp: ${new Date(notarization.timestamp).toISOString()}\n`);

  // Step 5: Create payment request
  console.log('5️⃣  Creating payment request...');
  const request = await paymentOrchestrator.createPaymentRequest(
    notarization.id,
    result.verificationDepth,
    1
  );
  
  console.log(`   💰 Payment request created:`);
  console.log(`      - Request ID: ${request.id}`);
  console.log(`      - Amount: ${request.amount / 100000000} DOVU`);
  console.log(`      - Type: ${request.paymentType}`);
  console.log(`      - Status: ${request.status}\n`);

  // Step 6: Process payment (manual for demo)
  console.log('6️⃣  Processing payment...');
  const paymentSuccess = await paymentOrchestrator.processManualPayment(request.id);
  
  if (paymentSuccess) {
    console.log(`   ✅ Payment completed successfully!`);
    console.log(`      - Transaction ID: ${request.transactionId || 'N/A'}`);
    console.log(`      - Amount earned: ${request.amount / 100000000} DOVU tokens\n`);
  } else {
    console.log(`   ⚠️  Payment processing simulated (no actual transfer in demo)\n`);
  }

  // Step 7: Show statistics
  console.log('7️⃣  Vera\'s Dovu Statistics:');
  const stats = paymentOrchestrator.getPaymentStats();
  console.log(`   📈 Stats:`);
  console.log(`      - Total Payments: ${stats.totalPayments}`);
  console.log(`      - Total Earned: ${stats.totalAmount / 100000000} DOVU`);
  console.log(`      - Average Payment: ${(stats.averagePaymentAmount / 100000000).toFixed(2)} DOVU`);
  console.log(`      - Staking Rewards: ${stats.stakingRewardsEarned / 100000000} DOVU\n`);

  // Step 8: Create batch certificate (if multiple verifications)
  console.log('8️⃣  Creating completion certificate...');
  const certificate = await notaryService.createCertificate(
    'Carbon Credit Verification Batch #1',
    'Verification of Colombian carbon credit project data',
    [notarization.id]
  );
  
  if (certificate) {
    console.log(`   📜 Certificate issued:`);
    console.log(`      - ID: ${certificate.id}`);
    console.log(`      - Project: ${certificate.projectName}`);
    console.log(`      - Verifications: ${certificate.totalVerifications}`);
    console.log(`      - Successful: ${certificate.successfulVerifications}`);
    console.log(`      - Carbon Tons: ${certificate.totalCarbonTons}`);
    console.log(`      - HCS Sequence: ${certificate.hcsSequenceNumber}\n`);
  }

  console.log('='.repeat(70));
  console.log('✅ DEMO COMPLETE');
  console.log('='.repeat(70));
  console.log('Vera successfully:');
  console.log('  • Fetched data from Dovu OS');
  console.log('  • Verified authenticity using Hedera');
  console.log('  • Created immutable HCS attestation');
  console.log('  • Earned DOVU tokens for verification work');
  console.log('  • Issued completion certificate');
  console.log('\n🎯 Ready for production use!');
}

// Run the demo
runDovuDemo().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
