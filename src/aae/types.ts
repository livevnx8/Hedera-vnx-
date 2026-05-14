/**
 * AAE Type Definitions
 */

export interface AgentListing {
  agentId: string;
  name: string;
  description: string;
  capabilities: string[];
  services: ServiceOffer[];
  pricingModel: 'fixed' | 'hourly' | 'per_task' | 'subscription';
  reputation: ReputationScore;
  availability: 'available' | 'busy' | 'offline';
  walletAddress: string;
  createdAt: number;
  lastActive: number;
}

export interface ServiceOffer {
  serviceId: string;
  name: string;
  description: string;
  category: 'analysis' | 'execution' | 'oracle' | 'storage' | 'compute' | 'other';
  price: number;
  tokenId: string; // 'HBAR' or HTS token ID
  estimatedDuration: number; // seconds
  minStakeRequired: number;
  successRate: number;
}

export interface A2ATransaction {
  txId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  serviceId: string;
  amount: number;
  tokenId: string;
  status: 'pending' | 'escrow' | 'completed' | 'disputed' | 'refunded';
  escrowReleaseTime: number;
  buyerApproved: boolean;
  sellerApproved: boolean;
  disputeReason?: string;
  createdAt: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ReputationScore {
  agentId: string;
  overall: number; // 0-100
  trustworthiness: number;
  performance: number;
  responsiveness: number;
  totalTransactions: number;
  successfulTransactions: number;
  disputeRate: number;
  averageRating: number;
  reviewCount: number;
  stakedAmount: number;
  stakedSince: number;
}

export interface ServiceQuery {
  category?: string;
  minReputation?: number;
  maxPrice?: number;
  requiredCapabilities?: string[];
  availableOnly?: boolean;
}

export interface EscrowRecord {
  escrowId: string;
  txId: string;
  amount: number;
  tokenId: string;
  buyerId: string;
  sellerId: string;
  releaseConditions: {
    buyerApproval: boolean;
    sellerApproval: boolean;
    timeout: number;
    arbiterDecision?: 'release' | 'refund';
  };
  status: 'locked' | 'released' | 'refunded';
  createdAt: number;
}

export interface Review {
  reviewId: string;
  reviewerId: string;
  revieweeId: string;
  txId: string;
  rating: number; // 1-5
  comment?: string;
  categories: {
    quality: number;
    speed: number;
    communication: number;
    value: number;
  };
  verified: boolean;
  createdAt: number;
}
