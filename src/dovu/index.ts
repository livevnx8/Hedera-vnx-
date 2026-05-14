/**
 * Dovu Integration Index
 * Central export point for all Dovu-related modules
 */

// Core modules
export { dovuAdapter, type DovuDataPayload, type DovuVerificationResult } from './dovuAdapter.js';
export { verificationEngine, type AdvancedVerificationResult, type VerificationContext } from './verificationEngine.js';
export { notaryService, type NotarizationRecord, type CompletionCertificate } from './notaryService.js';
export { paymentOrchestrator, type PaymentRequest, type StakingPosition, type PaymentStats } from './paymentOrchestrator.js';

// Payment source for external payments
export { veraPaymentSource, VeraPaymentSource, type Invoice, type ClientInfo, type PaymentNotification } from './paymentSource.js';

// HCS Logger for growth and trust
export { veraHCS, VeraHCSLogger, type GrowthMilestone, type TrustScore } from './veraHCS.js';

// Tool definitions for agent integration
export const DOVU_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'dovu_verify_data',
      description: 'Verify data from Dovu OS using Hedera attestation. Validates account, signature, and data integrity. Returns verification result with confidence score and HCS attestation hash.',
      parameters: {
        type: 'object',
        properties: {
          data_id: {
            type: 'string',
            description: 'Dovu data ID to verify (e.g., carbon credit ID, supply chain record ID)',
          },
          verification_depth: {
            type: 'string',
            enum: ['basic', 'standard', 'deep'],
            description: 'Verification depth: basic (account check), standard (+ mirror node), deep (+ HCS history + cross-references)',
          },
        },
        required: ['data_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dovu_submit_attestation',
      description: 'Submit a verified attestation to Hedera Consensus Service (HCS). Creates immutable record of verification that can be used for payments and notarization.',
      parameters: {
        type: 'object',
        properties: {
          data_id: {
            type: 'string',
            description: 'Dovu data ID that was verified',
          },
          verification_hash: {
            type: 'string',
            description: 'Hash from the verification result',
          },
          verified: {
            type: 'boolean',
            description: 'Whether the data passed verification',
          },
        },
        required: ['data_id', 'verification_hash', 'verified'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dovu_claim_payment',
      description: 'Claim DOVU token payment for completed verification work. Supports smart contract automation, manual transfer, or staking rewards.',
      parameters: {
        type: 'object',
        properties: {
          notarization_id: {
            type: 'string',
            description: 'Notarization record ID from successful attestation',
          },
          payment_type: {
            type: 'string',
            enum: ['smart_contract', 'manual', 'staking_reward'],
            description: 'Payment mechanism: smart_contract (auto), manual (transfer), staking_reward (from staked position)',
          },
        },
        required: ['notarization_id', 'payment_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dovu_create_certificate',
      description: 'Create a completion certificate for batch verifications. Aggregates multiple notarizations into a single verifiable certificate on HCS.',
      parameters: {
        type: 'object',
        properties: {
          project_name: {
            type: 'string',
            description: 'Name of the project or batch',
          },
          description: {
            type: 'string',
            description: 'Description of the verification work performed',
          },
          notarization_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of notarization record IDs to include in certificate',
          },
        },
        required: ['project_name', 'notarization_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dovu_stake_tokens',
      description: 'Stake DOVU tokens to earn rewards and establish reputation. Higher stakes enable larger verification batches and higher payments.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Amount of DOVU tokens to stake (in smallest units)',
          },
          lock_period_days: {
            type: 'number',
            description: 'Lock period in days (minimum 30)',
          },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dovu_get_stats',
      description: 'Get Vera\'s Dovu verification statistics including total payments, staking rewards, pending verifications, and success rate.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];
