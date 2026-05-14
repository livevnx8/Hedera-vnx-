/**
 * Hedera Client Helper
 * Shared client initialization for all Hedera tools
 */

import { Client, PrivateKey } from '@hashgraph/sdk';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

let client: Client | null = null;

export function getClient(): Client {
  if (client) return client;

  const network = (config.HEDERA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
  client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

  if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
    const keyStr = config.HEDERA_OPERATOR_PRIVATE_KEY;
    let privateKey: PrivateKey;

    try {
      if (keyStr.length === 64) {
        try { privateKey = PrivateKey.fromStringECDSA(keyStr); }
        catch { privateKey = PrivateKey.fromStringED25519(keyStr); }
      } else {
        privateKey = PrivateKey.fromString(keyStr);
      }

      client.setOperator(config.HEDERA_OPERATOR_ACCOUNT_ID, privateKey);
      logger.info('HederaClient', { network, message: 'Client initialized' });
    } catch (error) {
      logger.error('HederaClient', { error, message: 'Failed to initialize client' });
      throw error;
    }
  }

  return client;
}

export function resetClient(): void {
  client = null;
}
