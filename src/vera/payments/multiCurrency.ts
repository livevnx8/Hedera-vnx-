/**
 * Multi-Currency Payment Handler
 * Supports HBAR, USDC, DOVU, XSGD and other HTS tokens
 */

import { EventEmitter } from 'events';
import { TransferTransaction, Hbar, TokenId, Client } from '@hashgraph/sdk';
import { logger } from '../../monitoring/logger.js';
import { getClient } from '../../hedera/tools/client.js';

export type Currency = 'HBAR' | 'USDC' | 'DOVU' | 'XSGD' | 'HBARX';

export interface CurrencyConfig {
  tokenId: string | null; // null for HBAR (native)
  decimals: number;
  minAmount: number;
  maxAmount: number;
  isStablecoin: boolean;
}

export interface MultiCurrencyPayment {
  paymentId: string;
  recipientAccountId: string;
  amount: number;
  currency: Currency;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txId?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export class MultiCurrencyHandler extends EventEmitter {
  private payments = new Map<string, MultiCurrencyPayment>();
  private exchangeRates = new Map<string, number>();

  private currencyConfigs: Record<Currency, CurrencyConfig> = {
    HBAR: { tokenId: null, decimals: 8, minAmount: 0.001, maxAmount: 10000, isStablecoin: false },
    USDC: { tokenId: '0.0.456858', decimals: 6, minAmount: 0.01, maxAmount: 100000, isStablecoin: true },
    DOVU: { tokenId: '0.0.13052', decimals: 8, minAmount: 1, maxAmount: 10000000, isStablecoin: false },
    XSGD: { tokenId: '0.0.467565', decimals: 6, minAmount: 0.01, maxAmount: 100000, isStablecoin: true },
    HBARX: { tokenId: '0.0.834116', decimals: 8, minAmount: 0.001, maxAmount: 10000, isStablecoin: false },
  };

  constructor() {
    super();
    this.loadExchangeRates();
  }

  /**
   * Process payment in specified currency
   */
  async processPayment(
    recipientAccountId: string,
    amount: number,
    currency: Currency = 'HBAR'
  ): Promise<MultiCurrencyPayment> {
    const paymentId = `pay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const payment: MultiCurrencyPayment = {
      paymentId,
      recipientAccountId,
      amount,
      currency,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.payments.set(paymentId, payment);

    try {
      payment.status = 'processing';

      const config = this.currencyConfigs[currency];
      
      // Validate amount
      if (amount < config.minAmount || amount > config.maxAmount) {
        throw new Error(`Amount ${amount} outside valid range for ${currency}`);
      }

      if (currency === 'HBAR') {
        await this.transferHBAR(payment);
      } else {
        await this.transferToken(payment, config);
      }

      payment.status = 'completed';
      payment.completedAt = Date.now();

      logger.info('MultiCurrencyHandler', {
        message: 'Payment completed',
        paymentId,
        currency,
        amount,
        recipient: recipientAccountId,
      });

      this.emit('payment_completed', payment);
    } catch (error) {
      payment.status = 'failed';
      payment.error = error instanceof Error ? error.message : String(error);

      logger.error('MultiCurrencyHandler', {
        message: 'Payment failed',
        paymentId,
        currency,
        error: payment.error,
      });

      this.emit('payment_failed', payment);
    }

    return payment;
  }

  /**
   * Convert amount between currencies
   */
  convert(amount: number, from: Currency, to: Currency): number {
    if (from === to) return amount;

    const fromRate = this.exchangeRates.get(from) || 1;
    const toRate = this.exchangeRates.get(to) || 1;

    // Convert to HBAR base, then to target
    const hbarValue = amount * fromRate;
    return hbarValue / toRate;
  }

  /**
   * Get equivalent value in USD
   */
  getUSDValue(amount: number, currency: Currency): number {
    const rate = this.exchangeRates.get(currency) || 1;
    if (currency === 'USDC' || currency === 'XSGD') {
      // Stablecoins are roughly 1:1 with USD
      return amount;
    }
    return amount * rate;
  }

  /**
   * Transfer HBAR (native token)
   */
  private async transferHBAR(payment: MultiCurrencyPayment): Promise<void> {
    const client = getClient();
    const payerAccountId = client.operatorAccountId?.toString();
    
    if (!payerAccountId) {
      throw new Error('Operator account not configured');
    }

    const resp = await new TransferTransaction()
      .addHbarTransfer(payerAccountId, new Hbar(-payment.amount))
      .addHbarTransfer(payment.recipientAccountId, new Hbar(payment.amount))
      .setTransactionMemo(`Vera multi-currency: ${payment.paymentId}`)
      .execute(client);

    const receipt = await resp.getReceipt(client);
    payment.txId = resp.transactionId.toString();
  }

  /**
   * Transfer HTS token
   */
  private async transferToken(payment: MultiCurrencyPayment, config: CurrencyConfig): Promise<void> {
    const client = getClient();
    const payerAccountId = client.operatorAccountId?.toString();
    
    if (!payerAccountId || !config.tokenId) {
      throw new Error('Operator account or token ID not configured');
    }

    const tokenId = TokenId.fromString(config.tokenId);
    
    // Amount adjusted for decimals
    const adjustedAmount = payment.amount * Math.pow(10, config.decimals);

    const resp = await new TransferTransaction()
      .addTokenTransfer(tokenId, payerAccountId, -adjustedAmount)
      .addTokenTransfer(tokenId, payment.recipientAccountId, adjustedAmount)
      .setTransactionMemo(`Vera ${payment.currency}: ${payment.paymentId}`)
      .execute(client);

    const receipt = await resp.getReceipt(client);
    payment.txId = resp.transactionId.toString();
  }

  /**
   * Load exchange rates (simplified - in production, fetch from oracle/API)
   */
  private loadExchangeRates(): void {
    // Rates relative to HBAR
    this.exchangeRates.set('HBAR', 1);
    this.exchangeRates.set('USDC', 0.05); // 1 HBAR = $0.05
    this.exchangeRates.set('DOVU', 0.0001); // 1 HBAR = 10000 DOVU
    this.exchangeRates.set('XSGD', 0.07); // 1 HBAR = S$0.07
    this.exchangeRates.set('HBARX', 0.95); // 1 HBAR = 0.95 HBARX (staked)
  }

  /**
   * Update exchange rate
   */
  updateExchangeRate(currency: Currency, rate: number): void {
    this.exchangeRates.set(currency, rate);
    logger.info('MultiCurrencyHandler', {
      message: 'Exchange rate updated',
      currency,
      rate,
    });
  }

  /**
   * Get payment by ID
   */
  getPayment(paymentId: string): MultiCurrencyPayment | undefined {
    return this.payments.get(paymentId);
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies(): Currency[] {
    return Object.keys(this.currencyConfigs) as Currency[];
  }

  /**
   * Get currency config
   */
  getCurrencyConfig(currency: Currency): CurrencyConfig {
    return this.currencyConfigs[currency];
  }

  /**
   * Get stats
   */
  getStats(): object {
    const all = Array.from(this.payments.values());
    return {
      total: all.length,
      completed: all.filter(p => p.status === 'completed').length,
      failed: all.filter(p => p.status === 'failed').length,
      byCurrency: all.reduce((acc, p) => {
        acc[p.currency] = (acc[p.currency] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

export default MultiCurrencyHandler;
