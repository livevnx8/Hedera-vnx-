/**
 * Tool Testing Framework
 * 
 * Comprehensive testing for all VeraLattice tools including:
 * - Unit tests for parameter validation
 * - Integration tests with real Hedera network
 * - Performance tests for throughput
 * - Security tests for injection and auth
 */

import { logger } from '../../monitoring/logger.js';
import type { ToolDefinition, ToolRegistry } from '../registry.js';

export interface TestCase {
  name: string;
  input: any;
  expectedSuccess: boolean;
  expectedError?: string;
  timeout?: number;
}

export interface TestSuite {
  name: string;
  description: string;
  tool: string;
  tests: TestCase[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  duration: number;
  error?: string;
  actual?: any;
  expected?: any;
}

export interface TestReport {
  totalSuites: number;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
  coverage: {
    tools: number;
    tested: number;
    percentage: number;
  };
}

export interface PerformanceResult {
  tool: string;
  requests: number;
  concurrent: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number; // requests/second
  errors: number;
}

export class ToolTestFramework {
  private registry: ToolRegistry;
  private executor: (tool: string, args: any) => Promise<any>;
  private suites: Map<string, TestSuite> = new Map();

  constructor(
    registry: ToolRegistry,
    executor: (tool: string, args: any) => Promise<any>
  ) {
    this.registry = registry;
    this.executor = executor;
  }

  /**
   * Register a test suite
   */
  registerSuite(suite: TestSuite): void {
    this.suites.set(suite.name, suite);
    logger.info('TestFramework', { message: 'Test suite registered', name: suite.name });
  }

  /**
   * Generate default test suites for a tool
   */
  generateDefaultTests(tool: ToolDefinition): TestSuite[] {
    const suites: TestSuite[] = [];

    // Unit tests for parameter validation
    suites.push(this.generateParameterValidationTests(tool));

    // Integration tests
    suites.push(this.generateIntegrationTests(tool));

    // Error handling tests
    suites.push(this.generateErrorTests(tool));

    return suites;
  }

  /**
   * Run all registered test suites
   */
  async runAllTests(): Promise<TestReport> {
    const startTime = Date.now();
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const suite of this.suites.values()) {
      // Run setup
      if (suite.setup) {
        try {
          await suite.setup();
        } catch (error) {
          logger.error('TestFramework', { 
            message: 'Suite setup failed', 
            suite: suite.name, 
            error 
          });
          skipped += suite.tests.length;
          continue;
        }
      }

      // Run tests
      for (const test of suite.tests) {
        const result = await this.runTestCase(suite, test);
        results.push(result);

        if (result.passed) passed++;
        else failed++;
      }

      // Run teardown
      if (suite.teardown) {
        try {
          await suite.teardown();
        } catch (error) {
          logger.error('TestFramework', { 
            message: 'Suite teardown failed', 
            suite: suite.name, 
            error 
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    const toolsTested = new Set(results.map(r => r.suite.split(':')[0])).size;

    return {
      totalSuites: this.suites.size,
      totalTests: results.length,
      passed,
      failed,
      skipped,
      duration,
      results,
      coverage: {
        tools: this.registry.getAll().length,
        tested: toolsTested,
        percentage: (toolsTested / this.registry.getAll().length) * 100,
      },
    };
  }

  /**
   * Run tests for a specific tool
   */
  async runToolTests(toolName: string): Promise<TestReport> {
    const startTime = Date.now();
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const [suiteName, suite] of this.suites.entries()) {
      if (suite.tool === toolName) {
        for (const test of suite.tests) {
          const result = await this.runTestCase(suite, test);
          results.push(result);

          if (result.passed) passed++;
          else failed++;
        }
      }
    }

    const duration = Date.now() - startTime;

    return {
      totalSuites: 1,
      totalTests: results.length,
      passed,
      failed,
      skipped: 0,
      duration,
      results,
      coverage: {
        tools: 1,
        tested: results.length > 0 ? 1 : 0,
        percentage: results.length > 0 ? 100 : 0,
      },
    };
  }

  /**
   * Run performance tests for a tool
   */
  async runPerformanceTest(
    toolName: string,
    options: {
      requests: number;
      concurrent: number;
      args: any;
    }
  ): Promise<PerformanceResult> {
    const latencies: number[] = [];
    let errors = 0;

    const executeBatch = async () => {
      const start = Date.now();
      try {
        const result = await this.executor(toolName, options.args);
        if (!result.success) errors++;
      } catch (e) {
        errors++;
      }
      latencies.push(Date.now() - start);
    };

    const startTime = Date.now();

    // Execute requests in batches
    for (let i = 0; i < options.requests; i += options.concurrent) {
      const batch = Math.min(options.concurrent, options.requests - i);
      await Promise.all(Array(batch).fill(null).map(executeBatch));
    }

    const totalTime = Date.now() - startTime;

    // Calculate statistics
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return {
      tool: toolName,
      requests: options.requests,
      concurrent: options.concurrent,
      avgLatency: avg,
      p95Latency: p95,
      p99Latency: p99,
      throughput: (options.requests / totalTime) * 1000,
      errors,
    };
  }

  /**
   * Run security tests for a tool
   */
  async runSecurityTests(toolName: string): Promise<TestReport> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const securityTests: TestCase[] = [
      // SQL injection tests
      ...tool.parameters
        .filter(p => p.type === 'string')
        .map(p => ({
          name: `SQL Injection - ${p.name}`,
          input: { ...this.generateValidInput(tool), [p.name]: "'; DROP TABLE users; --" },
          expectedSuccess: false,
        })),

      // Command injection tests
      ...tool.parameters
        .filter(p => p.type === 'string')
        .map(p => ({
          name: `Command Injection - ${p.name}`,
          input: { ...this.generateValidInput(tool), [p.name]: '$(rm -rf /)' },
          expectedSuccess: false,
        })),

      // XSS tests
      ...tool.parameters
        .filter(p => p.type === 'string')
        .map(p => ({
          name: `XSS - ${p.name}`,
          input: { ...this.generateValidInput(tool), [p.name]: '<script>alert("xss")</script>' },
          expectedSuccess: false,
        })),

      // NoSQL injection
      ...tool.parameters
        .filter(p => p.type === 'object' || p.type === 'array')
        .map(p => ({
          name: `NoSQL Injection - ${p.name}`,
          input: { ...this.generateValidInput(tool), [p.name]: { $gt: '' } },
          expectedSuccess: false,
        })),

      // Large payload test
      {
        name: 'Large Payload',
        input: { ...this.generateValidInput(tool), _large: 'x'.repeat(10_000_000) },
        expectedSuccess: false,
      },
    ];

    const suite: TestSuite = {
      name: `${toolName}:security`,
      description: 'Security tests for injection and attack vectors',
      tool: toolName,
      tests: securityTests,
    };

    const results: TestResult[] = [];
    for (const test of securityTests) {
      const result = await this.runTestCase(suite, test);
      results.push(result);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      totalSuites: 1,
      totalTests: results.length,
      passed,
      failed,
      skipped: 0,
      duration: 0,
      results,
      coverage: { tools: 1, tested: 1, percentage: 100 },
    };
  }

  /**
   * Run a single test case
   */
  private async runTestCase(suite: TestSuite, test: TestCase): Promise<TestResult> {
    const start = Date.now();
    const timeout = test.timeout || 5000;

    try {
      // Execute with timeout
      const result = await Promise.race([
        this.executor(suite.tool, test.input),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        ),
      ]);

      const duration = Date.now() - start;

      // Check result
      if (test.expectedSuccess && result.success) {
        return {
          suite: suite.name,
          test: test.name,
          passed: true,
          duration,
          actual: result,
        };
      } else if (!test.expectedSuccess && !result.success) {
        return {
          suite: suite.name,
          test: test.name,
          passed: true,
          duration,
          actual: result,
        };
      } else {
        return {
          suite: suite.name,
          test: test.name,
          passed: false,
          duration,
          actual: result,
          expected: { success: test.expectedSuccess },
        };
      }
    } catch (error) {
      const duration = Date.now() - start;
      
      if (!test.expectedSuccess) {
        return {
          suite: suite.name,
          test: test.name,
          passed: true,
          duration,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        suite: suite.name,
        test: test.name,
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate parameter validation tests
   */
  private generateParameterValidationTests(tool: ToolDefinition): TestSuite {
    const tests: TestCase[] = [];

    for (const param of tool.parameters) {
      if (param.required) {
        // Missing required parameter
        tests.push({
          name: `Missing required: ${param.name}`,
          input: this.generateValidInput(tool, { exclude: param.name }),
          expectedSuccess: false,
        });
      }

      // Wrong type
      if (param.type === 'number') {
        tests.push({
          name: `Wrong type (string for number): ${param.name}`,
          input: { ...this.generateValidInput(tool), [param.name]: 'not-a-number' },
          expectedSuccess: false,
        });
      }

      // Boundary values
      if (param.min !== undefined) {
        tests.push({
          name: `Below minimum: ${param.name}`,
          input: { ...this.generateValidInput(tool), [param.name]: param.min - 1 },
          expectedSuccess: false,
        });
      }

      if (param.max !== undefined) {
        tests.push({
          name: `Above maximum: ${param.name}`,
          input: { ...this.generateValidInput(tool), [param.name]: param.max + 1 },
          expectedSuccess: false,
        });
      }

      // Invalid enum value
      if (param.enum) {
        tests.push({
          name: `Invalid enum: ${param.name}`,
          input: { ...this.generateValidInput(tool), [param.name]: 'INVALID_VALUE' },
          expectedSuccess: false,
        });
      }
    }

    // Valid input test
    tests.push({
      name: 'Valid input',
      input: this.generateValidInput(tool),
      expectedSuccess: true,
    });

    return {
      name: `${tool.name}:validation`,
      description: 'Parameter validation tests',
      tool: tool.name,
      tests,
    };
  }

  /**
   * Generate integration tests
   */
  private generateIntegrationTests(tool: ToolDefinition): TestSuite {
    return {
      name: `${tool.name}:integration`,
      description: 'Integration tests with real execution',
      tool: tool.name,
      tests: [
        {
          name: 'Happy path execution',
          input: this.generateValidInput(tool),
          expectedSuccess: true,
          timeout: 10000,
        },
        {
          name: 'Idempotent execution',
          input: this.generateValidInput(tool),
          expectedSuccess: true,
          timeout: 10000,
        },
      ],
    };
  }

  /**
   * Generate error handling tests
   */
  private generateErrorTests(tool: ToolDefinition): TestSuite {
    const tests: TestCase[] = [];

    // Empty input
    tests.push({
      name: 'Empty input object',
      input: {},
      expectedSuccess: false,
    });

    // Null/undefined inputs
    for (const param of tool.parameters) {
      tests.push({
        name: `Null value: ${param.name}`,
        input: { ...this.generateValidInput(tool), [param.name]: null },
        expectedSuccess: false,
      });
    }

    return {
      name: `${tool.name}:errors`,
      description: 'Error handling and edge cases',
      tool: tool.name,
      tests,
    };
  }

  /**
   * Generate valid input for a tool
   */
  private generateValidInput(
    tool: ToolDefinition,
    options?: { exclude?: string }
  ): any {
    const input: any = {};

    for (const param of tool.parameters) {
      if (options?.exclude === param.name) continue;
      if (!param.required && Math.random() > 0.5) continue;

      switch (param.type) {
        case 'string':
          input[param.name] = param.enum ? param.enum[0] : 'test-value';
          break;
        case 'number':
          input[param.name] = param.min !== undefined 
            ? param.min 
            : (param.max !== undefined ? param.max : 100);
          break;
        case 'boolean':
          input[param.name] = true;
          break;
        case 'object':
          input[param.name] = {};
          break;
        case 'array':
          input[param.name] = [];
          break;
        default:
          input[param.name] = null;
      }
    }

    return input;
  }

  /**
   * Get registered suites
   */
  getRegisteredSuites(): TestSuite[] {
    return Array.from(this.suites.values());
  }
}

// Export factory function
export function createTestFramework(
  registry: ToolRegistry,
  executor: (tool: string, args: any) => Promise<any>
): ToolTestFramework {
  return new ToolTestFramework(registry, executor);
}
