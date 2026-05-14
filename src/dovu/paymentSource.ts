/**
 * Vera Payment Source - External Payment Receiving System
 * 
 * Creates a payment gateway for clients to pay Vera in DOVU
 * for carbon credit verification services.
 * 
 * Features:
 * - Invoice generation with QR codes
 * - Payment tracking
 * - Client management
 * - Automated verification upon payment
 */

import { Client as HederaClient, AccountBalanceQuery, TransferTransaction, TokenAssociateTransaction } from '@hashgraph/sdk';
import { config } from '../config.js';
import { logger } from '../monitoring/logger.js';
import crypto from 'crypto';
// import QRCode from 'qrcode'; // Install with: npm install qrcode

const DOVU_TOKEN_ID = '0.0.3716059';
const VERA_WALLET = config.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.10294360';

export interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  amount: number; // in DOVU (not tinybars)
  description: string;
  verificationCount: number;
  status: 'pending' | 'paid' | 'processing' | 'completed' | 'expired';
  createdAt: number;
  paidAt?: number;
  transactionId?: string;
  qrCode?: string;
  paymentUrl?: string;
}

export interface ClientInfo {
  id: string;
  name: string;
  email: string;
  hederaAccountId?: string;
  totalPaid: number;
  verificationCredits: number;
  createdAt: number;
}

export interface PaymentNotification {
  invoiceId: string;
  amount: number;
  fromAccount: string;
  transactionId: string;
  timestamp: number;
}

export class VeraPaymentSource {
  private client: HederaClient;
  private invoices = new Map<string, Invoice>();
  private clients = new Map<string, ClientInfo>();
  private onPaymentReceived?: (notification: PaymentNotification) => void;
  private pollingInterval?: NodeJS.Timeout;
  private lastBalance = 0;

  constructor() {
    const network = (config.HEDERA_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';
    this.client = network === 'mainnet' ? HederaClient.forMainnet() : HederaClient.forTestnet();
    
    if (config.HEDERA_OPERATOR_ACCOUNT_ID && config.HEDERA_OPERATOR_PRIVATE_KEY) {
      this.client.setOperator(
        config.HEDERA_OPERATOR_ACCOUNT_ID,
        config.HEDERA_OPERATOR_PRIVATE_KEY
      );
    }
  }

  /**
   * Initialize the payment source
   */
  async initialize(): Promise<void> {
    logger.info('VeraPaymentSource', { 
      wallet: VERA_WALLET,
      balance: this.lastBalance,
      message: 'Payment source initialized' 
    });
  }

  /**
   * Check DOVU token balance
   */
  async checkDOVUBalance(): Promise<number> {
    try {
      const query = new AccountBalanceQuery().setAccountId(VERA_WALLET);
      const balance = await query.execute(this.client);
      const dovuBalance = balance.tokens?._map?.get(DOVU_TOKEN_ID) || 0;
      return dovuBalance;
    } catch (error) {
      logger.error('VeraPaymentSource', { error, message: 'Failed to check balance' });
      return 0;
    }
  }

  /**
   * Create a new client
   */
  async createClient(name: string, email: string, hederaAccountId?: string): Promise<ClientInfo> {
    const client: ClientInfo = {
      id: crypto.randomUUID(),
      name,
      email,
      hederaAccountId,
      totalPaid: 0,
      verificationCredits: 0,
      createdAt: Date.now(),
    };
    
    this.clients.set(client.id, client);
    
    logger.info('VeraPaymentSource', { 
      clientId: client.id,
      name,
      message: 'New client created' 
    });
    
    return client;
  }

  /**
   * Create an invoice for verification services
   */
  async createInvoice(
    clientId: string,
    verificationCount: number,
    ratePerVerification: number = 5 // DOVU per verification
  ): Promise<Invoice> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    const amount = verificationCount * ratePerVerification;
    const invoiceId = crypto.randomUUID();
    
    // Generate payment URL
    const paymentUrl = `https://hashscan.io/mainnet/transfer?to=${VERA_WALLET}&token=${DOVU_TOKEN_ID}&amount=${amount * 100000000}`;
    
    // QR code generation (requires: npm install qrcode)
    // const qrCode = await QRCode.toDataURL(paymentUrl);
    
    const invoice: Invoice = {
      id: invoiceId,
      clientId,
      clientName: client.name,
      amount,
      description: `${verificationCount} carbon credit verifications @ ${ratePerVerification} DOVU each`,
      verificationCount,
      status: 'pending',
      createdAt: Date.now(),
      // qrCode, // Uncomment after installing qrcode package
      paymentUrl,
    };
    
    this.invoices.set(invoiceId, invoice);
    
    logger.info('VeraPaymentSource', { 
      invoiceId,
      clientId,
      amount,
      verifications: verificationCount,
      message: 'Invoice created' 
    });
    
    return invoice;
  }

  /**
   * Start polling for incoming payments
   */
  startPaymentPolling(intervalMs: number = 30000): void {
    logger.info('VeraPaymentSource', { 
      interval: intervalMs,
      message: 'Starting payment polling' 
    });
    
    this.pollingInterval = setInterval(async () => {
      await this.checkForNewPayments();
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  stopPaymentPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
      logger.info('VeraPaymentSource', { message: 'Payment polling stopped' });
    }
  }

  /**
   * Check for new incoming payments
   */
  private async checkForNewPayments(): Promise<void> {
    try {
      const currentBalance = await this.checkDOVUBalance();
      
      if (currentBalance > this.lastBalance) {
        const received = currentBalance - this.lastBalance;
        
        logger.info('VeraPaymentSource', { 
          received: received / 100000000,
          newBalance: currentBalance / 100000000,
          message: 'New DOVU received!' 
        });
        
        // Match payment to pending invoice
        await this.matchPaymentToInvoice(received);
        
        // Notify callback
        if (this.onPaymentReceived) {
          this.onPaymentReceived({
            invoiceId: 'unknown', // Will be updated by matchPaymentToInvoice
            amount: received,
            fromAccount: 'unknown',
            transactionId: 'pending',
            timestamp: Date.now(),
          });
        }
      }
      
      this.lastBalance = currentBalance;
    } catch (error) {
      logger.error('VeraPaymentSource', { error, message: 'Payment check failed' });
    }
  }

  /**
   * Match incoming payment to a pending invoice
   */
  private async matchPaymentToInvoice(amount: number): Promise<void> {
    const amountInDOVU = amount / 100000000;
    
    // Find pending invoice with matching amount
    for (const [id, invoice] of this.invoices) {
      if (invoice.status === 'pending' && Math.abs(invoice.amount - amountInDOVU) < 0.01) {
        invoice.status = 'paid';
        invoice.paidAt = Date.now();
        
        // Add verification credits to client
        const client = this.clients.get(invoice.clientId);
        if (client) {
          client.totalPaid += amountInDOVU;
          client.verificationCredits += invoice.verificationCount;
        }
        
        logger.info('VeraPaymentSource', { 
          invoiceId: id,
          amount: amountInDOVU,
          clientId: invoice.clientId,
          message: 'Payment matched to invoice' 
        });
        
        break;
      }
    }
  }

  /**
   * Get all pending invoices
   */
  getPendingInvoices(): Invoice[] {
    return Array.from(this.invoices.values())
      .filter(inv => inv.status === 'pending')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): ClientInfo | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all clients
   */
  getAllClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  /**
   * Set callback for payment notifications
   */
  onPayment(callback: (notification: PaymentNotification) => void): void {
    this.onPaymentReceived = callback;
  }

  /**
   * Get payment stats
   */
  getStats(): {
    totalInvoices: number;
    pendingInvoices: number;
    paidInvoices: number;
    totalReceived: number;
    totalClients: number;
    currentBalance: number;
  } {
    const invoices = Array.from(this.invoices.values());
    const paidInvoices = invoices.filter(inv => inv.status === 'paid');
    
    return {
      totalInvoices: invoices.length,
      pendingInvoices: invoices.filter(inv => inv.status === 'pending').length,
      paidInvoices: paidInvoices.length,
      totalReceived: paidInvoices.reduce((sum, inv) => sum + inv.amount, 0),
      totalClients: this.clients.size,
      currentBalance: this.lastBalance / 100000000,
    };
  }
}

// Singleton instance
export const veraPaymentSource = new VeraPaymentSource();
