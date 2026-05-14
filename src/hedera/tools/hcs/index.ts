/**
 * HCS - Hedera Consensus Service Tools
 * Messaging and topic management on Hedera
 */

import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicInfoQuery,
  PrivateKey
} from '@hashgraph/sdk';
import type { HederaTool, ToolResult } from '../index.js';
import { getClient } from '../client.js';

// ============================================================================
// Tool: Create Topic
// ============================================================================

export const createTopicTool: HederaTool = {
  name: 'hcs_create_topic',
  category: 'hcs',
  description: 'Create a new HCS topic for messaging. Topics can be public or restricted.',
  
  validateParams: (params) => {
    if (params.memo && typeof params.memo !== 'string') {
      return { valid: false, error: 'Memo must be a string' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TopicCreateTransaction();
      
      if (params.memo) {
        transaction.setTopicMemo(params.memo);
      }
      
      // Set submit key if provided (restricts who can submit)
      if (params.submitKey) {
        transaction.setSubmitKey(PrivateKey.fromString(params.submitKey));
      }
      
      // Set admin key if provided
      if (params.adminKey) {
        transaction.setAdminKey(PrivateKey.fromString(params.adminKey));
      }

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);
      const topicId = receipt.topicId!.toString();

      return {
        success: true,
        data: {
          topicId,
          memo: params.memo || null,
          restricted: !!params.submitKey
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/topic/${topicId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create topic: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Send Message
// ============================================================================

export const sendMessageTool: HederaTool = {
  name: 'hcs_send_message',
  category: 'hcs',
  description: 'Send a message to an HCS topic. Messages are immutable and timestamped.',
  
  validateParams: (params) => {
    if (!params.topicId) {
      return { valid: false, error: 'Topic ID is required' };
    }
    if (!params.message || typeof params.message !== 'string') {
      return { valid: false, error: 'Message content is required' };
    }
    // Check message size (max 1024 bytes for single chunk)
    const messageBytes = Buffer.byteLength(params.message, 'utf8');
    if (messageBytes > 1024) {
      return { valid: false, error: 'Message too large (max 1024 bytes per chunk)' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(params.topicId)
        .setMessage(params.message);

      const txResponse = await transaction.execute(client);
      const receipt = await txResponse.getReceipt(client);

      // Get sequence number from mirror node
      // Note: This requires mirror node query, simplified here
      const messageBytes = Buffer.byteLength(params.message, 'utf8');

      return {
        success: true,
        data: {
          topicId: params.topicId,
          messageLength: messageBytes,
          consensusTimestamp: new Date().toISOString()
        },
        transactionId: txResponse.transactionId.toString(),
        hashscanUrl: `https://hashscan.io/mainnet/topic/${params.topicId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Tool: Get Topic Info
// ============================================================================

export const getTopicInfoTool: HederaTool = {
  name: 'hcs_get_topic_info',
  category: 'hcs',
  description: 'Get information about an HCS topic including sequence number, memo, and keys.',
  
  validateParams: (params) => {
    if (!params.topicId) {
      return { valid: false, error: 'Topic ID is required' };
    }
    return { valid: true };
  },

  execute: async (params): Promise<ToolResult> => {
    const client = getClient();
    
    try {
      const topicInfo = await new TopicInfoQuery()
        .setTopicId(params.topicId)
        .execute(client);

      return {
        success: true,
        data: {
          topicId: params.topicId,
          memo: topicInfo.topicMemo,
          sequenceNumber: topicInfo.sequenceNumber.toString(),
          runningHash: Buffer.from(topicInfo.runningHash).toString('hex'),
          expirationTime: topicInfo.expirationTime?.toDate().toISOString() || null,
          adminKey: topicInfo.adminKey ? 'Present' : 'None',
          submitKey: topicInfo.submitKey ? 'Present' : 'None',
          autoRenewAccount: topicInfo.autoRenewAccountId?.toString() || null
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get topic info: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
};

// ============================================================================
// Export All HCS Tools
// ============================================================================

export const hcsTools: HederaTool[] = [
  createTopicTool,
  sendMessageTool,
  getTopicInfoTool
];

export default hcsTools;
