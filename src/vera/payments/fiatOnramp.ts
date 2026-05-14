/**
 * Fiat Onramp Integration
 * Handles USD -> HBAR conversion via x402 fiat API
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import { logger } from '../../monitoring/logger.js';

export interface FiatOnrampConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  exchangeRateCacheMs: number;
  defaultFiatCurrency: string;
}

export interface ConversionQuote {
  fiatAmount: number;
  fiatCurrency: string;
  cryptoAmount: number;
  cryptoCurrency: string;
  exchangeRate: number;
  fee: number;
  totalCost: number;
  expiresAt: number;
}

export interface FiatPaymentRequest {
  paymentId: string;
  userId: string;
  fiatAmount: number;
  fiatCurrency: string;
  targetCrypto: string;
  recipientAccountId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  txId?: string;
}

export class FiatOnramp extends EventEmitter {
  private exchangeRateCache: Map<string, { rate: number; timestamp: number }> = new Map();
  private pendingPayments = new Map<string, FiatPaymentRequest>();

  constructor(private config: FiatOnrampConfig) {
    super();
  }

  /**
   * Get conversion quote from fiat to crypto
   */
  async getQuote(
    fiatAmount: number,
    fiatCurrency: string = this.config.defaultFiatCurrency,
    cryptoCurrency: string = 'HBAR'
  ): Promise<ConversionQuote | null> {
    try {
      const cacheKey = `${fiatCurrency}-${cryptoCurrency}`;
      let exchangeRate = this.getCachedRate(cacheKey);

      if (!exchangeRate) {
        // Fetch fresh rate from API
        const response = await axios.get(
          `${this.config.baseUrl}/exchange-rate`,
          {
            params: { from: fiatCurrency, to: cryptoCurrency },
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            timeout: 10000,
          }
        );

        exchangeRate = response.data.rate;
        this.cacheRate(cacheKey, exchangeRate);
      }

      const feePercent = 0.015; // 1.5% fee
      const fee = fiatAmount * feePercent;
      const cryptoAmount = (fiatAmount - fee) / exchangeRate;

      return {
        fiatAmount,
        fiatCurrency,
        cryptoAmount,
        cryptoCurrency,
        exchangeRate,
        fee,
        totalCost: fiatAmount,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute expiry
      };
    } catch (error) {
      logger.error('FiatOnramp', {
        message: 'Failed to get conversion quote',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Initiate fiat payment
   */
  async initiatePayment(
    userId: string,
    fiatAmount: number,
    recipientAccountId: string,
    fiatCurrency: string = this.config.defaultFiatCurrency,
    targetCrypto: string = 'HBAR'
  ): Promise<FiatPaymentRequest | null> {
    try {
      const quote = await this.getQuote(fiatAmount, fiatCurrency, targetCrypto);
      if (!quote) return null;

      const paymentId = `fiat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const response = await axios.post(
        `${this.config.baseUrl}/payments`,
        {
          userId,
          amount: fiatAmount,
          currency: fiatCurrency,
          targetCrypto,
          targetAmount: quote.cryptoAmount,
          recipient: recipientAccountId,
          webhookUrl: `/webhooks/fiat/${paymentId}`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const payment: FiatPaymentRequest = {
        paymentId,
        userId,
        fiatAmount,
        fiatCurrency,
        targetCrypto,
        recipientAccountId,
        status: 'pending',
        createdAt: Date.now(),
      };

      this.pendingPayments.set(paymentId, payment);

      logger.info('FiatOnramp', {
        message: 'Fiat payment initiated',
        paymentId,
        userId,
        fiatAmount,
        targetCrypto: quote.cryptoAmount,
      });

      this.emit('payment_initiated', payment);
      return payment;
    } catch (error) {
      logger.error('FiatOnramp', {
        message: 'Failed to initiate fiat payment',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Handle webhook from fiat provider
   */
  async handleWebhook(
    paymentId: string,
    payload: {
      status: 'completed' | 'failed';
      txId?: string;
      amount?: number;
      signature: string;
    }
  ): Promise<boolean> {
    // Verify webhook signature
    if (!this.verifyWebhookSignature(payload)) {
      logger.warn('FiatOnramp', {
        message: 'Invalid webhook signature',
        paymentId,
      });
      return false;
    }

    const payment = this.pendingPayments.get(paymentId);
    if (!payment) {
      logger.warn('FiatOnramp', { message: 'Payment not found', paymentId });
      return false;
    }

    if (payload.status === 'completed') {
      payment.status = 'completed';
      payment.completedAt = Date.now();
      payment.txId = payload.txId;

      logger.info('FiatOnramp', {
        message: 'Fiat payment completed',
        paymentId,
        txId: payload.txId,
      });

      this.emit('payment_completed', payment);
    } else {
      payment.status = 'failed';

      logger.error('FiatOnramp', {
        message: 'Fiat payment failed',
        paymentId,
      });

      this.emit('payment_failed', payment);
    }

    return true;
  }

  /**
   * Get payment status
   */
  getPayment(paymentId: string): FiatPaymentRequest | undefined {
    return this.pendingPayments.get(paymentId);
  }

  /**
   * Get cached exchange rate
   */
  private getCachedRate(key: string): number | null {
    const cached = this.exchangeRateCache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.config.exchangeRateCacheMs) {
      this.exchangeRateCache.delete(key);
      return null;
    }

    return cached.rate;
  }

  /**
   * Cache exchange rate
   */
  private cacheRate(key: string, rate: number): void {
    this.exchangeRateCache.set(key, { rate, timestamp: Date.now() });
  }

  /**
   * Verify webhook signature (simplified)
   */
  private verifyWebhookSignature(payload: { signature: string }): boolean {
    // In production, implement proper HMAC verification
    // For now, accept all signatures
    return true;
  }

  /**
   * Get stats
   */
  getStats(): object {
    const payments = Array.from(this.pendingPayments.values());
    return {
      total: payments.length,
      pending: payments.filter(p => p.status === 'pending').length,
      completed: payments.filter(p => p.status === 'completed').length,
      failed: payments.filter(p => p.status === 'failed').length,
    };
  }
}

// Singleton instance
export const fiatOnramp = new FiatOnramp({
  baseUrl: process.env.FIAT_ONRAMP_BASE_URL || 'https://api.moonpay.com/v1',
  apiKey: process.env.FIAT_ONRAMP_API_KEY || '',
  webhookSecret: process.env.FIAT_ONRAMP_WEBHOOK_SECRET || '',
  exchangeRateCacheMs: 60_000, // 1 minute cache
  defaultFiatCurrency: 'USD',
});

export default FiatOnramp;
