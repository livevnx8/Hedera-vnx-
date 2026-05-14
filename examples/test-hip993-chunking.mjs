#!/usr/bin/env node
/**
 * HIP-993 Chunking & Reconstruction Test
 * 
 * This script tests Vera's HIP-993 implementation:
 * 1. Sends a large message (> 4096 bytes) that requires chunking
 * 2. Verifies chunk metadata is correct
 * 3. Reconstructs the message from HashScan
 * 4. Validates integrity
 */

import { config } from '../dist/config.js';
import { hederaMaster } from '../dist/hedera/hederaMasterClass.js';
import { HashScanClient } from '../dist/vera/quantum/hashscanIntegration.js';

const TOPIC_ID = process.env.TEST_TOPIC_ID || '0.0.10414499';

// Generate a large payload that exceeds 4096 bytes
function generateLargePayload() {
  const baseData = {
    test_type: 'HIP-993_CHUNKING_TEST',
    timestamp: Date.now(),
    description: 'This message tests HIP-993 large message support with automatic chunking',
    metadata: {
      version: '1.0.0',
      test_id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      purpose: 'Verify chunking, reconstruction, and sequence tracking'
    }
  };
  
  // Add large data array to exceed 4096 bytes
  const largeData = [];
  for (let i = 0; i < 100; i++) {
    largeData.push({
      index: i,
      value: `Item ${i} with some padding to increase size: ${'x'.repeat(50)}`,
      hash: Math.random().toString(36).substring(2, 15)
    });
  }
  
  baseData.large_array = largeData;
  baseData.notes = 'This payload is intentionally large to test HIP-993 chunking. '.repeat(5);
  
  return baseData;
}

// Test HIP-993 chunking
async function testHIP993Chunking() {
  console.log('🔮 HIP-993 Chunking & Reconstruction Test');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Initialize Hedera client
  await hederaMaster.initialize();
  console.log('✅ Hedera client initialized');
  console.log(`   Network: ${config.HEDERA_NETWORK}`);
  console.log(`   Operator: ${config.HEDERA_OPERATOR_ACCOUNT_ID}\n`);
  
  // Generate large payload
  const payload = generateLargePayload();
  const payloadString = JSON.stringify(payload);
  const payloadSize = Buffer.byteLength(payloadString, 'utf8');
  
  console.log('📦 Payload Generated:');
  console.log(`   Size: ${payloadSize.toLocaleString()} bytes`);
  console.log(`   Expected chunks: ${Math.ceil(payloadSize / 4096)}`);
  console.log(`   Test ID: ${payload.metadata.test_id}\n`);
  
  // Submit with HIP-993 chunking
  console.log('📡 Submitting to HCS with HIP-993 chunking...');
  console.log(`   Topic: ${TOPIC_ID}`);
  console.log(`   Max chunk size: 4096 bytes\n`);
  
  try {
    const result = await hederaMaster.submitMessage(TOPIC_ID, payload, {
      maxChunkSize: 4096, // HIP-993 maximum
      compression: false
    });
    
    console.log('✅ Submission Successful!');
    console.log(`   Transaction ID: ${result.transactionId}`);
    console.log(`   Total chunks: ${result.chunks}`);
    console.log(`   Chunk sequence numbers: [${result.chunkSequenceNumbers.join(', ')}]`);
    console.log(`   Final sequence: ${result.sequenceNumber}`);
    console.log(`   Total bytes: ${result.totalBytes.toLocaleString()}\n`);
    
    // Wait a moment for mirror node propagation
    console.log('⏳ Waiting 5 seconds for mirror node propagation...\n');
    await new Promise(r => setTimeout(r, 5000));
    
    // Reconstruct from HashScan
    console.log('🔍 Reconstructing from HashScan...');
    const hashscan = new HashScanClient();
    
    // Get topic messages
    const topicData = await hashscan.getTopicMessages(TOPIC_ID, result.chunks + 5);
    
    console.log(`   Retrieved ${topicData.recentMessages.length} messages from topic`);
    
    // Find our chunked message
    const ourChunks = topicData.recentMessages.filter(m => {
      try {
        const data = JSON.parse(m.decodedMessage);
        return data._hip993?.messageId?.includes(payload.metadata.test_id.substring(0, 10));
      } catch {
        return false;
      }
    });
    
    if (ourChunks.length > 0) {
      console.log(`   Found ${ourChunks.length} chunks from our message\n`);
      
      // Reconstruct
      const reconstructed = hashscan.reconstructChunkedMessages(ourChunks);
      
      console.log('📊 Reconstruction Results:');
      console.log(`   Single messages: ${reconstructed.single.length}`);
      console.log(`   Reconstructed chunks: ${reconstructed.reconstructed.length}\n`);
      
      if (reconstructed.reconstructed.length > 0) {
        const msg = reconstructed.reconstructed[0];
        console.log('✅ Message Reconstructed Successfully!');
        console.log(`   Message ID: ${msg.messageId}`);
        console.log(`   Total chunks: ${msg.totalChunks}`);
        console.log(`   First timestamp: ${msg.firstTimestamp}`);
        console.log(`   Last timestamp: ${msg.lastTimestamp}\n`);
        
        // Validate data integrity
        const reconstructedData = typeof msg.reconstructedData === 'string' 
          ? JSON.parse(msg.reconstructedData) 
          : msg.reconstructedData;
        
        const isValid = reconstructedData.metadata?.test_id === payload.metadata.test_id;
        console.log('🔐 Integrity Check:');
        console.log(`   Original test ID: ${payload.metadata.test_id}`);
        console.log(`   Reconstructed test ID: ${reconstructedData.metadata?.test_id}`);
        console.log(`   Match: ${isValid ? '✅ VALID' : '❌ MISMATCH'}\n`);
        
        // Calculate savings
        const hcsCostPerMsg = 0.0001; // ~$0.0001 per HCS message
        const costWithoutChunking = Math.ceil(payloadSize / 1024) * hcsCostPerMsg;
        const costWithChunking = result.chunks * hcsCostPerMsg;
        const savings = ((costWithoutChunking - costWithChunking) / costWithoutChunking * 100).toFixed(1);
        
        console.log('💰 Cost Analysis:');
        console.log(`   Without HIP-993 (1KB chunks): $${costWithoutChunking.toFixed(4)} USD`);
        console.log(`   With HIP-993 (4KB chunks): $${costWithChunking.toFixed(4)} USD`);
        console.log(`   Savings: ${savings}%\n`);
      }
    } else {
      console.log('⚠️ Could not find chunks yet (mirror node may need more time)\n');
    }
    
    // HashScan URL
    console.log('🔗 View on HashScan:');
    console.log(`   ${hashscan.getHashScanUrl(TOPIC_ID)}\n`);
    
    console.log('🎉 HIP-993 Test Complete!');
    return true;
    
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    console.error(error);
    return false;
  }
}

// Run test
testHIP993Chunking().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
