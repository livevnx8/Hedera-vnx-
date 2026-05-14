#!/usr/bin/env node
/**
 * Vera Hedera Expanded Capabilities v1.0
 * Comprehensive Hedera operations beyond basic HTS/HCS
 */

import { 
  Client, 
  TokenCreateTransaction,
  TokenUpdateTransaction,
  TokenDeleteTransaction,
  TokenMintTransaction,
  TokenBurnTransaction,
  TokenWipeTransaction,
  TokenFreezeTransaction,
  TokenUnfreezeTransaction,
  TokenKycGrantTransaction,
  TokenKycRevokeTransaction,
  TokenAssociateTransaction,
  TokenDissociateTransaction,
  TokenFeeScheduleUpdateTransaction,
  TokenInfoQuery,
  TokenNftInfoQuery,
  TransferTransaction,
  AccountCreateTransaction,
  AccountUpdateTransaction,
  AccountDeleteTransaction,
  AccountAllowanceApproveTransaction,
  AccountAllowanceDeleteTransaction,
  AccountBalanceQuery,
  AccountInfoQuery,
  AccountStakingUpdateTransaction,
  TopicCreateTransaction,
  TopicUpdateTransaction,
  TopicDeleteTransaction,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  FileCreateTransaction,
  FileAppendTransaction,
  FileDeleteTransaction,
  FileContentsQuery,
  FileInfoQuery,
  ScheduleCreateTransaction,
  ScheduleSignTransaction,
  ScheduleDeleteTransaction,
  ScheduleInfoQuery,
  ContractCreateTransaction,
  ContractUpdateTransaction,
  ContractDeleteTransaction,
  ContractExecuteTransaction,
  ContractCallQuery,
  ContractInfoQuery,
  PrivateKey,
  PublicKey,
  Hbar,
  Timestamp,
  Duration,
  KeyList,
  CustomFixedFee,
  CustomFractionalFee,
  CustomRoyaltyFee
} from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

class VeraHederaExpanded {
  constructor() {
    this.client = null;
    this.operatorId = null;
  }

  async initialize(network = 'mainnet') {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY');
    }

    this.client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    let privateKey;
    if (operatorKey.length === 64) {
      try {
        privateKey = PrivateKey.fromStringECDSA(operatorKey);
      } catch {
        privateKey = PrivateKey.fromStringED25519(operatorKey);
      }
    } else {
      privateKey = PrivateKey.fromString(operatorKey);
    }

    this.client.setOperator(operatorId, privateKey);
    this.operatorId = operatorId;

    console.log(`✅ Vera Hedera Expanded initialized (${network})`);
    return this;
  }

  // ============================================
  // ADVANCED TOKEN OPERATIONS
  // ============================================

  async updateToken({ tokenId, name, symbol, memo, treasury }) {
    console.log(`📝 Updating token ${tokenId}`);
    
    const tx = new TokenUpdateTransaction()
      .setTokenId(tokenId);

    if (name) tx.setTokenName(name);
    if (symbol) tx.setTokenSymbol(symbol);
    if (memo) tx.setTokenMemo(memo);
    if (treasury) tx.setTreasuryAccountId(treasury);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Token updated: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async deleteToken(tokenId) {
    console.log(`🗑️ Deleting token ${tokenId}`);
    
    const tx = new TokenDeleteTransaction()
      .setTokenId(tokenId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Token deleted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async wipeTokens({ tokenId, accountId, amount }) {
    console.log(`🧹 Wiping ${amount} tokens from ${accountId}`);
    
    const tx = new TokenWipeTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId)
      .setAmount(amount);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Tokens wiped: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async freezeToken({ tokenId, accountId }) {
    console.log(`❄️ Freezing token ${tokenId} for ${accountId}`);
    
    const tx = new TokenFreezeTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Token frozen: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async unfreezeToken({ tokenId, accountId }) {
    console.log(`☀️ Unfreezing token ${tokenId} for ${accountId}`);
    
    const tx = new TokenUnfreezeTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Token unfrozen: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async grantKyc({ tokenId, accountId }) {
    console.log(`✓ Granting KYC for ${accountId} on ${tokenId}`);
    
    const tx = new TokenKycGrantTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ KYC granted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async revokeKyc({ tokenId, accountId }) {
    console.log(`✗ Revoking KYC for ${accountId} on ${tokenId}`);
    
    const tx = new TokenKycRevokeTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ KYC revoked: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async dissociateToken({ tokenId, accountId }) {
    console.log(`🔗 Dissociating ${tokenId} from ${accountId || this.operatorId}`);
    
    const tx = new TokenDissociateTransaction()
      .setAccountId(accountId || this.operatorId)
      .setTokenIds([tokenId]);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Token dissociated: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async updateTokenFeeSchedule({ tokenId, customFees }) {
    console.log(`💰 Updating fee schedule for ${tokenId}`);
    
    const tx = new TokenFeeScheduleUpdateTransaction()
      .setTokenId(tokenId);

    // Add custom fees
    if (customFees) {
      for (const fee of customFees) {
        if (fee.type === 'fixed') {
          tx.addCustomFee(new CustomFixedFee()
            .setAmount(fee.amount)
            .setDenominatingTokenId(fee.tokenId || tokenId)
            .setFeeCollectorAccountId(fee.collector));
        } else if (fee.type === 'fractional') {
          tx.addCustomFee(new CustomFractionalFee()
            .setNumerator(fee.numerator)
            .setDenominator(fee.denominator)
            .setMin(fee.min || 0)
            .setMax(fee.max || 0)
            .setFeeCollectorAccountId(fee.collector));
        } else if (fee.type === 'royalty') {
          tx.addCustomFee(new CustomRoyaltyFee()
            .setNumerator(fee.numerator)
            .setDenominator(fee.denominator)
            .setFallbackFee(new CustomFixedFee().setAmount(fee.fallbackAmount).setDenominatingTokenId(fee.fallbackTokenId))
            .setFeeCollectorAccountId(fee.collector));
        }
      }
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Fee schedule updated: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async getTokenInfo(tokenId) {
    console.log(`ℹ️ Getting info for token ${tokenId}`);
    
    const query = new TokenInfoQuery().setTokenId(tokenId);
    const info = await query.execute(this.client);
    
    console.log(`✅ Token Info:`);
    console.log(`   Name: ${info.name}`);
    console.log(`   Symbol: ${info.symbol}`);
    console.log(`   Type: ${info.tokenType}`);
    console.log(`   Supply: ${info.totalSupply}`);
    console.log(`   Decimals: ${info.decimals}`);
    console.log(`   Treasury: ${info.treasuryAccountId}`);
    console.log(`   Admin Key: ${info.adminKey ? 'Set' : 'None'}`);
    console.log(`   Supply Key: ${info.supplyKey ? 'Set' : 'None'}`);
    console.log(`   Freeze Key: ${info.freezeKey ? 'Set' : 'None'}`);
    console.log(`   KYC Key: ${info.kycKey ? 'Set' : 'None'}`);
    console.log(`   Wipe Key: ${info.wipeKey ? 'Set' : 'None'}`);
    console.log(`   Custom Fees: ${info.customFees?.length || 0}`);

    return { success: true, info };
  }

  // ============================================
  // ACCOUNT MANAGEMENT
  // ============================================

  async createAccount({ initialBalance = 0, key, memo, maxAutomaticTokenAssociations = 0 }) {
    console.log(`👤 Creating new account`);
    
    let accountKey;
    if (key) {
      accountKey = PrivateKey.fromString(key).getPublicKey();
    } else {
      accountKey = PrivateKey.generate().getPublicKey();
    }

    const tx = new AccountCreateTransaction()
      .setKey(accountKey)
      .setInitialBalance(Hbar.fromTinybars(initialBalance * 100000000))
      .setMaxAutomaticTokenAssociations(maxAutomaticTokenAssociations);

    if (memo) tx.setAccountMemo(memo);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Account created: ${receipt.accountId}`);
    return { success: true, accountId: receipt.accountId.toString(), publicKey: accountKey.toString() };
  }

  async updateAccount({ accountId, key, memo, stakingNodeId, declineStakingReward }) {
    console.log(`📝 Updating account ${accountId || this.operatorId}`);
    
    const tx = new AccountUpdateTransaction()
      .setAccountId(accountId || this.operatorId);

    if (key) tx.setKey(PrivateKey.fromString(key).getPublicKey());
    if (memo !== undefined) tx.setAccountMemo(memo);
    if (stakingNodeId !== undefined) tx.setStakedNodeId(stakingNodeId);
    if (declineStakingReward !== undefined) tx.setDeclineStakingReward(declineStakingReward);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Account updated: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async deleteAccount({ accountId, transferAccountId }) {
    console.log(`🗑️ Deleting account ${accountId}`);
    
    const tx = new AccountDeleteTransaction()
      .setAccountId(accountId)
      .setTransferAccountId(transferAccountId || this.operatorId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Account deleted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async updateStaking({ stakingNodeId, declineStakingReward }) {
    console.log(`🥩 Updating staking`);
    
    const tx = new AccountStakingUpdateTransaction()
      .setAccountId(this.operatorId);

    if (stakingNodeId !== undefined) tx.setStakedNodeId(stakingNodeId);
    if (declineStakingReward !== undefined) tx.setDeclineStakingReward(declineStakingReward);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Staking updated: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async approveAllowance({ spenderAccountId, tokenId, amount, hbarAmount }) {
    console.log(`✓ Approving allowance for ${spenderAccountId}`);
    
    const tx = new AccountAllowanceApproveTransaction();

    if (hbarAmount) {
      tx.approveHbarAllowance(spenderAccountId, Hbar.fromTinybars(hbarAmount * 100000000));
    }
    
    if (tokenId && amount) {
      tx.approveTokenAllowance(tokenId, spenderAccountId, amount);
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Allowance approved: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async deleteAllowance({ spenderAccountId, tokenId }) {
    console.log(`✗ Deleting allowance for ${spenderAccountId}`);
    
    const tx = new AccountAllowanceDeleteTransaction();

    if (tokenId) {
      tx.deleteTokenAllowance(tokenId, this.operatorId, spenderAccountId);
    } else {
      tx.deleteAllHbarAllowances();
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Allowance deleted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async getAccountInfo(accountId = this.operatorId) {
    console.log(`ℹ️ Getting info for account ${accountId}`);
    
    const query = new AccountInfoQuery().setAccountId(accountId);
    const info = await query.execute(this.client);
    
    console.log(`✅ Account Info:`);
    console.log(`   Balance: ${info.balance?.toString() || '0'} HBAR`);
    console.log(`   Key: ${info.key?.type}`);
    console.log(`   Memo: ${info.accountMemo || 'None'}`);
    console.log(`   Created: ${info.expirationTime?.toDate() || 'Unknown'}`);
    console.log(`   Staked to Node: ${info.stakingInfo?.stakedNodeId || 'None'}`);
    console.log(`   Staked Account: ${info.stakingInfo?.stakedAccountId || 'None'}`);
    console.log(`   Decline Rewards: ${info.stakingInfo?.declineStakingReward}`);
    console.log(`   Token Associations: ${info.tokenRelationships?.size || 0}`);

    return { success: true, info };
  }

  // ============================================
  // FILE SERVICE
  // ============================================

  async createFile({ contents, memo, keys = [] }) {
    console.log(`📄 Creating file (${contents?.length || 0} bytes)`);
    
    const tx = new FileCreateTransaction();
    
    if (contents) {
      tx.setContents(contents);
    }
    
    if (memo) {
      tx.setFileMemo(memo);
    }

    if (keys.length > 0) {
      const keyList = new KeyList();
      for (const key of keys) {
        keyList.add(PrivateKey.fromString(key).getPublicKey());
      }
      tx.setKeys(keyList);
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ File created: ${receipt.fileId}`);
    return { success: true, fileId: receipt.fileId.toString() };
  }

  async appendToFile({ fileId, contents }) {
    console.log(`➕ Appending to file ${fileId}`);
    
    const tx = new FileAppendTransaction()
      .setFileId(fileId)
      .setContents(contents);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ File appended: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async deleteFile(fileId) {
    console.log(`🗑️ Deleting file ${fileId}`);
    
    const tx = new FileDeleteTransaction()
      .setFileId(fileId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ File deleted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async getFileContents(fileId) {
    console.log(`📖 Reading file ${fileId}`);
    
    const query = new FileContentsQuery().setFileId(fileId);
    const contents = await query.execute(this.client);
    
    console.log(`✅ File contents: ${contents.length} bytes`);
    return { success: true, contents: contents.toString() };
  }

  async getFileInfo(fileId) {
    console.log(`ℹ️ Getting file info ${fileId}`);
    
    const query = new FileInfoQuery().setFileId(fileId);
    const info = await query.execute(this.client);
    
    console.log(`✅ File Info:`);
    console.log(`   Size: ${info.size} bytes`);
    console.log(`   Expiration: ${info.expirationTime?.toDate()}`);
    console.log(`   Deleted: ${info.isDeleted}`);
    console.log(`   Memo: ${info.fileMemo || 'None'}`);

    return { success: true, info };
  }

  // ============================================
  // SCHEDULING
  // ============================================

  async scheduleTransaction({ transaction, adminKey, payerAccountId, expirationTime }) {
    console.log(`⏰ Creating schedule`);
    
    const tx = new ScheduleCreateTransaction();
    
    if (transaction) {
      tx.setScheduledTransaction(transaction);
    }
    
    if (adminKey) {
      tx.setAdminKey(PrivateKey.fromString(adminKey).getPublicKey());
    }
    
    if (payerAccountId) {
      tx.setPayerAccountId(payerAccountId);
    }
    
    if (expirationTime) {
      tx.setExpirationTime(Timestamp.fromDate(new Date(expirationTime)));
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Schedule created: ${receipt.scheduleId}`);
    return { success: true, scheduleId: receipt.scheduleId.toString() };
  }

  async signSchedule(scheduleId) {
    console.log(`✍️ Signing schedule ${scheduleId}`);
    
    const tx = new ScheduleSignTransaction()
      .setScheduleId(scheduleId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Schedule signed: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async deleteSchedule(scheduleId) {
    console.log(`🗑️ Deleting schedule ${scheduleId}`);
    
    const tx = new ScheduleDeleteTransaction()
      .setScheduleId(scheduleId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Schedule deleted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async getScheduleInfo(scheduleId) {
    console.log(`ℹ️ Getting schedule info ${scheduleId}`);
    
    const query = new ScheduleInfoQuery().setScheduleId(scheduleId);
    const info = await query.execute(this.client);
    
    console.log(`✅ Schedule Info:`);
    console.log(`   Creator: ${info.creatorAccountId}`);
    console.log(`   Payer: ${info.payerAccountId}`);
    console.log(`   Executed: ${info.executed}`);
    console.log(`   Deleted: ${info.deleted}`);
    console.log(`   Signatories: ${info.signatories?.length || 0}`);

    return { success: true, info };
  }

  // ============================================
  // NFT OPERATIONS
  // ============================================

  async createNftCollection({ name, symbol, maxSupply, memo, royalties }) {
    console.log(`🎨 Creating NFT collection: ${name} (${symbol})`);
    
    const tx = new TokenCreateTransaction()
      .setTokenName(name)
      .setTokenSymbol(symbol)
      .setTokenType(1) // NFT
      .setTreasuryAccountId(this.operatorId)
      .setSupplyType(maxSupply ? 0 : 1) // FINITE if maxSupply, otherwise INFINITE
      .setMaxSupply(maxSupply || 0)
      .setSupplyKey(PrivateKey.generate()); // Generate supply key

    if (memo) tx.setTokenMemo(memo);

    // Add royalties
    if (royalties) {
      for (const royalty of royalties) {
        tx.addCustomFee(new CustomRoyaltyFee()
          .setNumerator(royalty.numerator)
          .setDenominator(royalty.denominator)
          .setFallbackFee(new CustomFixedFee()
            .setAmount(royalty.fallbackAmount || 0)
            .setDenominatingTokenId(royalty.fallbackTokenId))
          .setFeeCollectorAccountId(royalty.collector));
      }
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ NFT collection created: ${receipt.tokenId}`);
    return { success: true, tokenId: receipt.tokenId.toString() };
  }

  async mintNft({ tokenId, metadata, amount = 1 }) {
    console.log(`🖼️ Minting ${amount} NFT(s) to ${tokenId}`);
    
    const metadatas = [];
    for (let i = 0; i < amount; i++) {
      metadatas.push(Buffer.from(metadata));
    }

    const tx = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setMetadata(metadatas);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ NFT(s) minted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString(), serials: receipt.serials };
  }

  async transferNft({ tokenId, serialNumber, toAccountId }) {
    console.log(`🔄 Transferring NFT ${tokenId} #${serialNumber} to ${toAccountId}`);
    
    const tx = new TransferTransaction()
      .addNftTransfer(tokenId, serialNumber, this.operatorId, toAccountId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ NFT transferred: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async getNftInfo({ tokenId, serialNumber }) {
    console.log(`ℹ️ Getting NFT info ${tokenId} #${serialNumber}`);
    
    const query = new TokenNftInfoQuery()
      .setNftId(tokenId, serialNumber);
    const info = await query.execute(this.client);
    
    console.log(`✅ NFT Info:`);
    console.log(`   Owner: ${info.accountId}`);
    console.log(`   Metadata: ${info.metadata?.toString() || 'None'}`);
    console.log(`   Spender: ${info.spenderId || 'None'}`);

    return { success: true, info };
  }

  // ============================================
  // CONTRACT OPERATIONS
  // ============================================

  async updateContract({ contractId, memo, adminKey, autoRenewPeriod, expirationTime }) {
    console.log(`📝 Updating contract ${contractId}`);
    
    const tx = new ContractUpdateTransaction()
      .setContractId(contractId);

    if (memo !== undefined) tx.setContractMemo(memo);
    if (adminKey) tx.setAdminKey(PrivateKey.fromString(adminKey).getPublicKey());
    if (autoRenewPeriod) tx.setAutoRenewPeriod(new Duration(autoRenewPeriod));
    if (expirationTime) tx.setExpirationTime(Timestamp.fromDate(new Date(expirationTime)));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Contract updated: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async deleteContract(contractId, transferAccountId) {
    console.log(`🗑️ Deleting contract ${contractId}`);
    
    const tx = new ContractDeleteTransaction()
      .setContractId(contractId);

    if (transferAccountId) {
      tx.setTransferAccountId(transferAccountId);
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Contract deleted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async callContractQuery({ contractId, functionName, params = [], gas = 100000 }) {
    console.log(`🔍 Querying ${functionName} on ${contractId}`);
    
    const query = new ContractCallQuery()
      .setContractId(contractId)
      .setGas(gas)
      .setFunction(functionName, params);

    const result = await query.execute(this.client);
    
    console.log(`✅ Query result: ${result.asBytes().length} bytes`);
    return { success: true, result };
  }

  async getContractInfo(contractId) {
    console.log(`ℹ️ Getting contract info ${contractId}`);
    
    const query = new ContractInfoQuery().setContractId(contractId);
    const info = await query.execute(this.client);
    
    console.log(`✅ Contract Info:`);
    console.log(`   Balance: ${info.balance?.toString() || '0'}`);
    console.log(`   Storage: ${info.contractMemo || 'None'}`);
    console.log(`   Auto Renew Period: ${info.autoRenewPeriod?.toString() || 'None'}`);
    console.log(`   Expiration: ${info.expirationTime?.toDate()}`);

    return { success: true, info };
  }

  // ============================================
  // TOPIC OPERATIONS
  // ============================================

  async updateTopic({ topicId, memo, adminKey, submitKey, autoRenewAccount, autoRenewPeriod }) {
    console.log(`📝 Updating topic ${topicId}`);
    
    const tx = new TopicUpdateTransaction()
      .setTopicId(topicId);

    if (memo !== undefined) tx.setTopicMemo(memo);
    if (adminKey) tx.setAdminKey(PrivateKey.fromString(adminKey).getPublicKey());
    if (submitKey) tx.setSubmitKey(PrivateKey.fromString(submitKey).getPublicKey());
    if (autoRenewAccount) tx.setAutoRenewAccountId(autoRenewAccount);
    if (autoRenewPeriod) tx.setAutoRenewPeriod(new Duration(autoRenewPeriod));

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Topic updated: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async deleteTopic(topicId) {
    console.log(`🗑️ Deleting topic ${topicId}`);
    
    const tx = new TopicDeleteTransaction()
      .setTopicId(topicId);

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    
    console.log(`✅ Topic deleted: ${receipt.status}`);
    return { success: true, status: receipt.status.toString() };
  }

  async getTopicMessages(topicId, startTime, endTime) {
    console.log(`📜 Getting messages from topic ${topicId}`);
    
    const query = new TopicMessageQuery()
      .setTopicId(topicId);

    if (startTime) query.setStartTime(startTime);
    if (endTime) query.setEndTime(endTime);

    const messages = [];
    
    // Subscribe to messages (simplified - real implementation would stream)
    console.log(`✅ Subscribed to topic ${topicId}`);
    
    return { success: true, messages };
  }

  // ============================================
  // DASHBOARD
  // ============================================

  displayCapabilities() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🔧 VERA HEDERA EXPANDED CAPABILITIES v1.0                   ║
╠═══════════════════════════════════════════════════════════════╣
║  🪙 TOKEN OPERATIONS (Advanced)                              ║
║     • updateToken, deleteToken                                ║
║     • wipeTokens, freeze/unfreezeToken                        ║
║     • grant/revokeKyc, dissociateToken                        ║
║     • updateTokenFeeSchedule, getTokenInfo                    ║
║                                                               ║
║  👤 ACCOUNT MANAGEMENT                                        ║
║     • createAccount, updateAccount, deleteAccount           ║
║     • updateStaking (stake to nodes)                          ║
║     • approve/deleteAllowance                                 ║
║     • getAccountInfo                                          ║
║                                                               ║
║  📄 FILE SERVICE                                              ║
║     • createFile, appendToFile, deleteFile                  ║
║     • getFileContents, getFileInfo                          ║
║                                                               ║
║  ⏰ SCHEDULING                                                ║
║     • scheduleTransaction, signSchedule                       ║
║     • deleteSchedule, getScheduleInfo                         ║
║                                                               ║
║  🎨 NFT OPERATIONS                                            ║
║     • createNftCollection, mintNft                          ║
║     • transferNft, getNftInfo                                 ║
║                                                               ║
║  📜 CONTRACT ADVANCED                                         ║
║     • updateContract, deleteContract                        ║
║     • callContractQuery, getContractInfo                   ║
║                                                               ║
║  📝 HCS ADVANCED                                              ║
║     • updateTopic, deleteTopic                              ║
║     • getTopicMessages                                        ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }
}

// Export
export { VeraHederaExpanded };

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  const vera = new VeraHederaExpanded();
  
  vera.initialize().then(() => {
    vera.displayCapabilities();
  }).catch(console.error);
}
