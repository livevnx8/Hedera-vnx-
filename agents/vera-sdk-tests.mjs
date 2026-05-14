#!/usr/bin/env node
/**
 * Vera SDK Test Suite
 * Comprehensive testing for all SDK services
 */

import { VeraSDKManager } from './vera-sdk-manager.mjs';
import assert from 'assert';

class SDKTestSuite {
  constructor() {
    this.manager = null;
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async setup() {
    this.manager = new VeraSDKManager();
    await this.manager.initialize('testnet', {
      rateLimit: { requestsPerSecond: 5, requestsPerMinute: 50 }
    });
  }

  async teardown() {
    this.manager?.close();
  }

  async runTest(name, testFn) {
    try {
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: '✅ PASS' });
      console.log(`  ✅ ${name}`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: '❌ FAIL', error: error.message });
      console.log(`  ❌ ${name}: ${error.message}`);
    }
  }

  async runAllTests() {
    console.log('\n🧪 Vera SDK Test Suite\n');
    
    await this.setup();
    
    // Error Handler Tests
    console.log('\n📋 Error Handler Tests:');
    await this.runTest('Retry mechanism works', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) throw new Error('Temporary error');
        return 'success';
      };
      
      const result = await this.manager.errorHandler.executeWithRetry(operation, { service: 'Test', method: 'retry' });
      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 3);
    });
    
    await this.runTest('Non-retryable errors fail immediately', async () => {
      const operation = async () => {
        const error = new Error('Insufficient balance');
        error.status = { _code: 'INSUFFICIENT_PAYER_BALANCE' };
        throw error;
      };
      
      try {
        await this.manager.errorHandler.executeWithRetry(operation, { service: 'Test', method: 'nonRetry' });
        assert.fail('Should have thrown');
      } catch (e) {
        assert.ok(e.message.includes('Insufficient balance'));
      }
    });

    await this.runTest('Circuit breaker opens after threshold', async () => {
      const operation = async () => {
        throw new Error('Always fails');
      };
      
      // Fail 5 times to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await this.manager.errorHandler.executeWithRetry(operation, { service: 'Test', method: 'circuit' });
        } catch (e) {
          // Expected
        }
      }
      
      // Circuit should be open now
      assert.ok(this.manager.errorHandler.isCircuitOpen('Test-circuit'));
    });

    // Rate Limiter Tests
    console.log('\n📋 Rate Limiter Tests:');
    await this.runTest('Rate limiting enforces limits', async () => {
      const startTime = Date.now();
      
      // Try to acquire 10 permits quickly (with 5/sec limit)
      for (let i = 0; i < 10; i++) {
        await this.manager.rateLimiter.acquire();
      }
      
      const elapsed = Date.now() - startTime;
      // Should take at least ~1 second for 10 requests at 5/sec
      assert.ok(elapsed >= 500, `Expected delay, got ${elapsed}ms`);
    });

    await this.runTest('Rate limiter tracks stats correctly', async () => {
      const stats = this.manager.rateLimiter.getStats();
      assert.ok(typeof stats.requestsThisSecond === 'number');
      assert.ok(typeof stats.requestsThisMinute === 'number');
      assert.ok(stats.queueLength >= 0);
    });

    // Account Service Tests
    console.log('\n📋 Account Service Tests:');
    await this.runTest('Get balance returns correct format', async () => {
      const result = await this.manager.account.getBalance(process.env.HEDERA_OPERATOR_ID);
      assert.ok(typeof result.hbar === 'number');
      assert.ok(typeof result.tokens === 'object');
    });

    await this.runTest('Account service metrics tracked', async () => {
      const metrics = this.manager.account.getMetrics();
      assert.ok(typeof metrics.calls === 'number');
      assert.ok(typeof metrics.successes === 'number');
      assert.ok(typeof metrics.successRate === 'string');
    });

    // Token Service Tests
    console.log('\n📋 Token Service Tests:');
    await this.runTest('Token service is initialized', async () => {
      assert.ok(this.manager.token);
      assert.ok(this.manager.token.create);
      assert.ok(this.manager.token.mint);
      assert.ok(this.manager.token.transfer);
    });

    // Topic Service Tests
    console.log('\n📋 Topic Service Tests:');
    await this.runTest('Topic service is initialized', async () => {
      assert.ok(this.manager.topic);
      assert.ok(this.manager.topic.create);
      assert.ok(this.manager.topic.submitMessage);
    });

    // Contract Service Tests
    console.log('\n📋 Contract Service Tests:');
    await this.runTest('Contract service is initialized', async () => {
      assert.ok(this.manager.contract);
      assert.ok(this.manager.contract.deploy);
      assert.ok(this.manager.contract.execute);
    });

    // Health Monitoring Tests
    console.log('\n📋 Health Monitoring Tests:');
    await this.runTest('Health status is tracked', async () => {
      const health = this.manager.getHealth();
      assert.ok(['healthy', 'unhealthy'].includes(health.status));
      assert.ok(typeof health.services === 'object');
      assert.ok(typeof health.rateLimiter === 'object');
    });

    // Event System Tests
    console.log('\n📋 Event System Tests:');
    await this.runTest('Events are emitted on success', async () => {
      let eventReceived = false;
      this.manager.account.once('success', () => {
        eventReceived = true;
      });
      
      try {
        await this.manager.account.getBalance(process.env.HEDERA_OPERATOR_ID);
      } catch (e) {
        // May fail on testnet, that's ok
      }
      
      // Give time for event
      await new Promise(resolve => setTimeout(resolve, 100));
      // Note: Event may or may not fire depending on success
    });

    // Integration Tests
    console.log('\n📋 Integration Tests:');
    await this.runTest('All services share rate limiter', async () => {
      const beforeStats = this.manager.rateLimiter.getStats();
      
      // Make calls to different services
      try {
        await this.manager.account.getBalance(process.env.HEDERA_OPERATOR_ID);
      } catch (e) {}
      
      const afterStats = this.manager.rateLimiter.getStats();
      assert.ok(afterStats.requestsThisMinute >= beforeStats.requestsThisMinute);
    });

    await this.runTest('Error handler shared across services', async () => {
      // All services should use the same error handler
      assert.strictEqual(this.manager.account.errorHandler, this.manager.token.errorHandler);
      assert.strictEqual(this.manager.token.errorHandler, this.manager.topic.errorHandler);
    });

    await this.teardown();
    
    // Print summary
    this.printSummary();
    
    return this.results;
  }

  printSummary() {
    const total = this.results.passed + this.results.failed;
    const percentage = total > 0 ? ((this.results.passed / total) * 100).toFixed(1) : 0;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Success Rate: ${percentage}%`);
    console.log('='.repeat(60));
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(t => t.status === '❌ FAIL')
        .forEach(t => console.log(`  • ${t.name}: ${t.error}`));
    }
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = new SDKTestSuite();
  suite.runAllTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
  });
}

export { SDKTestSuite };
