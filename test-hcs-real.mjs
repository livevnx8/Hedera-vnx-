import { Client, TopicMessageSubmitTransaction, PrivateKey } from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

const TOPIC_ID = '0.0.10409351';

async function testHCS() {
  const keyStr = process.env.VERA_WALLET_PRIVATE_KEY || process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  const accountId = process.env.VERA_WALLET_ACCOUNT_ID || process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';
  
  console.log('🔑 Testing HCS with key...');
  console.log('Account:', accountId);
  console.log('Key exists:', !!keyStr);
  console.log('Key starts with 0x:', keyStr?.startsWith('0x'));
  console.log('Key length:', keyStr?.length);
  
  if (!keyStr) {
    console.log('❌ No key found');
    return;
  }
  
  // Handle 0x prefix
  const cleanKey = keyStr.startsWith('0x') ? keyStr.slice(2) : keyStr;
  console.log('Clean key length:', cleanKey.length);
  
  try {
    let privateKey;
    
    if (cleanKey.length === 64) {
      try {
        privateKey = PrivateKey.fromStringECDSA(cleanKey);
        console.log('✅ ECDSA key loaded');
      } catch (e) {
        console.log('ECDSA failed:', e.message.substring(0, 50));
        privateKey = PrivateKey.fromStringED25519(cleanKey);
        console.log('✅ Ed25519 key loaded');
      }
    } else {
      privateKey = PrivateKey.fromString(cleanKey);
      console.log('✅ Key loaded (fromString)');
    }
    
    const client = Client.forMainnet();
    client.setOperator(accountId, privateKey);
    console.log('✅ Client initialized');
    
    // Test submit
    const testMsg = JSON.stringify({
      type: 'TEST',
      timestamp: Date.now(),
      message: 'Vera retraining test'
    });
    
    console.log('📡 Submitting test message...');
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(TOPIC_ID)
      .setMessage(testMsg)
      .execute(client);
    
    const receipt = await tx.getReceipt(client);
    const seq = receipt.topicSequenceNumber?.toString();
    
    console.log('✅ SUCCESS! Sequence:', seq);
    console.log('🔗 HashScan: https://hashscan.io/mainnet/topic/' + TOPIC_ID);
    
    client.close();
    
  } catch (error) {
    console.log('❌ FAILED:', error.message);
  }
}

testHCS();
