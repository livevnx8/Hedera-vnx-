import { paymentTopicManager } from './src/vera/orchestrator/topicManager.js';
import { config } from './src/config.js';

async function main() {
  console.log('🔧 Creating Vera payment topics...');
  console.log('Network:', config.HEDERA_NETWORK);
  
  const topics = await paymentTopicManager.ensureTopics();
  
  console.log('\n✅ Topics created/loaded:');
  console.log('Registry:', topics.registryTopicId || 'NOT CREATED');
  console.log('Task:', topics.taskTopicId || 'NOT CREATED');
  console.log('Result:', topics.resultTopicId || 'NOT CREATED');
  console.log('Audit:', topics.auditTopicId || 'NOT CREATED');
  
  if (topics.registryTopicId) {
    const network = config.HEDERA_NETWORK;
    console.log('\n🔗 HashScan URLs:');
    console.log(`Registry: https://hashscan.io/${network}/topic/${topics.registryTopicId}`);
    console.log(`Task:     https://hashscan.io/${network}/topic/${topics.taskTopicId}`);
    console.log(`Result:   https://hashscan.io/${network}/topic/${topics.resultTopicId}`);
    console.log(`Audit:    https://hashscan.io/${network}/topic/${topics.auditTopicId}`);
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
