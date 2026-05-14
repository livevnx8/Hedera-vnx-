/**
 * Agent Reputation System
 * 
 * Tracks agent reputation through verified reviews, stake-weighted
 * scores, and success rate metrics. Incentivizes quality service.
 */

import { logger } from '../monitoring/logger.js';
import type { ReputationScore, Review } from './types.js';

interface ReputationConfig {
  minReviewsForPublic: number;
  reviewWeight: number;
  stakeWeight: number;
  successRateWeight: number;
  stakeMultiplier: number;
  reviewDecayDays: number;
}

export class AgentReputation {
  private scores: Map<string, ReputationScore> = new Map();
  private reviews: Map<string, Review[]> = new Map(); // agentId -> reviews
  private config: ReputationConfig;

  constructor(config: Partial<ReputationConfig> = {}) {
    this.config = {
      minReviewsForPublic: 3,
      reviewWeight: 0.4,
      stakeWeight: 0.3,
      successRateWeight: 0.3,
      stakeMultiplier: 0.1, // 10 HBAR = 1 reputation point
      reviewDecayDays: 90,
      ...config
    };
  }

  /**
   * Initialize reputation for a new agent
   */
  async initializeAgent(agentId: string, initialStake: number = 0): Promise<ReputationScore> {
    const score: ReputationScore = {
      agentId,
      overall: initialStake * this.config.stakeMultiplier,
      trustworthiness: 50,
      performance: 50,
      responsiveness: 50,
      totalTransactions: 0,
      successfulTransactions: 0,
      disputeRate: 0,
      averageRating: 0,
      reviewCount: 0,
      stakedAmount: initialStake,
      stakedSince: Date.now()
    };

    this.scores.set(agentId, score);
    this.reviews.set(agentId, []);

    logger.info('AgentReputation', {
      message: 'Agent reputation initialized',
      agentId,
      initialStake
    });

    return score;
  }

  /**
   * Submit a review for an agent
   */
  async submitReview(review: Omit<Review, 'reviewId' | 'verified' | 'createdAt'>): Promise<Review> {
    try {
      // Verify reviewer has transacted with reviewee
      const isVerified = await this.verifyReviewEligibility(
        review.reviewerId,
        review.revieweeId,
        review.txId
      );

      const fullReview: Review = {
        ...review,
        reviewId: `review-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        verified: isVerified,
        createdAt: Date.now()
      };

      // Store review
      if (!this.reviews.has(review.revieweeId)) {
        this.reviews.set(review.revieweeId, []);
      }
      this.reviews.get(review.revieweeId)!.push(fullReview);

      // Recalculate reputation
      await this.recalculateReputation(review.revieweeId);

      logger.info('AgentReputation', {
        message: 'Review submitted',
        reviewId: fullReview.reviewId,
        reviewer: review.reviewerId,
        reviewee: review.revieweeId,
        rating: review.rating,
        verified: isVerified
      });

      return fullReview;

    } catch (error) {
      logger.error('AgentReputation', {
        message: 'Review submission failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update agent stake
   */
  async updateStake(agentId: string, newStake: number): Promise<ReputationScore> {
    const score = this.scores.get(agentId);
    if (!score) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const oldStake = score.stakedAmount;
    score.stakedAmount = newStake;

    if (oldStake === 0 && newStake > 0) {
      score.stakedSince = Date.now();
    }

    // Recalculate reputation
    await this.recalculateReputation(agentId);

    logger.info('AgentReputation', {
      message: 'Stake updated',
      agentId,
      oldStake,
      newStake
    });

    return score;
  }

  /**
   * Record transaction outcome
   */
  async recordTransaction(
    agentId: string,
    success: boolean,
    disputed: boolean = false
  ): Promise<void> {
    const score = this.scores.get(agentId);
    if (!score) {
      throw new Error(`Agent ${agentId} not found`);
    }

    score.totalTransactions++;
    if (success) {
      score.successfulTransactions++;
    }
    if (disputed) {
      // Increase dispute rate
      const totalDisputes = score.disputeRate * (score.totalTransactions - 1) + (disputed ? 1 : 0);
      score.disputeRate = totalDisputes / score.totalTransactions;
    }

    // Recalculate reputation
    await this.recalculateReputation(agentId);

    logger.debug('AgentReputation', {
      message: 'Transaction recorded',
      agentId,
      success,
      disputed,
      totalTransactions: score.totalTransactions,
      successRate: score.successfulTransactions / score.totalTransactions
    });
  }

  /**
   * Get agent reputation score
   */
  getReputation(agentId: string): ReputationScore | undefined {
    return this.scores.get(agentId);
  }

  /**
   * Get agent reviews
   */
  getReviews(agentId: string, verifiedOnly: boolean = false): Review[] {
    const reviews = this.reviews.get(agentId) || [];
    if (verifiedOnly) {
      return reviews.filter(r => r.verified);
    }
    return reviews;
  }

  /**
   * Get top agents by reputation
   */
  getTopAgents(limit: number = 10, minReviews: number = 3): Array<{ agentId: string; score: ReputationScore }> {
    return Array.from(this.scores.entries())
      .filter(([_, score]) => score.reviewCount >= minReviews)
      .sort((a, b) => b[1].overall - a[1].overall)
      .slice(0, limit)
      .map(([agentId, score]) => ({ agentId, score }));
  }

  /**
   * Check if agent meets reputation threshold
   */
  meetsThreshold(agentId: string, threshold: number): boolean {
    const score = this.scores.get(agentId);
    if (!score) return false;
    return score.overall >= threshold && score.reviewCount >= this.config.minReviewsForPublic;
  }

  /**
   * Calculate reputation breakdown
   */
  getReputationBreakdown(agentId: string): {
    overall: number;
    fromReviews: number;
    fromStake: number;
    fromSuccess: number;
  } | null {
    const score = this.scores.get(agentId);
    if (!score) return null;

    return {
      overall: score.overall,
      fromReviews: score.averageRating * 20 * this.config.reviewWeight,
      fromStake: Math.min(score.stakedAmount * this.config.stakeMultiplier, 30) * this.config.stakeWeight,
      fromSuccess: (score.successfulTransactions / Math.max(score.totalTransactions, 1)) * 100 * this.config.successRateWeight
    };
  }

  /**
   * Get reputation system statistics
   */
  getStats() {
    const timestamp = Date.now();
    const scores = Array.from(this.scores.values());
    const allReviews = Array.from(this.reviews.values()).flat();

    return {
      timestamp,
      totalAgents: this.scores.size,
      totalReviews: allReviews.length,
      verifiedReviews: allReviews.filter(r => r.verified).length,
      averageReputation: scores.length > 0 
        ? scores.reduce((sum, s) => sum + s.overall, 0) / scores.length 
        : 0,
      topTierAgents: scores.filter(s => s.overall >= 80).length,
      config: this.config
    };
  }

  /**
   * Clean up old reviews (apply decay)
   */
  cleanup(): void {
    const cutoff = Date.now() - (this.config.reviewDecayDays * 24 * 60 * 60 * 1000);
    
    for (const [agentId, agentReviews] of this.reviews) {
      const filtered = agentReviews.filter(r => r.createdAt > cutoff);
      if (filtered.length !== agentReviews.length) {
        this.reviews.set(agentId, filtered);
        this.recalculateReputation(agentId);
      }
    }

    logger.info('AgentReputation', {
      message: 'Review cleanup completed',
      reviewsRemoved: Array.from(this.reviews.values())
        .reduce((sum, reviews) => sum + (this.reviews.get(Array.from(this.reviews.keys())[0])?.length || 0), 0)
    });
  }

  // Private methods
  private async recalculateReputation(agentId: string): Promise<void> {
    const score = this.scores.get(agentId);
    if (!score) return;

    const reviews = this.reviews.get(agentId) || [];
    score.reviewCount = reviews.length;

    if (reviews.length > 0) {
      // Calculate weighted average rating (verified reviews count more)
      let totalWeight = 0;
      let weightedSum = 0;

      for (const review of reviews) {
        const weight = review.verified ? 1.5 : 1.0;
        weightedSum += review.rating * weight;
        totalWeight += weight;
      }

      score.averageRating = weightedSum / totalWeight;

      // Calculate category scores
      const categoryScores = {
        quality: 0,
        speed: 0,
        communication: 0,
        value: 0
      };

      for (const review of reviews) {
        categoryScores.quality += review.categories.quality;
        categoryScores.speed += review.categories.speed;
        categoryScores.communication += review.categories.communication;
        categoryScores.value += review.categories.value;
      }

      const count = reviews.length;
      score.performance = (categoryScores.quality / count) * 20;
      score.responsiveness = (categoryScores.speed / count) * 20;
      score.trustworthiness = (categoryScores.communication / count) * 20;
    }

    // Calculate overall score
    const reviewScore = score.averageRating * 20; // 5-star scale to 100
    const stakeScore = Math.min(score.stakedAmount * this.config.stakeMultiplier, 30);
    const successScore = score.totalTransactions > 0 
      ? (score.successfulTransactions / score.totalTransactions) * 100 
      : 50;

    score.overall = Math.round(
      reviewScore * this.config.reviewWeight +
      stakeScore * this.config.stakeWeight +
      successScore * this.config.successRateWeight
    );

    // Cap at 100
    score.overall = Math.min(score.overall, 100);
  }

  private async verifyReviewEligibility(
    reviewerId: string,
    revieweeId: string,
    txId: string
  ): Promise<boolean> {
    // In production, this would check the actual transaction record
    // For now, accept all reviews as potentially valid
    return reviewerId !== revieweeId;
  }
}

// Singleton
let reputationInstance: AgentReputation | null = null;

export function getAgentReputation(config?: Partial<ReputationConfig>): AgentReputation {
  if (!reputationInstance) {
    reputationInstance = new AgentReputation(config);
  }
  return reputationInstance;
}
