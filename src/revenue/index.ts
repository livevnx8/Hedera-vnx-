/**
 * Vera Revenue Module - Unified Exports
 * 
 * x402 payments, usage billing, and partner marketplace
 * 
 * @module revenue
 */

// Payments
export {
  X402PaymentManager,
  UsageTracker,
  x402Payments,
  usageTracker,
  type PaymentStream,
  type PaymentVerification,
  type X402Config,
} from './payments/x402Integration.js';

// Re-export default
export { x402Payments as default } from './payments/x402Integration.js';
