/**
 * Carbon Validation Workflow
 * 
 * Multi-party validation for carbon data with Hedera anchoring.
 * Implements Guardian-style trust model with verifiable credentials.
 */

import { logger } from '../monitoring/logger.js';
import type { ValidationWorkflow, EnergyReading, CarbonEmission, CarbonOffset } from './types.js';

interface WorkflowConfig {
  requiredValidators: number;
  validationTimeoutHours: number;
  hederaTopicId?: string;
  autoAnchor: boolean;
}

export class CarbonValidationWorkflow {
  private config: WorkflowConfig;
  private workflows: Map<string, ValidationWorkflow> = new Map();
  private validators: Set<string> = new Set();
  private completedWorkflows: ValidationWorkflow[] = [];

  constructor(config: Partial<WorkflowConfig> = {}) {
    this.config = {
      requiredValidators: 2,
      validationTimeoutHours: 24,
      autoAnchor: true,
      ...config
    };
  }

  /**
   * Register a validator (DID or account)
   */
  registerValidator(validatorId: string): void {
    this.validators.add(validatorId);
    logger.info('CarbonValidationWorkflow', {
      message: 'Validator registered',
      validatorId,
      totalValidators: this.validators.size
    });
  }

  /**
   * Create validation workflow for energy reading
   */
  async createReadingWorkflow(reading: EnergyReading): Promise<ValidationWorkflow> {
    const workflowId = `wf-reading-${reading.readingId}`;
    
    const workflow: ValidationWorkflow = {
      workflowId,
      type: 'meter_reading',
      status: 'pending',
      data: reading,
      validators: [],
      signatures: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.workflows.set(workflowId, workflow);

    logger.info('CarbonValidationWorkflow', {
      message: 'Reading validation workflow created',
      workflowId,
      readingId: reading.readingId,
      sourceId: reading.sourceId
    });

    // Auto-anchor to Hedera if configured
    if (this.config.autoAnchor && this.config.hederaTopicId) {
      await this.anchorToHedera(workflow);
    }

    return workflow;
  }

  /**
   * Create validation workflow for emission calculation
   */
  async createEmissionWorkflow(emission: CarbonEmission): Promise<ValidationWorkflow> {
    const workflowId = `wf-emission-${emission.emissionId}`;
    
    const workflow: ValidationWorkflow = {
      workflowId,
      type: 'emission_calculation',
      status: 'pending',
      data: emission,
      validators: [],
      signatures: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.workflows.set(workflowId, workflow);

    logger.info('CarbonValidationWorkflow', {
      message: 'Emission validation workflow created',
      workflowId,
      emissionId: emission.emissionId,
      carbonKg: emission.carbonEmitted
    });

    if (this.config.autoAnchor && this.config.hederaTopicId) {
      await this.anchorToHedera(workflow);
    }

    return workflow;
  }

  /**
   * Create validation workflow for offset retirement
   */
  async createOffsetWorkflow(offset: CarbonOffset, retirementTx: string): Promise<ValidationWorkflow> {
    const workflowId = `wf-offset-${offset.offsetId}`;
    
    const workflow: ValidationWorkflow = {
      workflowId,
      type: 'offset_retirement',
      status: 'pending',
      data: { offset, retirementTx },
      validators: [],
      signatures: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.workflows.set(workflowId, workflow);

    logger.info('CarbonValidationWorkflow', {
      message: 'Offset validation workflow created',
      workflowId,
      offsetId: offset.offsetId,
      tonnesRetired: offset.tonnesCO2
    });

    if (this.config.autoAnchor && this.config.hederaTopicId) {
      await this.anchorToHedera(workflow);
    }

    return workflow;
  }

  /**
   * Submit validator signature
   */
  async submitValidation(
    workflowId: string,
    validatorId: string,
    signature: string,
    approved: boolean
  ): Promise<ValidationWorkflow> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Check validator is registered
    if (!this.validators.has(validatorId)) {
      throw new Error('Validator not registered');
    }

    // Check not already validated by this validator
    if (workflow.validators.includes(validatorId)) {
      throw new Error('Validator already submitted');
    }

    // Add signature
    workflow.signatures.push({
      validator: validatorId,
      signature,
      timestamp: Date.now()
    });

    workflow.validators.push(validatorId);
    workflow.updatedAt = Date.now();

    logger.info('CarbonValidationWorkflow', {
      message: 'Validation submitted',
      workflowId,
      validatorId,
      signatureCount: workflow.signatures.length,
      required: this.config.requiredValidators
    });

    // Check if enough validations
    if (workflow.signatures.length >= this.config.requiredValidators) {
      await this.finalizeWorkflow(workflow, approved);
    }

    return workflow;
  }

  /**
   * Get workflow status
   */
  getWorkflow(workflowId: string): ValidationWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * List pending workflows
   */
  getPendingWorkflows(): ValidationWorkflow[] {
    return Array.from(this.workflows.values())
      .filter(w => w.status === 'pending' || w.status === 'in_progress');
  }

  /**
   * List completed workflows
   */
  getCompletedWorkflows(limit: number = 100): ValidationWorkflow[] {
    return this.completedWorkflows.slice(-limit);
  }

  /**
   * Get validation statistics
   */
  getStats() {
    const all = Array.from(this.workflows.values());
    const pending = all.filter(w => w.status === 'pending' || w.status === 'in_progress');
    const validated = all.filter(w => w.status === 'validated');
    const rejected = all.filter(w => w.status === 'rejected');

    const byType = {
      meter_reading: all.filter(w => w.type === 'meter_reading').length,
      emission_calculation: all.filter(w => w.type === 'emission_calculation').length,
      offset_retirement: all.filter(w => w.type === 'offset_retirement').length
    };

    return {
      timestamp: Date.now(),
      totalWorkflows: all.length,
      pending: pending.length,
      validated: validated.length,
      rejected: rejected.length,
      byType,
      registeredValidators: this.validators.size,
      requiredValidators: this.config.requiredValidators,
      hederaAnchored: all.filter(w => w.hederaAnchor).length,
      averageValidationTime: this.calculateAverageValidationTime(validated)
    };
  }

  // Private methods
  private async finalizeWorkflow(workflow: ValidationWorkflow, approved: boolean): Promise<void> {
    workflow.status = approved ? 'validated' : 'rejected';
    workflow.updatedAt = Date.now();

    // Update the underlying data
    if (approved && workflow.type === 'meter_reading') {
      const reading = workflow.data as EnergyReading;
      reading.validated = true;
      reading.validator = workflow.validators.join(',');
    }

    // Move to completed
    this.completedWorkflows.push(workflow);

    // Anchor final result
    if (this.config.hederaTopicId) {
      await this.anchorToHedera(workflow);
    }

    logger.info('CarbonValidationWorkflow', {
      message: 'Workflow finalized',
      workflowId: workflow.workflowId,
      status: workflow.status,
      validators: workflow.validators.length
    });
  }

  private async anchorToHedera(workflow: ValidationWorkflow): Promise<void> {
    // Mock HCS anchoring - would submit to Hedera Consensus Service in production
    workflow.hederaAnchor = `hcs-${this.config.hederaTopicId}-${Date.now()}`;
    
    logger.debug('CarbonValidationWorkflow', {
      message: 'Anchored to Hedera',
      workflowId: workflow.workflowId,
      anchor: workflow.hederaAnchor
    });
  }

  private calculateAverageValidationTime(validated: ValidationWorkflow[]): number {
    if (validated.length === 0) return 0;
    
    const times = validated.map(w => w.updatedAt - w.createdAt);
    return times.reduce((sum, t) => sum + t, 0) / times.length;
  }
}

// Singleton
let validationWorkflowInstance: CarbonValidationWorkflow | null = null;

export function getCarbonValidationWorkflow(config?: Partial<WorkflowConfig>): CarbonValidationWorkflow {
  if (!validationWorkflowInstance) {
    validationWorkflowInstance = new CarbonValidationWorkflow(config);
  }
  return validationWorkflowInstance;
}
