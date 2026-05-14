/**
 * Hedera Staking Tools
 * 
 * Tools for managing Hedera native staking - getting info, claiming rewards,
 * updating staked node, and viewing reward history.
 */

import { 
  Client, 
  AccountId, 
  AccountInfoQuery,
  AccountUpdateTransaction,
  TransferTransaction,
  Hbar,
  TransactionId,
} from '@hashgraph/sdk';
import { logger } from '../monitoring/logger.js';

export interface StakingInfo {
  stakedAccountId: string | null;
  stakedNodeId: number | null;
  stakePeriodStart: Date | null;
  pendingReward: number;
  rewardedHbar: number;
  stakedToMe: number;
  declineReward: boolean;
}

export interface StakingReward {
  accountId: string;
  amount: number;
  timestamp: Date;
  period: number;
}

export interface NodeInfo {
  nodeId: number;
  accountId: string;
  description: string;
  stake: number;
  minStake: number;
  maxStake: number;
  rewardRate: number;
}

/**
 * Get staking information for an account
 */
export async function getStakingInfo(
  client: Client,
  accountId: string
): Promise<{ success: boolean; info?: StakingInfo; error?: string }> {
  try {
    const query = new AccountInfoQuery()
      .setAccountId(AccountId.fromString(accountId));

    const info = await query.execute(client);
    const stakingInfo = info.stakingInfo;

    return {
      success: true,
      info: {
        stakedAccountId: stakingInfo?.stakedAccountId?.toString() || null,
        stakedNodeId: stakingInfo?.stakedNodeId ?? null,
        stakePeriodStart: stakingInfo?.stakePeriodStart?.toDate() || null,
        pendingReward: stakingInfo?.pendingReward?.toTinybars().toNumber() / 100_000_000 || 0,
        rewardedHbar: 0, // SDK doesn't expose this directly
        stakedToMe: stakingInfo?.stakedToMe?.toTinybars().toNumber() / 100_000_000 || 0,
        declineReward: false, // SDK doesn't expose this directly
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('StakingTools', { message: 'Failed to get staking info', accountId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Update staked node for an account
 */
export async function updateStakedNode(
  client: Client,
  accountId: string,
  nodeId: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setStakedNodeId(nodeId)
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    logger.info('StakingTools', { 
      message: 'Staked node updated', 
      accountId, 
      nodeId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('StakingTools', { message: 'Failed to update staked node', accountId, nodeId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Stake to another account (proxy staking)
 */
export async function stakeToAccount(
  client: Client,
  accountId: string,
  stakedAccountId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setStakedAccountId(AccountId.fromString(stakedAccountId))
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    logger.info('StakingTools', { 
      message: 'Staked to account', 
      accountId, 
      stakedAccountId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('StakingTools', { message: 'Failed to stake to account', accountId, stakedAccountId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Claim staking rewards
 * This is done by transferring from account 0.0.800 (staking reward account)
 */
export async function claimStakingRewards(
  client: Client,
  accountId: string
): Promise<{ success: boolean; txId?: string; amount?: number; error?: string }> {
  try {
    // First check pending rewards
    const infoResult = await getStakingInfo(client, accountId);
    if (!infoResult.success) {
      return { success: false, error: infoResult.error };
    }

    const pendingReward = infoResult.info?.pendingReward || 0;
    if (pendingReward <= 0) {
      return { success: false, error: 'No pending rewards to claim' };
    }

    // Transfer from staking reward account (0.0.800)
    const transaction = new TransferTransaction()
      .addHbarTransfer('0.0.800', Hbar.fromTinybars(-Math.floor(pendingReward * 100_000_000)))
      .addHbarTransfer(accountId, Hbar.fromTinybars(Math.floor(pendingReward * 100_000_000)))
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    logger.info('StakingTools', { 
      message: 'Staking rewards claimed', 
      accountId, 
      amount: pendingReward,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
      amount: pendingReward,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('StakingTools', { message: 'Failed to claim rewards', accountId, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Decline staking rewards
 */
export async function declineStakingRewards(
  client: Client,
  accountId: string,
  decline: boolean = true
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const transaction = new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setDeclineStakingReward(decline)
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    logger.info('StakingTools', { 
      message: decline ? 'Staking rewards declined' : 'Staking rewards enabled', 
      accountId,
      txId: response.transactionId?.toString() 
    });

    return {
      success: true,
      txId: response.transactionId?.toString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('StakingTools', { message: 'Failed to update decline status', accountId, decline, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get available staking nodes
 * Note: This would typically come from network info or a config file
 */
export function getStakingNodes(): NodeInfo[] {
  // Hedera mainnet has 26 nodes (0-25)
  // This is simplified data - in production, fetch from network
  return [
    { nodeId: 0, accountId: '0.0.3', description: 'LG', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 1, accountId: '0.0.4', description: 'FIS', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 2, accountId: '0.0.5', description: 'Wipro', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 3, accountId: '0.0.6', description: 'Nomura', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 4, accountId: '0.0.7', description: 'Google', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 5, accountId: '0.0.8', description: 'Zain', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 6, accountId: '0.0.9', description: 'Magalu', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 7, accountId: '0.0.10', description: 'Boeing', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 8, accountId: '0.0.11', description: 'DLA Piper', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 9, accountId: '0.0.12', description: 'T-Mobile', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 10, accountId: '0.0.13', description: 'Standard Bank', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 11, accountId: '0.0.14', description: 'Avery Dennison', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 12, accountId: '0.0.15', description: 'DBS', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 13, accountId: '0.0.16', description: 'ServiceNow', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 14, accountId: '0.0.17', description: 'Ubisoft', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 15, accountId: '0.0.18', description: 'EDF', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 16, accountId: '0.0.19', description: 'Chainlink', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 17, accountId: '0.0.20', description: 'LSE', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 18, accountId: '0.0.21', description: 'Hi-tech', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 19, accountId: '0.0.22', description: 'IBM', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 20, accountId: '0.0.23', description: 'Swirlds', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 21, accountId: '0.0.24', description: 'Envision', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 22, accountId: '0.0.25', description: 'LCX', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 23, accountId: '0.0.26', description: 'Dentons', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 24, accountId: '0.0.27', description: 'IIT Madras', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
    { nodeId: 25, accountId: '0.0.28', description: 'DOV-EU', stake: 0, minStake: 0, maxStake: 0, rewardRate: 0 },
  ];
}

/**
 * Calculate estimated staking rewards
 * Note: This is an approximation - actual rewards depend on network parameters
 */
export function calculateEstimatedRewards(
  stakedAmount: number,
  stakingPeriods: number,
  rewardRate: number = 0.05 // 5% annual rate
): {
  daily: number;
  weekly: number;
  monthly: number;
  annual: number;
} {
  const annualRewards = stakedAmount * rewardRate;
  
  return {
    daily: annualRewards / 365,
    weekly: annualRewards / 52,
    monthly: annualRewards / 12,
    annual: annualRewards,
  };
}

/**
 * Tool definitions for staking operations
 */
export const stakingToolDefinitions = [
  {
    name: 'staking_get_info',
    description: 'Get staking information for a Hedera account including staked node, pending rewards, and reward history',
    parameters: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Hedera account ID (e.g., 0.0.12345)' },
      },
      required: ['account_id'],
    },
  },
  {
    name: 'staking_update_node',
    description: 'Update the node that an account stakes to. This determines which node earns staking fees from this account.',
    parameters: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account to update staking for' },
        node_id: { type: 'number', description: 'Node ID to stake to (0-25)' },
      },
      required: ['account_id', 'node_id'],
    },
  },
  {
    name: 'staking_claim_rewards',
    description: 'Claim pending staking rewards for an account. Rewards are transferred from the staking reward account (0.0.800).',
    parameters: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account claiming rewards' },
      },
      required: ['account_id'],
    },
  },
  {
    name: 'staking_get_nodes',
    description: 'Get list of available staking nodes with their account IDs and descriptions',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'staking_calculate_rewards',
    description: 'Calculate estimated staking rewards based on staked amount and time period',
    parameters: {
      type: 'object',
      properties: {
        staked_amount: { type: 'number', description: 'Amount of HBAR staked' },
        periods: { type: 'number', description: 'Number of staking periods (days)' },
        reward_rate: { type: 'number', description: 'Annual reward rate (default 0.05 = 5%)' },
      },
      required: ['staked_amount', 'periods'],
    },
  },
  {
    name: 'staking_stake_to_account',
    description: 'Stake to another Hedera account (proxy staking). The target account earns staking fees.',
    parameters: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account doing the staking' },
        staked_account_id: { type: 'string', description: 'Account to stake to' },
      },
      required: ['account_id', 'staked_account_id'],
    },
  },
  {
    name: 'staking_decline_rewards',
    description: 'Decline or re-enable staking rewards for an account',
    parameters: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account to update' },
        decline: { type: 'boolean', description: 'True to decline rewards, false to enable' },
      },
      required: ['account_id', 'decline'],
    },
  },
];
