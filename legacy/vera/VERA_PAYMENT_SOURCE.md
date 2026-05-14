# Vera Payment Source - Client Payment System

## Overview

Vera now has a **Payment Source** system that allows external clients to pay her in DOVU tokens for carbon credit verification services. This creates a real revenue stream for Vera's verification work.

## How It Works

### For Vera (Service Provider)

1. **Create Client Accounts**: Register clients who want verification services
2. **Generate Invoices**: Create payment requests for verification batches
3. **Receive Payments**: Automatically detect and process incoming DOVU payments
4. **Track Earnings**: Monitor total revenue and pending payments

### For Clients (Service Buyers)

1. **Request Verification**: Contact Vera for carbon credit verification
2. **Receive Invoice**: Get payment URL and QR code
3. **Pay with DOVU**: Send DOVU tokens to Vera's wallet
4. **Get Service**: Vera performs verification after payment confirmation

## Wallet Information

- **Vera's Wallet**: `0.0.10294360`
- **Token**: `0.0.3716059` (DOVU)
- **Network**: Hedera Mainnet

## Usage

### Demo Script

Run the payment source demo:

```bash
npx tsx vera-payment-source-demo.ts
```

### API Integration

```typescript
import { veraPaymentSource } from './src/dovu/paymentSource.js';

// Initialize
await veraPaymentSource.initialize();

// Create a client
const client = await veraPaymentSource.createClient(
  'Carbon Project Inc',
  'payments@carbonproject.com',
  '0.0.1234567' // Their Hedera account
);

// Create invoice for 20 verifications at 5 DOVU each
const invoice = await veraPaymentSource.createInvoice(
  client.id,
  20, // number of verifications
  5   // DOVU per verification
);

// Start monitoring for payments
veraPaymentSource.startPaymentPolling(30000); // Check every 30s

// Handle payment events
veraPaymentSource.onPayment((notification) => {
  console.log(`Received ${notification.amount} DOVU!`);
});
```

## Client Payment Options

### Option 1: HashScan Web Interface

Clients can pay directly via HashScan:

```
https://hashscan.io/mainnet/transfer?to=0.0.10294360&token=0.0.3716059&amount=<AMOUNT>
```

### Option 2: Wallet Transfer

Send DOVU tokens to:
- **To**: `0.0.10294360`
- **Token**: `0.0.3716059`
- **Memo**: Invoice ID (optional)

### Option 3: SaucerSwap

1. Go to https://www.saucerswap.finance
2. Connect wallet
3. Select "Send"
4. Enter Vera's account: `0.0.10294360`
5. Select token: DOVU
6. Enter amount and confirm

## Pricing

**Standard Rates:**
- Basic Verification: 1 DOVU per credit
- Standard Verification: 5 DOVU per credit  
- Deep Verification: 10 DOVU per credit
- Batch Bonus: 2 DOVU bonus for 10+ credits

**Example Invoice:**
- 20 carbon credits × 5 DOVU = **100 DOVU**

## Payment Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Carbon Project │      │  Vera Payment   │      │  Vera's Wallet  │
│  (Client)       │      │  Source         │      │  (0.0.10294360) │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         │ 1. Request 20 verifs   │                        │
         │───────────────────────>│                        │
         │                        │                        │
         │ 2. Invoice: 100 DOVU   │                        │
         │<───────────────────────│                        │
         │                        │                        │
         │ 3. Send 100 DOVU       │                        │
         │─────────────────────────────────────────────────>│
         │                        │                        │
         │                        │ 4. Detect payment      │
         │                        │<───────────────────────│
         │                        │                        │
         │                        │ 5. Match to invoice    │
         │                        │                        │
         │ 6. Start verification  │                        │
         │<───────────────────────│                        │
         │                        │                        │
         │ 7. Deliver results     │                        │
         │<───────────────────────│                        │
         │                        │                        │
```

## Monitoring

Check payment stats anytime:

```typescript
const stats = veraPaymentSource.getStats();
console.log(`Total received: ${stats.totalReceived} DOVU`);
console.log(`Pending invoices: ${stats.pendingInvoices}`);
console.log(`Current balance: ${stats.currentBalance} DOVU`);
```

## Security

- All payments are on Hedera blockchain (immutable)
- Invoices are tracked with unique IDs
- Payment matching is automatic
- Balance checking prevents double-counting

## Next Steps

1. **Install QR code support**: `npm install qrcode`
2. **Create client onboarding form**
3. **Set up automated verification upon payment**
4. **Build client dashboard**
5. **Integrate with DOVU marketplace**

## Links

- **HashScan Account**: https://hashscan.io/mainnet/account/0.0.10294360
- **DOVU Token**: https://hashscan.io/mainnet/token/0.0.3716059
- **SaucerSwap**: https://www.saucerswap.finance
