/**
 * AI Venture Capitalist (Phase 18)
 * 
 * Autonomous investment into ecosystem projects with AI-driven
 * due diligence, valuation, and portfolio management.
 */

import { logger } from '../monitoring/logger.js';
import type {
  Project,
  DealFlow,
  DDReport,
  TermSheet,
  InvestmentReceipt,
  PortfolioReport,
  InvestmentThesis,
  DealStage
} from './types.js';

interface AIVCConfig {
  maxInvestmentPerDeal: bigint;
  totalInvestmentBudget: bigint;
  minDDScore: number;
  requireHumanApprovalAbove: bigint;
  thesisAllocation: Record<InvestmentThesis, number>;
}

interface InvestmentRecord {
  receipt: InvestmentReceipt;
  project: Project;
  currentValue: bigint;
  stage: DealStage;
  performance: {
    userGrowth: number;
    revenueGrowth: number;
    tokenPerformance: number;
  };
}

export class AIVentureCapitalist {
  private config: AIVCConfig;
  private dealFlow: Project[] = [];
  private ddReports: Map<string, DDReport> = new Map();
  private termSheets: Map<string, TermSheet> = new Map();
  private investments: Map<string, InvestmentRecord> = new Map();
  private dealPipeline: Map<string, { project: Project; stage: DealStage }> = new Map();

  constructor(config: Partial<AIVCConfig> = {}) {
    this.config = {
      maxInvestmentPerDeal: BigInt(50000 * 100_000_000), // $50K
      totalInvestmentBudget: BigInt(500000 * 100_000_000), // $500K
      minDDScore: 70,
      requireHumanApprovalAbove: BigInt(10000 * 100_000_000), // $10K
      thesisAllocation: {
        infrastructure: 0.40,
        application: 0.35,
        research: 0.15,
        ecosystem: 0.10
      },
      ...config
    };

    this.initializeMockDealFlow();
  }

  /**
   * Screen new investment opportunities
   */
  async screenOpportunities(): Promise<DealFlow> {
    // In production, would fetch from various sources
    // (accelerators, hackathons, chain explorers, etc.)
    const opportunities = this.dealFlow.filter(p => 
      !this.ddReports.has(p.projectId) &&
      !this.dealPipeline.has(p.projectId)
    );

    // Score and filter
    const scored = opportunities.map(p => ({
      project: p,
      score: this.calculateOpportunityScore(p)
    }));

    const passed = scored
      .filter(s => s.score > 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // Top 10
      .map(s => s.project);

    // Move to pipeline
    for (const project of passed) {
      this.dealPipeline.set(project.projectId, { project, stage: 'screening' });
    }

    logger.info('AIVentureCapitalist', {
      message: 'Opportunity screening complete',
      screened: opportunities.length,
      passed: passed.length
    });

    return {
      projects: passed,
      screenedAt: Date.now(),
      matchScore: passed.length > 0 ? 0.85 : 0,
      passedScreening: passed.length > 0
    };
  }

  /**
   * Conduct AI due diligence on a project
   */
  async conductDueDiligence(project: Project): Promise<DDReport> {
    // Simulate comprehensive DD
    const technicalScore = this.analyzeTechnical(project);
    const teamScore = this.analyzeTeam(project);
    const marketScore = this.analyzeMarket(project);
    const tokenomicsScore = this.analyzeTokenomics(project);

    // Weighted total
    const totalScore = (
      technicalScore * 0.30 +
      teamScore * 0.25 +
      marketScore * 0.25 +
      tokenomicsScore * 0.20
    );

    // Identify risks
    const riskFactors: string[] = [];
    const redFlags: string[] = [];

    if (technicalScore < 60) {
      riskFactors.push('Technical implementation concerns');
    }
    if (teamScore < 50) {
      redFlags.push('Team lacks relevant experience');
    }
    if (marketScore < 50) {
      riskFactors.push('Limited market opportunity');
    }
    if (tokenomicsScore < 40) {
      redFlags.push('Poor tokenomics design');
    }
    if (project.traction.users < 100 && project.stage !== 'idea') {
      riskFactors.push('Low user traction');
    }

    // Recommendation
    let recommendation: DDReport['recommendation'];
    if (totalScore >= 85 && redFlags.length === 0) {
      recommendation = 'invest';
    } else if (totalScore >= 70 && redFlags.length === 0) {
      recommendation = 'weak_pass';
    } else if (totalScore >= 60) {
      recommendation = 'weak_no';
    } else {
      recommendation = 'strong_no';
    }

    const report: DDReport = {
      projectId: project.projectId,
      technicalScore,
      teamScore,
      marketScore,
      tokenomicsScore,
      riskFactors,
      redFlags,
      recommendation,
      confidence: totalScore / 100
    };

    this.ddReports.set(project.projectId, report);

    // Update pipeline
    const pipeline = this.dealPipeline.get(project.projectId);
    if (pipeline) {
      pipeline.stage = 'dd';
    }

    logger.info('AIVentureCapitalist', {
      message: 'Due diligence complete',
      project: project.name,
      score: totalScore.toFixed(1),
      recommendation
    });

    return report;
  }

  /**
   * Generate valuation model for a project
   */
  async valuationModel(project: Project): Promise<bigint> {
    // Simple DCF-style valuation
    const dd = this.ddReports.get(project.projectId);
    if (!dd) {
      throw new Error('DD report required for valuation');
    }

    // Base valuation on traction and stage
    let baseMultiple = 5; // 5x revenue

    if (project.stage === 'idea') {
      baseMultiple = 2;
    } else if (project.stage === 'mvp') {
      baseMultiple = 4;
    } else if (project.stage === 'product') {
      baseMultiple = 6;
    } else if (project.stage === 'scale') {
      baseMultiple = 10;
    }

    // Adjust for quality
    const qualityScore = (
      dd.technicalScore + dd.teamScore + dd.marketScore + dd.tokenomicsScore
    ) / 4;

    const adjustedMultiple = baseMultiple * (qualityScore / 50);

    const valuation = BigInt(
      Math.floor(project.traction.revenue * adjustedMultiple * 100_000_000)
    );

    return valuation;
  }

  /**
   * Negotiate investment terms
   */
  async negotiateTerms(project: Project): Promise<TermSheet> {
    const dd = this.ddReports.get(project.projectId);
    if (!dd || dd.recommendation === 'strong_no') {
      throw new Error('Project not approved for investment');
    }

    const valuation = await this.valuationModel(project);

    // Determine investment size based on conviction
    let investmentAmount: bigint;
    if (dd.recommendation === 'invest') {
      investmentAmount = this.config.maxInvestmentPerDeal;
    } else {
      investmentAmount = this.config.maxInvestmentPerDeal / BigInt(2);
    }

    // Calculate ownership
    const ownership = Number(investmentAmount) / Number(valuation);

    const termSheet: TermSheet = {
      projectId: project.projectId,
      investmentAmount,
      valuation,
      ownership: ownership * 100, // as percentage
      tokenAllocation: ownership * 100,
      vesting: '4 years, 1 year cliff',
      rights: [
        'Information rights (quarterly updates)',
        'Pro-rata rights in future rounds',
        'Board observer seat (if >$25K)'
      ],
      conditions: [
        'Completion of legal documentation',
        'Key team members vesting commitment',
        'Milestone-based tranche releases'
      ]
    };

    this.termSheets.set(project.projectId, termSheet);

    // Update pipeline
    const pipeline = this.dealPipeline.get(project.projectId);
    if (pipeline) {
      pipeline.stage = 'term_sheet';
    }

    logger.info('AIVentureCapitalist', {
      message: 'Term sheet generated',
      project: project.name,
      investment: `$${(Number(investmentAmount) / 100_000_000).toFixed(0)}K`,
      ownership: `${(ownership * 100).toFixed(2)}%`
    });

    return termSheet;
  }

  /**
   * Execute investment
   */
  async executeInvestment(projectId: string): Promise<InvestmentReceipt> {
    const project = this.dealFlow.find(p => p.projectId === projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const termSheet = this.termSheets.get(projectId);
    if (!termSheet) {
      throw new Error('Term sheet not found');
    }

    // Check if approval required
    if (termSheet.investmentAmount > this.config.requireHumanApprovalAbove) {
      logger.warn('AIVentureCapitalist', {
        message: 'Investment requires human approval',
        project: project.name,
        amount: `$${(Number(termSheet.investmentAmount) / 100_000_000).toFixed(0)}K`
      });
      // In production, would queue for governance approval
    }

    const dealId = `deal-${Date.now()}`;

    const receipt: InvestmentReceipt = {
      dealId,
      projectId,
      amount: termSheet.investmentAmount,
      txHash: `0x${Buffer.from(dealId).toString('hex')}`,
      timestamp: Date.now(),
      termSheet
    };

    // Record investment
    const record: InvestmentRecord = {
      receipt,
      project,
      currentValue: termSheet.investmentAmount, // Initial value
      stage: 'invested',
      performance: {
        userGrowth: project.traction.growth,
        revenueGrowth: project.traction.growth,
        tokenPerformance: 0
      }
    };

    this.investments.set(dealId, record);

    // Update pipeline
    const pipeline = this.dealPipeline.get(projectId);
    if (pipeline) {
      pipeline.stage = 'invested';
    }

    logger.info('AIVentureCapitalist', {
      message: 'Investment executed',
      dealId,
      project: project.name,
      amount: `$${(Number(receipt.amount) / 100_000_000).toFixed(0)}K`
    });

    return receipt;
  }

  /**
   * Portfolio management and tracking
   */
  async portfolioManagement(): Promise<PortfolioReport> {
    const investments = Array.from(this.investments.values());

    const totalInvested = investments.reduce(
      (sum, i) => sum + i.receipt.amount,
      BigInt(0)
    );

    const totalValue = investments.reduce(
      (sum, i) => sum + i.currentValue,
      BigInt(0)
    );

    const unrealized = investments.length > 0
      ? Number((totalValue - totalInvested) * BigInt(100)) / Number(totalInvested)
      : 0;

    // Group by thesis
    const byThesis: PortfolioReport['byThesis'] = {
      infrastructure: { count: 0, value: BigInt(0) },
      application: { count: 0, value: BigInt(0) },
      research: { count: 0, value: BigInt(0) },
      ecosystem: { count: 0, value: BigInt(0) }
    };

    for (const inv of investments) {
      const thesis = inv.project.thesis;
      byThesis[thesis].count++;
      byThesis[thesis].value += inv.currentValue;
    }

    const report: PortfolioReport = {
      totalInvested,
      totalValue,
      unrealizedReturn: unrealized,
      realizedReturn: 0, // No exits yet
      investments: investments.map(i => i.receipt),
      byThesis
    };

    logger.info('AIVentureCapitalist', {
      message: 'Portfolio report generated',
      investments: investments.length,
      totalInvested: `$${(Number(totalInvested) / 100_000_000).toFixed(0)}K`,
      unrealizedReturn: `${unrealized.toFixed(1)}%`
    });

    return report;
  }

  /**
   * Get deal pipeline
   */
  getPipeline(): Array<{ project: Project; stage: DealStage }> {
    return Array.from(this.dealPipeline.values());
  }

  /**
   * Get investment by ID
   */
  getInvestment(dealId: string): InvestmentRecord | undefined {
    return this.investments.get(dealId);
  }

  /**
   * Get AIVC statistics
   */
  getStats() {
    const investments = Array.from(this.investments.values());
    const invested = investments.reduce((s, i) => s + i.receipt.amount, BigInt(0));
    const remaining = this.config.totalInvestmentBudget - invested;

    return {
      timestamp: Date.now(),
      totalBudget: this.config.totalInvestmentBudget,
      invested,
      remaining,
      dealCount: investments.length,
      pipelineCount: this.dealPipeline.size,
      ddReportsCount: this.ddReports.size,
      byThesis: this.calculateThesisAllocation()
    };
  }

  // Private methods
  private initializeMockDealFlow(): void {
    const projects: Project[] = [
      {
        projectId: 'proj-1',
        name: 'Hedera Indexer Pro',
        description: 'High-performance indexing solution for Hedera',
        team: ['ex-graph-node', 'ex-chainalysis'],
        stage: 'product',
        chain: 'hedera',
        raiseAmount: BigInt(200000 * 100_000_000),
        valuation: BigInt(1000000 * 100_000_000),
        thesis: 'infrastructure',
        traction: { users: 500, revenue: 50000, growth: 2.5 }
      },
      {
        projectId: 'proj-2',
        name: 'DeFi Dashboard',
        description: 'Unified DeFi portfolio tracking',
        team: ['solidity-dev', 'ux-designer'],
        stage: 'mvp',
        chain: 'hedera',
        raiseAmount: BigInt(100000 * 100_000_000),
        valuation: BigInt(500000 * 100_000_000),
        thesis: 'application',
        traction: { users: 200, revenue: 10000, growth: 1.8 }
      },
      {
        projectId: 'proj-3',
        name: 'ZK-Research Lab',
        description: 'Novel zero-knowledge proof systems',
        team: ['phd-cryptography'],
        stage: 'idea',
        chain: 'multi',
        raiseAmount: BigInt(50000 * 100_000_000),
        valuation: BigInt(250000 * 100_000_000),
        thesis: 'research',
        traction: { users: 0, revenue: 0, growth: 0 }
      }
    ];

    this.dealFlow = projects;
  }

  private calculateOpportunityScore(project: Project): number {
    let score = 0.5;

    // Stage score
    const stageScores: Record<string, number> = {
      idea: 0.3,
      mvp: 0.6,
      product: 0.85,
      scale: 1.0
    };
    score += (stageScores[project.stage] || 0.5) * 0.3;

    // Traction score
    const tractionScore = Math.min(project.traction.users / 1000, 1) * 0.2;
    score += tractionScore;

    // Growth score
    const growthScore = Math.min(project.traction.growth / 3, 1) * 0.2;
    score += growthScore;

    // Thesis alignment
    const targetAllocation = this.config.thesisAllocation[project.thesis];
    const currentAllocation = this.calculateThesisAllocation()[project.thesis];
    if (currentAllocation < targetAllocation) {
      score += 0.15; // Bonus for under-represented thesis
    }

    return Math.min(score, 1.0);
  }

  private calculateThesisAllocation(): Record<InvestmentThesis, number> {
    const investments = Array.from(this.investments.values());
    const total = investments.length;

    if (total === 0) {
      return { infrastructure: 0, application: 0, research: 0, ecosystem: 0 };
    }

    const counts: Partial<Record<InvestmentThesis, number>> = {};
    for (const inv of investments) {
      counts[inv.project.thesis] = (counts[inv.project.thesis] || 0) + 1;
    }

    return {
      infrastructure: (counts.infrastructure || 0) / total,
      application: (counts.application || 0) / total,
      research: (counts.research || 0) / total,
      ecosystem: (counts.ecosystem || 0) / total
    };
  }

  private analyzeTechnical(project: Project): number {
    // Mock technical analysis
    const base = project.stage === 'product' ? 80 : 60;
    return Math.min(base + Math.random() * 20, 100);
  }

  private analyzeTeam(project: Project): number {
    // Mock team analysis
    const base = project.team.length * 15;
    return Math.min(base + Math.random() * 30, 100);
  }

  private analyzeMarket(project: Project): number {
    // Mock market analysis
    const tractionScore = Math.min(project.traction.users / 10, 50);
    return Math.min(50 + tractionScore + Math.random() * 20, 100);
  }

  private analyzeTokenomics(project: Project): number {
    // Mock tokenomics analysis
    return Math.floor(40 + Math.random() * 40);
  }
}

// Singleton
let vcInstance: AIVentureCapitalist | null = null;

export function getAIVentureCapitalist(config?: Partial<AIVCConfig>): AIVentureCapitalist {
  if (!vcInstance) {
    vcInstance = new AIVentureCapitalist(config);
  }
  return vcInstance;
}
