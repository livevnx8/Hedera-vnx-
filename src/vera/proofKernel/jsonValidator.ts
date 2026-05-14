/**
 * JSON Validation Middleware for Meridian Tool Calls
 * 
 * Validates that generated JSON matches expected schema for tool calls
 * Prevents invalid tool calls from reaching execution
 */

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      minimum?: number;
      maximum?: number;
      pattern?: string;
    }>;
    required: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: unknown;
}

// Common Hedera tool schemas
export const HEDERA_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'hts_transfer_token',
    description: 'Transfer fungible tokens',
    parameters: {
      type: 'object',
      properties: {
        tokenId: { type: 'string', pattern: '^0\\.0\\.[0-9]+$' },
        recipientId: { type: 'string', pattern: '^0\\.0\\.[0-9]+$' },
        amount: { type: 'number', minimum: 1 },
        memo: { type: 'string' },
      },
      required: ['tokenId', 'recipientId', 'amount'],
    },
  },
  {
    name: 'hcs_submit_message',
    description: 'Submit message to HCS topic',
    parameters: {
      type: 'object',
      properties: {
        topicId: { type: 'string', pattern: '^0\\.0\\.[0-9]+$' },
        message: { type: 'string' },
        maxChunks: { type: 'number', minimum: 1, maximum: 20 },
      },
      required: ['topicId', 'message'],
    },
  },
  {
    name: 'carbon_retire_credits',
    description: 'Retire carbon credits',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        tonnes: { type: 'number', minimum: 0.001 },
        memo: { type: 'string' },
      },
      required: ['projectId', 'tonnes'],
    },
  },
];

export function validateToolCall(
  jsonString: string,
  expectedTool?: string
): ValidationResult {
  const errors: string[] = [];

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  // Must be object
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: ['Tool call must be an object'],
    };
  }

  const obj = parsed as Record<string, unknown>;

  // Check for tool name
  const toolName = obj.tool || obj.name || obj.function;
  if (!toolName || typeof toolName !== 'string') {
    errors.push('Missing or invalid tool name (expected "tool", "name", or "function" field)');
  }

  // If expected tool specified, validate it matches
  if (expectedTool && toolName !== expectedTool) {
    errors.push(`Tool mismatch: expected ${expectedTool}, got ${toolName}`);
  }

  // Find schema
  const schema = HEDERA_TOOL_SCHEMAS.find(s => s.name === toolName);
  if (!schema) {
    // Unknown tool - warn but don't block (extensibility)
    console.log(`[JSONValidator] Unknown tool: ${toolName}`);
  } else {
    // Validate parameters against schema
    const params = obj.parameters || obj.params || obj.args || obj;
    
    if (typeof params !== 'object' || params === null) {
      errors.push('Parameters must be an object');
    } else {
      const paramObj = params as Record<string, unknown>;
      
      // Check required fields
      for (const required of schema.parameters.required) {
        if (!(required in paramObj)) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }

      // Validate field types and constraints
      for (const [key, value] of Object.entries(paramObj)) {
        const propSchema = schema.parameters.properties[key];
        if (!propSchema) {
          errors.push(`Unknown parameter: ${key}`);
          continue;
        }

        // Type validation
        if (propSchema.type === 'string' && typeof value !== 'string') {
          errors.push(`${key}: expected string, got ${typeof value}`);
        }
        if (propSchema.type === 'number' && typeof value !== 'number') {
          errors.push(`${key}: expected number, got ${typeof value}`);
        }

        // Pattern validation
        if (propSchema.pattern && typeof value === 'string') {
          const regex = new RegExp(propSchema.pattern);
          if (!regex.test(value)) {
            errors.push(`${key}: invalid format (does not match ${propSchema.pattern})`);
          }
        }

        // Range validation
        if (propSchema.minimum !== undefined && typeof value === 'number' && value < propSchema.minimum) {
          errors.push(`${key}: value ${value} below minimum ${propSchema.minimum}`);
        }
        if (propSchema.maximum !== undefined && typeof value === 'number' && value > propSchema.maximum) {
          errors.push(`${key}: value ${value} above maximum ${propSchema.maximum}`);
        }

        // Enum validation
        if (propSchema.enum && !propSchema.enum.includes(String(value))) {
          errors.push(`${key}: invalid value "${value}" (must be one of: ${propSchema.enum.join(', ')})`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: obj,
  };
}

export function extractToolCalls(content: string): string[] {
  // Extract JSON objects from content
  const jsonRegex = /\{[\s\S]*?\}/g;
  const matches = content.match(jsonRegex) || [];
  
  return matches.filter(json => {
    try {
      const parsed = JSON.parse(json);
      return parsed && (parsed.tool || parsed.name || parsed.function);
    } catch {
      return false;
    }
  });
}

export function validateMeridianOutput(content: string): ValidationResult {
  const toolCalls = extractToolCalls(content);
  
  if (toolCalls.length === 0) {
    return {
      valid: true,
      errors: [],
      normalized: content,
    };
  }

  const allErrors: string[] = [];
  let allValid = true;

  for (const toolCall of toolCalls) {
    const result = validateToolCall(toolCall);
    if (!result.valid) {
      allValid = false;
      allErrors.push(...result.errors);
    }
  }

  return {
    valid: allValid,
    errors: allErrors,
    normalized: content,
  };
}

// Middleware for Express routes
export function jsonValidationMiddleware() {
  return (req: unknown, res: unknown, next: () => void) => {
    // Attach validator to request
    (req as { validateToolCall?: typeof validateToolCall }).validateToolCall = validateToolCall;
    next();
  };
}
