/**
 * Phase 1 Implementation Demo
 * 
 * Demonstrates the three core workstreams:
 * 1. AI Intelligence (Fine-tuning + Reasoning)
 * 2. Revenue Infrastructure (x402 Payments + Usage Tracking)
 * 3. Security Hardening (TEE + Encryption)
 * 
 * Usage: npx ts-node scripts/demo-phase1-implementation.ts
 */

import { datasetCurator, chainOfThought } from '../src/ai/index.js';
import { x402Payments, usageTracker } from '../src/revenue/index.js';
import { teeManager } from '../src/security/index.js';
import { logger } from '../src/monitoring/logger.js';

// ─── Demo Configuration ─────────────────────────────────────────────────────

const DEMO_CONFIG = {
  userId: 'demo-user-' + Date.now(),
  apiKey: 'demo-key-' + Math.random().toString(36).substr(2, 9),
  tier: 'pro' as const,
};

// ─── AI Intelligence Demo ───────────────────────────────────────────────────

async function demoAIIntelligence(): Promise<void> {
  console.log('\n🧠 === AI INTELLIGENCE DEMO ===\n');

  // 1. Build Hedera-specific training dataset
  console.log('Building training dataset...');
  datasetCurator.addTokenExamples();
  datasetCurator.addDeFiExamples();
  
  // Add custom examples
  datasetCurator.addExample(
    'Explain Hedera consensus mechanism',
    '',
    `Hedera uses the Hashgraph consensus algorithm, which is:
1. Asynchronous Byzantine Fault Tolerant (ABFT)
2. Fair - no leader, no miners
3. Fast - 10,000+ TPS, 3-5 second finality
4. Secure - aBFT security guarantees
5. Efficient - minimal energy consumption (~0.0001 kWh per transaction)`,
    'general'
  );

  const dataset = datasetCurator.buildDataset();
  console.log(`✅ Dataset created: ${dataset.instructions.length} examples`);
  console.log(`   Categories: token, defi, general`);

  // 2. Demonstrate reasoning with chain-of-thought
  console.log('\nTesting chain-of-thought reasoning...');
  
  const problem = 'If I have 1000 HBAR and want to maximize yield, should I stake on Hedera or provide liquidity to a DEX? Consider risks, returns, and lock-up periods.';
  
  console.log(`Problem: ${problem}`);
  console.log('Thinking...\n');

  const result = await chainOfThought.solve(problem);

  console.log(`✅ Reasoning complete (${result.steps.length} steps, ${result.totalDuration}ms)`);
  console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`   Reflection Score: ${(result.reflectionScore * 100).toFixed(1)}%`);
  console.log(`   Tools used: ${result.toolCalls.length}`);
  
  console.log('\n--- Reasoning Steps ---');
  result.steps.forEach(step => {
    console.log(`\nStep ${step.stepNumber}: ${step.thought.substring(0, 100)}...`);
    if (step.action) console.log(`   → Action: ${step.action}`);
    if (step.observation) console.log(`   ← Observation: ${step.observation.substring(0, 80)}`);
  });

  console.log('\n--- Final Answer ---');
  console.log(result.finalAnswer.substring(0, 500) + '...');

  // 3. Export dataset for fine-tuning
  const jsonl = datasetCurator.exportToJSONL();
  console.log(`\n✅ Dataset exportable to JSONL (${jsonl.split('\n').length} lines)`);

  // Note: Fine-tuning would require PyTorch + Unsloth
  console.log('\n⚠️  Fine-tuning requires PyTorch/Unsloth (install: pip install unsloth)');
  console.log('   Once installed: unslothTrainer.startTraining(dataset)');
}

// ─── Revenue Infrastructure Demo ────────────────────────────────────────────

async function demoRevenueInfrastructure(): Promise<void> {
  console.log('\n💰 === REVENUE INFRASTRUCTURE DEMO ===\n');

  // 1. Set up usage tracking
  console.log('Setting up usage tracking...');
  
  const endpoints = [
    'agent/list',
    'vera/oasis/think',
    'llm/query',
    'handshake/initiate',
  ];

  for (const endpoint of endpoints) {
    const result = await usageTracker.recordCall(
      DEMO_CONFIG.userId,
      DEMO_CONFIG.apiKey,
      endpoint,
      DEMO_CONFIG.tier,
      endpoint === 'llm/query' ? { tokens: 1500 } : undefined
    );

    if (result.allowed) {
      console.log(`✅ ${endpoint}: $${result.cost.toFixed(4)}`);
    } else {
      console.log(`❌ ${endpoint}: ${result.reason}`);
    }
  }

  // 2. Check usage stats
  const usage = usageTracker.getUsage(DEMO_CONFIG.userId, DEMO_CONFIG.apiKey);
  console.log(`\nUsage Summary:`);
  console.log(`   Calls today: ${usage?.callsToday}`);
  console.log(`   Calls this month: ${usage?.callsThisMonth}`);
  console.log(`   Total spend: $${usage?.totalSpend.toFixed(4)}`);
  console.log(`   Remaining (Pro tier): ${10000 - (usage?.callsThisMonth || 0)} calls`);

  // 3. Demonstrate x402 payment streaming
  console.log('\nSetting up x402 payment stream...');
  
  // Listen for payment events
  x402Payments.on('stream_opened', (stream) => {
    console.log(`✅ Payment stream opened: ${stream.streamId}`);
  });

  x402Payments.on('verification', (verification) => {
    console.log(`   💵 Verification: $${verification.amountPaid.toFixed(4)} (${verification.isValid ? 'VALID' : 'INVALID'})`);
  });

  x402Payments.on('stream_terminated', ({ reason }) => {
    console.log(`❌ Stream terminated: ${reason}`);
  });

  // Open a payment stream
  const stream = await x402Payments.openPaymentStream({
    clientAddress: '0.0.123456',
    resource: 'premium-api-access',
    ratePerSecond: 0.001, // $0.001 per second
    maxDurationSeconds: 300, // 5 minutes max
    currency: 'USD',
  });

  console.log(`   Stream ID: ${stream.streamId}`);
  console.log(`   Rate: $${stream.ratePerSecond}/second`);
  console.log(`   Max duration: ${stream.maxDurationSeconds}s`);

  // Simulate 3 verification cycles (normally every 30s)
  console.log('\nSimulating payment verifications...');
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Get revenue stats
  const stats = x402Payments.getRevenueStats();
  console.log(`\nRevenue Stats:`);
  console.log(`   Active streams: ${stats.activeStreams}`);
  console.log(`   Total revenue: $${stats.totalRevenue.toFixed(4)}`);
  console.log(`   Avg stream duration: ${stats.averageStreamDuration.toFixed(0)}s`);

  // Clean up
  await x402Payments.closeStream(stream.streamId);
  console.log('\n✅ Revenue demo complete');
}

// ─── Security Hardening Demo ────────────────────────────────────────────────

async function demoSecurityHardening(): Promise<void> {
  console.log('\n🛡️  === SECURITY HARDENING DEMO ===\n');

  // 1. Auto-initialize TEE
  console.log('Initializing Trusted Execution Environment...');
  
  const initResult = await teeManager.autoInitialize();
  console.log(`   Status: ${initResult.success ? '✅ SUCCESS' : '⚠️  FALLBACK'}`);
  console.log(`   TEE Type: ${initResult.teeType || 'None (Software mode)'}`);
  console.log(`   Message: ${initResult.message}`);

  if (initResult.success && initResult.teeType) {
    // 2. Get attestation report
    console.log('\nGenerating attestation report...');
    const attestation = await teeManager.getAttestation();
    
    if (attestation) {
      console.log(`   Measurement: ${attestation.measurement?.substring(0, 40)}...`);
      console.log(`   Timestamp: ${new Date(attestation.timestamp).toISOString()}`);
      console.log(`   Valid: ${attestation.isValid ? '✅' : '❌'}`);
    }

    // 3. Execute secure operations
    console.log('\nExecuting secure operations in TEE...');
    
    const keyGen = await teeManager.executeSecure('generate_key', { type: 'ed25519' });
    console.log(`✅ Key generated in TEE`);
    console.log(`   Public Key: ${(keyGen as any).publicKey?.substring(0, 40)}...`);

    const signature = await teeManager.executeSecure('sign_transaction', {
      data: 'demo_transaction_data',
      keyHandle: (keyGen as any).privateKeyHandle,
    });
    console.log(`✅ Transaction signed in TEE`);
    console.log(`   Signature: ${(signature as any).signature?.substring(0, 40)}...`);

    // 4. Seal and unseal sensitive data
    console.log('\nTesting sealed storage...');
    
    const sensitiveData = Buffer.from('private_key_12345_secret_data');
    const sealed = await teeManager.sealData(sensitiveData, {
      enclaveMeasurement: attestation?.measurement,
    });
    
    console.log(`✅ Data sealed`);
    console.log(`   Sealed size: ${sealed.data.length} bytes`);
    console.log(`   Policy: ${JSON.stringify(sealed.policy)}`);

    const unsealed = await teeManager.unsealData(sealed);
    const isMatch = unsealed.toString() === sensitiveData.toString();
    console.log(`✅ Data unsealed: ${isMatch ? 'MATCH' : 'MISMATCH'}`);

    // 5. Get enclave status
    const status = teeManager.getStatus();
    console.log(`\nEnclave Status:`);
    console.log(`   ID: ${status?.id}`);
    console.log(`   Status: ${status?.status}`);
    console.log(`   Operations: ${status?.operationsCount}`);
    console.log(`   Memory used: ${status?.memoryUsed} bytes`);
    console.log(`   Uptime: ${((Date.now() - (status?.startTime || 0)) / 1000).toFixed(1)}s`);

    // Cleanup
    await teeManager.terminate();
    console.log('\n✅ TEE terminated cleanly');
  } else {
    console.log('\n⚠️  Running in software-only mode (no TEE available)');
    console.log('   For production: Enable Intel SGX, AMD SEV, or AWS Nitro');
  }
}

// ─── Integration Demo ───────────────────────────────────────────────────────

async function demoFullIntegration(): Promise<void> {
  console.log('\n🚀 === FULL INTEGRATION DEMO ===\n');
  console.log('Demonstrating AI × Revenue × Security working together\n');

  // Scenario: User makes an AI query with secure payment

  console.log('Scenario: Enterprise user queries Vera AI with secure payment\n');

  // Step 1: Check usage and payment
  const usageCheck = await usageTracker.recordCall(
    'enterprise-user-1',
    'ent-key-abc123',
    'vera/oasis/think',
    'enterprise'
  );

  if (!usageCheck.allowed) {
    console.log('❌ Usage quota exceeded');
    return;
  }

  console.log(`✅ Usage authorized: $${usageCheck.cost}`);

  // Step 2: Initialize TEE for secure processing
  const teeResult = await teeManager.autoInitialize();
  console.log(`✅ TEE ready: ${teeResult.teeType || 'software mode'}`);

  // Step 3: Execute AI reasoning in secure environment
  console.log('\nExecuting secure AI reasoning...');
  
  const query = 'Analyze the risk of providing liquidity to a new DeFi protocol on Hedera';
  console.log(`Query: "${query}"`);

  // If TEE is available, execute in enclave
  let reasoningResult;
  if (teeResult.success) {
    reasoningResult = await teeManager.executeSecure('ai_reasoning', { query });
    console.log('✅ AI reasoning executed in TEE');
  } else {
    // Fallback to normal execution
    const cotResult = await chainOfThought.solve(query);
    reasoningResult = { answer: cotResult.finalAnswer, confidence: cotResult.confidence };
    console.log('✅ AI reasoning executed (software mode)');
  }

  console.log(`\nResult confidence: ${(reasoningResult as any).confidence * 100}%`);
  console.log(`Answer preview: ${(reasoningResult as any).answer?.substring(0, 200)}...`);

  // Step 4: Log to HCS for audit
  console.log('\nLogging to HCS...');
  try {
    const { hcsDomainLogger } = await import('../src/vera/logging/hcsDomainLogger.js');
    await hcsDomainLogger.logEvent('auditTopicId', {
      type: 'secure_ai_query',
      user: 'enterprise-user-1',
      query: query.substring(0, 100),
      cost: usageCheck.cost,
      tee: teeResult.teeType || 'none',
      timestamp: Date.now(),
    });
    console.log('✅ Audit log written to HCS');
  } catch (error) {
    console.log('⚠️  HCS logging skipped (topic not configured)');
  }

  // Cleanup
  if (teeResult.success) {
    await teeManager.terminate();
  }

  console.log('\n✅ Integration demo complete!');
}

// ─── Main Demo Runner ───────────────────────────────────────────────────────

async function runDemo(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     VERA PHASE 1 IMPLEMENTATION DEMO                         ║');
  console.log('║     AI Intelligence × Revenue × Security                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await demoAIIntelligence();
    await demoRevenueInfrastructure();
    await demoSecurityHardening();
    await demoFullIntegration();

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     DEMO COMPLETE ✅                                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\nNext Steps:');
    console.log('1. Install PyTorch: pip install torch --index-url https://download.pytorch.org/whl/cu121');
    console.log('2. Install Unsloth: pip install unsloth');
    console.log('3. Run fine-tuning: npm run train:hedera');
    console.log('4. Deploy x402: Configure HCS payment topic ID');
    console.log('5. Enable TEE: Set up Intel SGX or AWS Nitro\n');

  } catch (error) {
    console.error('\n❌ Demo failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo();
}

export { runDemo };
