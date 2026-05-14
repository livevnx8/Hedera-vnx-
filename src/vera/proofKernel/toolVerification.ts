/**
 * Tool-Call Verification Layer
 * 
 * Validates tool calls before execution:
 * - JSON schema validity
 * - Parameter bounds checking
 * - HCS pre-execution proof
 */

import { config } from '../../config.js';
import type { VerifiableAITask } from './types.js';

export interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

export interface ToolVerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hcsReceiptHash?: string;
  estimatedHbarCost?: number;
}

// Tool schemas for validation
const TOOL_SCHEMAS: Record<string, {
  required: string[];
  optional: string[];
  parameterTypes: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
  bounds?: Record<string, { min?: number; max?: number; pattern?: string }>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hbarEstimate: number;
}> = {
  'hedera_transfer_hbar': {
    required: ['recipient', 'amount'],
    optional: ['memo'],
    parameterTypes: { recipient: 'string', amount: 'number', memo: 'string' },
    bounds: {
      amount: { min: 0, max: 1000000 }, // Max 1M HBAR per transaction
      memo: { pattern: '^[a-zA-Z0-9 ]{0,100}$' },
    },
    riskLevel: 'high',
    hbarEstimate: 0.001, // ~$0.0001
  },
  'hedera_create_topic': {
    required: ['memo'],
    optional: ['submitKey', 'adminKey'],
    parameterTypes: { memo: 'string', submitKey: 'string', adminKey: 'string' },
    bounds: {
      memo: { pattern: '^.{1,100}$' },
    },
    riskLevel: 'medium',
    hbarEstimate: 0.01,
  },
  'hedera_submit_message': {
    required: ['topicId', 'message'],
    optional: [],
    parameterTypes: { topicId: 'string', message: 'string' },
    bounds: {
      message: { max: 1024 }, // Max 1KB per message
    },
    riskLevel: 'medium',
    hbarEstimate: 0.0001,
  },
  'vera_memory_recall': {
    required: ['query'],
    optional: ['limit', 'filters'],
    parameterTypes: { query: 'string', limit: 'number', filters: 'object' },
    bounds: {
      limit: { min: 1, max: 100 },
    },
    riskLevel: 'low',
    hbarEstimate: 0,
  },
  'vera_memory_store': {
    required: ['key', 'value'],
    optional: ['ttl'],
    parameterTypes: { key: 'string', value: 'string', ttl: 'number' },
    bounds: {
      key: { pattern: '^[a-zA-Z0-9_-]{1,256}$' },
      ttl: { min: 60, max: 86400 * 30 }, // 1 min to 30 days
    },
    riskLevel: 'low',
    hbarEstimate: 0,
  },
};

export function validateToolCall(
  toolCall: ToolCall,
  taskContext?: VerifiableAITask
): ToolVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const schema = TOOL_SCHEMAS[toolCall.tool];
  if (!schema) {
    errors.push(`Unknown tool: ${toolCall.tool}`);
    return {
      valid: false,
      errors,
      warnings,
      riskLevel: 'critical',
    };
  }

  // Check required parameters
  for (const param of schema.required) {
    if (!(param in toolCall.parameters)) {
      errors.push(`Missing required parameter: ${param}`);
    }
  }

  // Validate parameter types
  for (const [param, value] of Object.entries(toolCall.parameters)) {
    const expectedType = schema.parameterTypes[param];
    if (!expectedType) {
      warnings.push(`Unknown parameter: ${param}`);
      continue;
    }
    
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
      errors.push(`Parameter ${param} should be ${expectedType}, got ${actualType}`);
    }
  }

  // Check bounds
  if (schema.bounds) {
    for (const [param, bounds] of Object.entries(schema.bounds)) {
      const value = toolCall.parameters[param];
      if (value === undefined) continue;

      if (bounds.min !== undefined && typeof value === 'number' && value < bounds.min) {
        errors.push(`${param} must be >= ${bounds.min}`);
      }
      if (bounds.max !== undefined && typeof value === 'number' && value > bounds.max) {
        errors.push(`${param} must be <= ${bounds.max}`);
      }
      if (bounds.pattern !== undefined && typeof value === 'string') {
        const regex = new RegExp(bounds.pattern);
        if (!regex.test(value)) {
          errors.push(`${param} does not match pattern: ${bounds.pattern}`);
        }
      }
      if (bounds.max !== undefined && typeof value === 'string' && value.length > bounds.max) {
        errors.push(`${param} exceeds max length of ${bounds.max} characters`);
      }
    }
  }

  // Context-aware validation
  if (taskContext) {
    // Check if tool is appropriate for service type
    if (taskContext.serviceType === 'audit' && schema.riskLevel === 'high') {
      warnings.push('High-risk operation in audit context requires additional verification');
    }
  }

  // Generate HCS receipt hash for pre-execution proof
  let hcsReceiptHash: string | undefined;
  if (config.VERA_AUDIT_TOPIC_ID && errors.length === 0) {
    const receiptPayload = {
      tool: toolCall.tool,
      parameters: Object.keys(toolCall.parameters),
      timestamp: Date.now(),
      taskId: taskContext?.taskId,
      riskLevel: schema.riskLevel,
    };
    hcsReceiptHash = generateReceiptHash(receiptPayload);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    riskLevel: schema.riskLevel,
    hcsReceiptHash,
    estimatedHbarCost: schema.hbarEstimate,
  };
}

function generateReceiptHash(payload: unknown): string {
  // Simple hash for demo - in production use crypto.subtle
  const str = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

export function parseToolCall(content: string): ToolCall | null {
  try {
    // Try to extract JSON from various formats
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Support various formats
    if (parsed.tool && parsed.parameters) {
      return { tool: parsed.tool, parameters: parsed.parameters };
    }
    if (parsed.function && parsed.args) {
      return { tool: parsed.function, parameters: parsed.args };
    }
    if (parsed.name && parsed.input) {
      return { tool: parsed.name, parameters: parsed.input };
    }
    
    return null;
  } catch {
    return null;
  }
}

export function batchValidateToolCalls(
  toolCalls: ToolCall[],
  taskContext?: VerifiableAITask
): { allValid: boolean; results: ToolVerificationResult[]; totalHbarCost: number } {
  const results = toolCalls.map(call => validateToolCall(call, taskContext));
  const allValid = results.every(r => r.valid);
  const totalHbarCost = results.reduce((sum, r) => sum + (r.estimatedHbarCost ?? 0), 0);
  
  return { allValid, results, totalHbarCost };
}

// Risk-based approval workflow
export function requiresAdditionalApproval(result: ToolVerificationResult): boolean {
  if (result.riskLevel === 'critical') return true;
  if (result.riskLevel === 'high' && result.warnings.length > 0) return true;
  if (result.errors.length > 0) return true;
  return false;
}
