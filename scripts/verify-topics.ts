#!/usr/bin/env tsx
/**
 * Verify Topics Script
 * Checks all HCS topics exist and are accessible
 */

import { getClient } from '../src/hedera/tools/client.js';
import { TopicInfoQuery } from '@hashgraph/sdk';

const TOPICS = {
  CORE: process.env.VERA_CORE_TOPIC_ID,
  PAYMENT: process.env.VERA_PAYMENT_TOPIC_ID,
  AUDIT: process.env.VERA_AUDIT_TOPIC_ID,
  VERIFICATION: process.env.VERA_VERIFICATION_TOPIC_ID,
  MILESTONE: process.env.VERA_MILESTONE_TOPIC_ID,
};

async function verifyTopics() {
  console.log('🔍 Verifying HCS Topics...\n');
  
  const client = getClient();
  let allValid = true;
  
  for (const [name, topicId] of Object.entries(TOPICS)) {
    if (!topicId) {
      console.log(`❌ ${name}: Not configured`);
      allValid = false;
      continue;
    }
    
    try {
      const info = await new TopicInfoQuery()
        .setTopicId(topicId)
        .execute(client);
      
      console.log(`✅ ${name}: ${topicId}`);
      console.log(`   Memo: ${info.topicMemo}`);
      console.log(`   Sequence: ${info.sequenceNumber?.toString() || 'N/A'}`);
    } catch (error) {
      console.log(`❌ ${name}: ${topicId} - ${error instanceof Error ? error.message : 'Unknown error'}`);
      allValid = false;
    }
  }
  
  console.log('\n' + (allValid ? '✅ All topics verified' : '❌ Some topics failed verification'));
  process.exit(allValid ? 0 : 1);
}

verifyTopics();
