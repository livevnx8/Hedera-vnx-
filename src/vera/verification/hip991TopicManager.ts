/**
 * HIP-991 Topic Manager
 *
 * Create / update HCS topics with fee-ready structure (custom fees, fee schedule key,
 * fee-exempt keys). We start with empty `customFees=[]` so nothing is charged today,
 * but the topic carries the keys required to flip monetization on later without
 * recreating topics.
 *
 * @module vera/verification/hip991TopicManager
 */

import {
  TopicCreateTransaction,
  TopicUpdateTransaction,
  CustomFixedFee,
  Key,
  AccountId,
  Hbar,
} from '@hashgraph/sdk';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';

export interface HIP991TopicSpec {
  memo: string;
  /** Optional submit key; defaults to operator public key */
  submitKey?: Key;
  /** Key allowed to update fee schedule; defaults to operator */
  feeScheduleKey?: Key;
  /** Keys exempt from paying the custom fees (e.g. operator's own key) */
  feeExemptKeys?: Key[];
  /** Custom fees — empty array = fee-ready but free */
  customFees?: CustomFixedFee[];
}

export interface CreateTopicResult {
  topicId: string;
  transactionId: string;
  hashscanUrl: string;
  memo: string;
  hip991: true;
  feesEnabled: boolean;
}

class HIP991TopicManager {
  private network: 'mainnet' | 'testnet';

  constructor() {
    this.network = (config.HEDERA_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';
  }

  /**
   * Create a new HIP-991 structured topic.
   */
  async createHIP991Topic(spec: HIP991TopicSpec): Promise<CreateTopicResult> {
    const client = (hederaMaster as unknown as { client: import('@hashgraph/sdk').Client | null }).client;
    if (!client) throw new Error('Hedera client not initialized');

    const operatorKey = client.operatorPublicKey;
    if (!operatorKey) throw new Error('Operator public key unavailable');

    const tx = new TopicCreateTransaction()
      .setTopicMemo(spec.memo)
      .setSubmitKey(spec.submitKey ?? operatorKey)
      .setFeeScheduleKey(spec.feeScheduleKey ?? operatorKey)
      .setFeeExemptKeys(spec.feeExemptKeys ?? [operatorKey])
      .setCustomFees(spec.customFees ?? []);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const topicId = receipt.topicId?.toString() ?? '';

    logger.info('HIP991TopicManager', {
      message: 'HIP-991 topic created',
      topicId,
      memo: spec.memo,
      feesEnabled: (spec.customFees?.length ?? 0) > 0,
    });

    return {
      topicId,
      transactionId: response.transactionId.toString(),
      hashscanUrl: `https://hashscan.io/${this.network}/topic/${topicId}`,
      memo: spec.memo,
      hip991: true,
      feesEnabled: (spec.customFees?.length ?? 0) > 0,
    };
  }

  /**
   * Update custom fees on an existing topic (requires feeScheduleKey on the topic).
   */
  async updateTopicFees(topicId: string, fees: CustomFixedFee[]): Promise<{ transactionId: string }> {
    const client = (hederaMaster as unknown as { client: import('@hashgraph/sdk').Client | null }).client;
    if (!client) throw new Error('Hedera client not initialized');

    const tx = new TopicUpdateTransaction().setTopicId(topicId).setCustomFees(fees);
    const response = await tx.execute(client);
    await response.getReceipt(client);

    logger.info('HIP991TopicManager', {
      message: 'Topic fees updated',
      topicId,
      feeCount: fees.length,
    });

    return { transactionId: response.transactionId.toString() };
  }

  /**
   * Build a simple fixed HBAR fee — helper for when monetization is enabled.
   */
  buildHbarFee(hbarAmount: number, collectorAccountId?: string): CustomFixedFee {
    const collector =
      collectorAccountId ?? config.HEDERA_OPERATOR_ACCOUNT_ID ?? '0.0.0';
    return new CustomFixedFee()
      .setHbarAmount(new Hbar(hbarAmount))
      .setFeeCollectorAccountId(AccountId.fromString(collector));
  }

  /**
   * Build a custom-token fee — helper for future VERA token monetization.
   */
  buildTokenFee(tokenId: string, amount: number, collectorAccountId?: string): CustomFixedFee {
    const collector =
      collectorAccountId ?? config.HEDERA_OPERATOR_ACCOUNT_ID ?? '0.0.0';
    return new CustomFixedFee()
      .setDenominatingTokenId(tokenId)
      .setAmount(amount)
      .setFeeCollectorAccountId(AccountId.fromString(collector));
  }

  /**
   * Fetch a topic's current HIP-991 config from the mirror node (free, no HBAR).
   */
  async getTopicInfo(topicId: string): Promise<{
    topicId: string;
    memo: string;
    hasFeeScheduleKey: boolean;
    feeExemptKeyCount: number;
    customFeeCount: number;
    hashscanUrl: string;
    source: 'mirror-node';
  }> {
    const info = await hederaMaster.queryMirrorNode(`/api/v1/topics/${topicId}`);
    if (!info) throw new Error(`Topic ${topicId} not found on mirror node`);

    return {
      topicId,
      memo: info.memo ?? '',
      hasFeeScheduleKey: !!info.fee_schedule_key,
      feeExemptKeyCount: Array.isArray(info.fee_exempt_key_list) ? info.fee_exempt_key_list.length : 0,
      customFeeCount: Array.isArray(info.custom_fees?.fixed_fees) ? info.custom_fees.fixed_fees.length : 0,
      hashscanUrl: `https://hashscan.io/${this.network}/topic/${topicId}`,
      source: 'mirror-node',
    };
  }
}

export const hip991TopicManager = new HIP991TopicManager();
