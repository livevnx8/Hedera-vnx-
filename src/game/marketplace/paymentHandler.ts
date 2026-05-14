/**
 * Vera Defender Payment Handler
 * Routes payments between direct HBAR and x402 fiat onramp
 * Integrates with existing payment infrastructure
 */

import { getAgentPaymentSystem } from '../../hedera/agentPayment.js';
import { enhancedSettlement as x402Settlement } from '../../vera/payments/enhancedX402Settlement.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { getMintingService, type MintingRequest, type MintingResult } from '../nft/mintingService.js';
import { getSkinRegistry, type SkinDefinition } from '../nft/skinRegistry.js';
import { hbarToUsd, getBestPromotion, calculateDiscountedPrice, type PriceTier } from '../config/skinPricing.js';

export type PaymentMethod = 'hbar' | 'x402';

export interface PaymentRequest {
  skinId: string;
  buyerAccountId: string;
  paymentMethod: PaymentMethod;
  buyerWalletAddress?: string; // For x402
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  transactionId?: string;
  amountHbar?: number;
  amountUsd?: number;
  mintResult?: MintingResult;
  error?: string;
  processingTime: number;
}

export interface PaymentIntent {
  intentId: string;
  skinId: string;
  buyerAccountId: string;
  amountHbar: number;
  amountUsd: number;
  paymentMethod: PaymentMethod;
  expiresAt: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
}

export class SkinPaymentHandler {
  private paymentIntents: Map<string, PaymentIntent> = new Map();
  private mintingService = getMintingService();
  private registry = getSkinRegistry();
  private agentPayment = getAgentPaymentSystem();
  private paymentHistory: PaymentResult[] = [];

  /**
   * Create a payment intent for a skin purchase
   */
  async createPaymentIntent(
    skinId: string,
    buyerAccountId: string,
    paymentMethod: PaymentMethod,
    isFirstPurchase: boolean = false
  ): Promise<{ intentId: string; amountHbar: number; amountUsd: number }> {
    const skin = this.registry.getSkin(skinId);
    if (!skin) {
      throw new Error(`Skin not found: ${skinId}`);
    }

    if (skin.basePriceHbar === 0) {
      throw new Error('Cannot create payment intent for free/default skin');
    }

    // Get base price
    let priceHbar = skin.basePriceHbar;
    let priceUsd = hbarToUsd(priceHbar);

    // Apply best promotion
    const promotion = getBestPromotion(skin.category, skin.rarity, skinId, isFirstPurchase);
    if (promotion) {
      const discounted = calculateDiscountedPrice(priceHbar, promotion.discountPercent);
      priceHbar = discounted.hbar;
      priceUsd = discounted.usd;
    }

    const intentId = `skin-pay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const intent: PaymentIntent = {
      intentId,
      skinId,
      buyerAccountId,
      amountHbar: priceHbar,
      amountUsd: priceUsd,
      paymentMethod,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
      status: 'pending',
      createdAt: Date.now()
    };

    this.paymentIntents.set(intentId, intent);

    logger.info('SkinPayment', {
      intentId,
      skinId,
      buyer: buyerAccountId,
      amountHbar: priceHbar,
      paymentMethod,
      message: 'Payment intent created'
    });

    return {
      intentId,
      amountHbar: priceHbar,
      amountUsd: priceUsd
    };
  }

  /**
   * Process a payment and mint the skin
   */
  async processPayment(intentId: string, confirmationData?: {
    signedTransaction?: string;
    x402PaymentId?: string;
  }): Promise<PaymentResult> {
    const startTime = Date.now();
    const intent = this.paymentIntents.get(intentId);

    if (!intent) {
      return {
        success: false,
        error: 'Payment intent not found',
        processingTime: Date.now() - startTime
      };
    }

    if (intent.status !== 'pending') {
      return {
        success: false,
        error: `Payment intent already ${intent.status}`,
        processingTime: Date.now() - startTime
      };
    }

    if (Date.now() > intent.expiresAt) {
      intent.status = 'failed';
      return {
        success: false,
        error: 'Payment intent expired',
        processingTime: Date.now() - startTime
      };
    }

    try {
      let paymentId: string | undefined;
      let transactionId: string | undefined;

      // Route to appropriate payment processor
      if (intent.paymentMethod === 'hbar') {
        // Direct HBAR payment
        const result = await this.processHbarPayment(intent, confirmationData?.signedTransaction);
        if (!result.success) {
          throw new Error(result.error || 'HBAR payment failed');
        }
        paymentId = result.paymentId;
        transactionId = result.transactionId;
      } else {
        // x402 payment
        const result = await this.processX402Payment(intent, confirmationData?.x402PaymentId);
        if (!result.success) {
          throw new Error(result.error || 'x402 payment failed');
        }
        paymentId = result.paymentId;
        transactionId = result.transactionId;
      }

      // Update intent status
      intent.status = 'completed';

      // Mint the skin
      const mintRequest: MintingRequest = {
        skinId: intent.skinId,
        buyerAccountId: intent.buyerAccountId,
        paymentMethod: intent.paymentMethod,
        paymentAmount: intent.amountHbar,
        paymentCurrency: 'HBAR',
        paymentTransactionId: transactionId || paymentId || 'unknown'
      };

      const mintResult = await this.mintingService.mintSkin(mintRequest);

      const paymentResult: PaymentResult = {
        success: true,
        paymentId,
        transactionId,
        amountHbar: intent.amountHbar,
        amountUsd: intent.amountUsd,
        mintResult,
        processingTime: Date.now() - startTime
      };

      this.paymentHistory.push(paymentResult);

      logger.info('SkinPayment', {
        intentId,
        skinId: intent.skinId,
        buyer: intent.buyerAccountId,
        amountHbar: intent.amountHbar,
        paymentMethod: intent.paymentMethod,
        mintSuccess: mintResult.success,
        processingTime: Date.now() - startTime,
        message: 'Payment and minting completed'
      });

      return paymentResult;

    } catch (error) {
      intent.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);

      const failedResult: PaymentResult = {
        success: false,
        error: errorMessage,
        processingTime: Date.now() - startTime
      };

      this.paymentHistory.push(failedResult);

      logger.error('SkinPayment', {
        intentId,
        skinId: intent.skinId,
        error: errorMessage,
        message: 'Payment processing failed'
      });

      return failedResult;
    }
  }

  /**
   * Process direct HBAR payment
   */
  private async processHbarPayment(
    intent: PaymentIntent,
    signedTransaction?: string
  ): Promise<{ success: boolean; paymentId?: string; transactionId?: string; error?: string }> {
    try {
      // Use the agent payment system for HBAR transfers
      // In a real implementation, this would verify the signed transaction
      // For now, we simulate a successful payment

      const paymentId = `hbar-pay-${Date.now()}`;
      const transactionId = signedTransaction || `0.0.${Date.now()}@${Date.now()}`;

      logger.info('SkinPayment', {
        intentId: intent.intentId,
        paymentId,
        amountHbar: intent.amountHbar,
        message: 'HBAR payment processed'
      });

      return {
        success: true,
        paymentId,
        transactionId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'HBAR payment failed'
      };
    }
  }

  /**
   * Process x402 payment (fiat onramp)
   */
  private async processX402Payment(
    intent: PaymentIntent,
    x402PaymentId?: string
  ): Promise<{ success: boolean; paymentId?: string; transactionId?: string; error?: string }> {
    try {
      // Use x402 settlement for fiat payments
      // This converts USD to HBAR and settles to the treasury

      if (!config.X402_BASE_URL) {
        throw new Error('x402 not configured');
      }

      const settlement = await x402Settlement.settle(
        `skin-${intent.skinId}`,
        'skin-marketplace',
        config.HEDERA_OPERATOR_ACCOUNT_ID || '',
        intent.amountHbar
      );

      if (settlement.state !== 'settled') {
        throw new Error(`x402 settlement failed: ${settlement.error || 'unknown error'}`);
      }

      logger.info('SkinPayment', {
        intentId: intent.intentId,
        settlementId: settlement.settlementId,
        x402PaymentId: settlement.x402PaymentId,
        amountHbar: intent.amountHbar,
        message: 'x402 payment settled'
      });

      return {
        success: true,
        paymentId: settlement.settlementId,
        transactionId: settlement.txId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'x402 payment failed'
      };
    }
  }

  /**
   * Get payment intent by ID
   */
  getPaymentIntent(intentId: string): PaymentIntent | undefined {
    return this.paymentIntents.get(intentId);
  }

  /**
   * Get all pending intents for a buyer
   */
  getPendingIntents(buyerAccountId: string): PaymentIntent[] {
    return Array.from(this.paymentIntents.values())
      .filter(i => i.buyerAccountId === buyerAccountId && i.status === 'pending');
  }

  /**
   * Get payment history
   */
  getPaymentHistory(limit: number = 100): PaymentResult[] {
    return this.paymentHistory
      .sort((a, b) => b.processingTime - a.processingTime)
      .slice(0, limit);
  }

  /**
   * Calculate total revenue
   */
  getRevenueStats(): {
    totalHbar: number;
    totalUsd: number;
    successfulPayments: number;
    failedPayments: number;
  } {
    const successful = this.paymentHistory.filter(p => p.success);
    const failed = this.paymentHistory.filter(p => !p.success);

    return {
      totalHbar: successful.reduce((sum, p) => sum + (p.amountHbar || 0), 0),
      totalUsd: successful.reduce((sum, p) => sum + (p.amountUsd || 0), 0),
      successfulPayments: successful.length,
      failedPayments: failed.length
    };
  }

  /**
   * Cancel a pending payment intent
   */
  cancelPaymentIntent(intentId: string): boolean {
    const intent = this.paymentIntents.get(intentId);
    if (intent && intent.status === 'pending') {
      intent.status = 'failed';
      logger.info('SkinPayment', {
        intentId,
        message: 'Payment intent cancelled'
      });
      return true;
    }
    return false;
  }
}

// Singleton instance
let paymentHandler: SkinPaymentHandler | null = null;

export function getSkinPaymentHandler(): SkinPaymentHandler {
  if (!paymentHandler) {
    paymentHandler = new SkinPaymentHandler();
  }
  return paymentHandler;
}
