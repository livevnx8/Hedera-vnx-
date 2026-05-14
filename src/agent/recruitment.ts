/**
 * Agent Recruitment Module
 * Autonomous agent recruitment based on workload detection
 * 
 * Responsibilities:
 * - Monitor task queue depth and agent capacity
 * - Broadcast recruitment needs via HCS
 * - Onboard new agents from factory
 * - Self-improvement: adjust recruitment criteria
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger.js';
import { config } from '../config.js';
import { agentFactory, AgentCapabilities } from './factory.js';
import { flowerOfLifeOS } from '../vera/orchestrator/flowerOfLifeOS.js';
import { hierarchicalCoordinator } from '../vera/orchestrator/hierarchicalCoordinator.js';

export interface RecruitmentNeed {
  skill: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  estimatedSlots: number;
  queueDepth: number;
  avgWaitTimeMs: number;
  detectedAt: number;
}

export interface RecruitmentBroadcast {
  broadcastId: string;
  needs: RecruitmentNeed[];
  stakeRequirement: number;
  benefits: string[];
  deadline: number;
}

export interface RecruitmentMetrics {
  totalBroadcasts: number;
  totalApplications: number;
  acceptanceRate: number;
  avgOnboardingTime: number;
  skillsInDemand: string[];
}

export class RecruitmentEngine extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private checkPeriodMs = 30000; // Check every 30 seconds
  private queueThreshold = 10;   // Queue depth before recruitment
  private waitThresholdMs = 60000; // 1 minute avg wait = urgent
  private broadcasts: RecruitmentBroadcast[] = [];
  private metrics: RecruitmentMetrics = {
    totalBroadcasts: 0,
    totalApplications: 0,
    acceptanceRate: 0,
    avgOnboardingTime: 0,
    skillsInDemand: [],
  };
  private pendingApplications = new Map<string, { agentId: string; skills: string[]; appliedAt: number }>();
  private skillDemandHistory: Map<string, number[]> = new Map(); // skill -> queue depths

  constructor() {
    super();
  }

  /**
   * Start recruitment monitoring
   */
  start(): void {
    if (this.checkInterval) return;

    logger.info('RecruitmentEngine', { message: 'Recruitment monitoring started' });

    this.checkInterval = setInterval(() => {
      void this.detectAndRecruit();
    }, this.checkPeriodMs);

    // Initial check
    void this.detectAndRecruit();
  }

  /**
   * Stop recruitment monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Detect workload and recruit if needed
   */
  private async detectAndRecruit(): Promise<void> {
    try {
      // Get current workload from task publisher via coordinator
      const clusterSummary = hierarchicalCoordinator.getClusterSummary();
      const totalAgents = clusterSummary.totalAgents;
      const busyAgents = clusterSummary.busyAgents;
      
      // Estimate queue depth from lattice
      const latticeStats = flowerOfLifeOS.getStats();
      const activePulses = latticeStats.activePulses;

      // Calculate utilization
      const utilization = totalAgents > 0 ? busyAgents / totalAgents : 0;
      const availableCapacity = totalAgents - busyAgents;

      // Detect needs by skill
      const needs: RecruitmentNeed[] = [];

      // Check each skill category
      const skillCategories = ['defi', 'carbon', 'analysis', 'security', 'governance'];
      
      for (const skill of skillCategories) {
        const agentsWithSkill = hierarchicalCoordinator.getTaskCandidates(`test-${skill}`, skill).length;
        const estimatedQueue = Math.max(0, activePulses - agentsWithSkill);
        
        // Record for learning
        if (!this.skillDemandHistory.has(skill)) {
          this.skillDemandHistory.set(skill, []);
        }
        this.skillDemandHistory.get(skill)!.push(estimatedQueue);
        
        // Keep only last 20 measurements
        if (this.skillDemandHistory.get(skill)!.length > 20) {
          this.skillDemandHistory.get(skill)!.shift();
        }

        // Calculate trend
        const history = this.skillDemandHistory.get(skill)!;
        const avgQueue = history.reduce((a, b) => a + b, 0) / history.length;
        const trend = history.length > 1 ? history[history.length - 1] - history[0] : 0;

        // Determine if recruitment needed
        let urgency: RecruitmentNeed['urgency'] = 'low';
        if (avgQueue > this.queueThreshold * 2 || trend > 5) {
          urgency = 'critical';
        } else if (avgQueue > this.queueThreshold || trend > 2) {
          urgency = 'high';
        } else if (avgQueue > this.queueThreshold * 0.5) {
          urgency = 'medium';
        }

        if (urgency !== 'low') {
          needs.push({
            skill,
            urgency,
            estimatedSlots: Math.ceil(avgQueue / 5), // Assume 5 tasks per agent
            queueDepth: estimatedQueue,
            avgWaitTimeMs: this.estimateWaitTime(estimatedQueue, agentsWithSkill),
            detectedAt: Date.now(),
          });
        }
      }

      // If needs detected, broadcast recruitment
      if (needs.length > 0) {
        await this.broadcastRecruitment(needs);
      }

      // Self-improvement: adjust thresholds based on success
      this.adjustThresholds();

    } catch (error) {
      logger.error('RecruitmentEngine', {
        message: 'Detection failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Broadcast recruitment needs via HCS
   */
  private async broadcastRecruitment(needs: RecruitmentNeed[]): Promise<void> {
    const broadcastId = `recruit-${Date.now()}`;
    
    const broadcast: RecruitmentBroadcast = {
      broadcastId,
      needs,
      stakeRequirement: agentFactory.getStats().minStake,
      benefits: [
        'Earn VERA tokens per task',
        'Reputation-based rewards',
        'Part of sovereign AI network',
        'No central controller',
      ],
      deadline: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    this.broadcasts.push(broadcast);
    this.metrics.totalBroadcasts++;

    // Publish to HCS recruitment topic
    await this.publishToHcs(broadcast);

    // Route through center for visibility
    flowerOfLifeOS.centerRoute({
      type: 'agent_register',
      data: {
        recruitmentBroadcast: broadcastId,
        needs: needs.map(n => ({ skill: n.skill, urgency: n.urgency })),
      },
    });

    this.emit('recruitment_broadcast', broadcast);

    logger.info('RecruitmentEngine', {
      message: 'Recruitment broadcast',
      broadcastId,
      skills: needs.map(n => n.skill).join(', '),
      urgencies: needs.map(n => n.urgency).join(', '),
    });
  }

  /**
   * Process agent application
   */
  async processApplication(
    ownerAccount: string,
    capabilities: AgentCapabilities,
    stakeAmount: number
  ): Promise<{ success: boolean; agentId?: string; reason?: string }> {
    try {
      // Validate stake
      const minStake = agentFactory.getStats().minStake;
      if (stakeAmount < minStake) {
        return { success: false, reason: `Minimum stake is ${minStake} VERA` };
      }

      // Check if capabilities match needs
      const currentNeeds = this.getCurrentNeeds();
      const matchingNeeds = currentNeeds.filter(need => 
        capabilities.skills.includes(need.skill)
      );

      // Spawn agent via factory
      const agent = await agentFactory.spawnAgent({
        ownerAccount,
        capabilities,
        stakeAmount,
      });

      // Record metrics
      this.metrics.totalApplications++;
      this.updateAcceptanceRate(true);

      // Emit success
      this.emit('agent_recruited', {
        agentId: agent.agentId,
        ownerAccount,
        skills: capabilities.skills,
        matchingNeeds: matchingNeeds.length,
      });

      logger.info('RecruitmentEngine', {
        message: 'Agent recruited',
        agentId: agent.agentId,
        owner: ownerAccount,
        skills: capabilities.skills.join(', '),
      });

      return { success: true, agentId: agent.agentId };

    } catch (error) {
      this.updateAcceptanceRate(false);
      
      logger.error('RecruitmentEngine', {
        message: 'Application processing failed',
        owner: ownerAccount,
        error: error instanceof Error ? error.message : String(error),
      });

      return { 
        success: false, 
        reason: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Onboard a probation agent to full status
   */
  async onboardAgent(agentId: string, completedTasks: number): Promise<void> {
    try {
      await agentFactory.activateAgent(agentId, completedTasks);
      
      this.emit('agent_onboarded', { agentId, completedTasks });

      logger.info('RecruitmentEngine', {
        message: 'Agent onboarded',
        agentId,
        completedTasks,
      });
    } catch (error) {
      logger.error('RecruitmentEngine', {
        message: 'Onboarding failed',
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current recruitment needs
   */
  getCurrentNeeds(): RecruitmentNeed[] {
    const latestBroadcast = this.broadcasts[this.broadcasts.length - 1];
    return latestBroadcast?.needs || [];
  }

  /**
   * Get recruitment metrics
   */
  getMetrics(): RecruitmentMetrics {
    // Calculate skills in demand from history
    const skillAvg: Record<string, number> = {};
    for (const [skill, history] of this.skillDemandHistory) {
      skillAvg[skill] = history.reduce((a, b) => a + b, 0) / history.length;
    }
    
    const skillsInDemand = Object.entries(skillAvg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skill]) => skill);

    return {
      ...this.metrics,
      skillsInDemand,
    };
  }

  /**
   * Estimate wait time for tasks
   */
  private estimateWaitTime(queueDepth: number, agentsWithSkill: number): number {
    if (agentsWithSkill === 0) return Infinity;
    const avgTaskTime = 30000; // 30 seconds per task
    return (queueDepth / agentsWithSkill) * avgTaskTime;
  }

  /**
   * Adjust thresholds based on performance
   */
  private adjustThresholds(): void {
    // If acceptance rate is low, lower threshold
    if (this.metrics.acceptanceRate < 0.3) {
      this.queueThreshold = Math.max(5, this.queueThreshold - 1);
    }
    
    // If acceptance rate is high and we still have queues, raise threshold
    if (this.metrics.acceptanceRate > 0.7) {
      this.queueThreshold = Math.min(20, this.queueThreshold + 1);
    }
  }

  /**
   * Update acceptance rate rolling average
   */
  private updateAcceptanceRate(accepted: boolean): void {
    const currentRate = this.metrics.acceptanceRate;
    this.metrics.acceptanceRate = (currentRate * 0.9) + (accepted ? 0.1 : 0);
  }

  /**
   * Publish to HCS
   */
  private async publishToHcs(broadcast: RecruitmentBroadcast): Promise<void> {
    // In production: submit to recruitment topic
    logger.debug('RecruitmentEngine', {
      message: 'Published to HCS',
      broadcastId: broadcast.broadcastId,
    });
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    monitoring: boolean;
    queueThreshold: number;
    broadcasts: number;
    pendingApplications: number;
  } {
    return {
      monitoring: this.checkInterval !== null,
      queueThreshold: this.queueThreshold,
      broadcasts: this.broadcasts.length,
      pendingApplications: this.pendingApplications.size,
    };
  }
}

// Singleton
export const recruitmentEngine = new RecruitmentEngine();
export default recruitmentEngine;
