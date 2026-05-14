/**
 * Account Verification Tools
 * 
 * Provides functions to verify account existence on Hedera mainnet
 * and generate HashScan proof links for transparency
 */

import { config } from '../config.js';

export interface AccountVerification {
  exists: boolean;
  accountId: string;
  created?: string;
  balance?: string;
  memo?: string;
  evmAddress?: string;
  hashscanUrl: string;
  errorMessage?: string;
}

/**
 * Verify if a Hedera account exists on mainnet
 */
export async function verifyAccount(accountId: string): Promise<AccountVerification> {
  const hashscanUrl = `https://hashscan.io/${config.HEDERA_NETWORK}/account/${accountId}`;
  
  try {
    // Query Mirror Node API for account info
    const response = await fetch(`${config.MIRROR_NODE_BASE_URL}/api/v1/accounts/${accountId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return {
          exists: false,
          accountId,
          hashscanUrl,
          errorMessage: 'Account not found on Hedera network'
        };
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Get balance info
    let balance = '0';
    try {
      const balanceResponse = await fetch(`${config.MIRROR_NODE_BASE_URL}/api/v1/balances?account.id=${accountId}`);
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        const balances = balanceData?.balances || [];
        balance = balances[0]?.balance || '0';
      }
    } catch (e) {
      // Balance fetch failed, continue with 0
    }
    
    return {
      exists: true,
      accountId,
      created: data.created_timestamp,
      balance: balance,
      memo: data.memo || undefined,
      evmAddress: data.evm_address || undefined,
      hashscanUrl
    };
    
  } catch (error) {
    return {
      exists: false,
      accountId,
      hashscanUrl,
      errorMessage: error instanceof Error ? error.message : 'Verification failed'
    };
  }
}

/**
 * Generate a proof message with HashScan link
 */
export function generateAccountProof(verification: AccountVerification): string {
  if (!verification.exists) {
    return `❌ Account ${verification.accountId} does not exist on Hedera ${config.HEDERA_NETWORK}\n\nHashScan: ${verification.hashscanUrl}`;
  }
  
  let proof = `✅ **Account Verified on Hedera ${config.HEDERA_NETWORK}**\n\n`;
  proof += `**Account ID**: ${verification.accountId}\n`;
  
  if (verification.memo) {
    proof += `**Memo**: "${verification.memo}"\n`;
  }
  
  if (verification.created) {
    proof += `**Created**: ${new Date(Number(verification.created) * 1000).toLocaleDateString()}\n`;
  }
  
  if (verification.balance) {
    const hbarBalance = (parseInt(verification.balance as string) / 100000000).toFixed(8);
    proof += `**Balance**: ${hbarBalance} HBAR\n`;
  }
  
  if (verification.evmAddress) {
    proof += `**EVM Address**: ${verification.evmAddress}\n`;
  }
  
  proof += `\n🔗 **HashScan Proof**: ${verification.hashscanUrl}`;
  
  return proof;
}

/**
 * Quick verification for multiple accounts
 */
export async function verifyMultipleAccounts(accountIds: string[]): Promise<AccountVerification[]> {
  const results = await Promise.allSettled(
    accountIds.map(id => verifyAccount(id))
  );
  
  return results.map(result => 
    result.status === 'fulfilled' ? result.value : {
      exists: false,
      accountId: 'unknown',
      hashscanUrl: '',
      errorMessage: result.reason
    }
  );
}
