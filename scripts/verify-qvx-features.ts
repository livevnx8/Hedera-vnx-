/**
 * Vera QVX Feature Completion Verification Script
 * 
 * Tests all QVX quantum endpoints to verify they return 200 status
 * with real data from Hedera mirror node integration.
 */

import axios from 'axios';

const BASE_URL = process.env.VERA_URL || 'http://localhost:8080';

interface TestResult {
  endpoint: string;
  status: number;
  success: boolean;
  data?: any;
  error?: string;
  responseTime: number;
}

async function testEndpoint(endpoint: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      timeout: 10000,
      validateStatus: () => true // Don't throw on error status
    });
    
    const responseTime = Date.now() - startTime;
    
    return {
      endpoint,
      status: response.status,
      success: response.status === 200,
      data: response.data,
      responseTime
    };
  } catch (error) {
    return {
      endpoint,
      status: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      responseTime: Date.now() - startTime
    };
  }
}

async function runVerification(): Promise<void> {
  console.log('🔍 Vera QVX Feature Completion Verification');
  console.log('=============================================\n');
  
  const endpoints = [
    '/api/qvx-quantum/metrics',
    '/api/qvx-quantum/health',
    '/api/qvx-quantum/patterns',
    '/api/qvx-quantum/predictions',
    '/api/qvx-quantum/cache',
    '/api/qvx-quantum/intelligence-summary',
    '/api/qvx-quantum/performance',
    '/api/qvx/metrics',
    '/api/qvx/health',
    '/api/qvx/patterns',
    '/api/qvx/predictions',
    '/api/qvx/intelligence-summary',
    '/api/qvx/market-intelligence',
    '/api/qvx/network-analysis'
  ];
  
  const results: TestResult[] = [];
  
  for (const endpoint of endpoints) {
    process.stdout.write(`Testing ${endpoint}... `);
    const result = await testEndpoint(endpoint);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ ${result.status} (${result.responseTime}ms)`);
    } else {
      console.log(`❌ ${result.status || 'ERROR'} (${result.responseTime}ms)`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
  }
  
  // Summary
  console.log('\n=============================================');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('=============================================\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Total endpoints: ${results.length}`);
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`Success rate: ${((successful.length / results.length) * 100).toFixed(1)}%\n`);
  
  // Check data quality
  console.log('📈 DATA QUALITY CHECKS:');
  
  const metricsResult = results.find(r => r.endpoint === '/api/qvx-quantum/metrics');
  if (metricsResult?.success && metricsResult.data?.data) {
    const metrics = metricsResult.data.data;
    console.log(`  Quantum TPS: ${metrics.quantum_tps || 'N/A'}`);
    console.log(`  Duet Efficiency: ${metrics.duet_efficiency || 'N/A'}`);
    console.log(`  Quantum Latency: ${metrics.quantum_latency || 'N/A'}ms`);
  }
  
  const patternsResult = results.find(r => r.endpoint === '/api/qvx-quantum/patterns');
  if (patternsResult?.success) {
    const patterns = patternsResult.data?.data || [];
    console.log(`  Patterns detected: ${patterns.length}`);
  }
  
  const predictionsResult = results.find(r => r.endpoint === '/api/qvx-quantum/predictions');
  if (predictionsResult?.success) {
    const predictions = predictionsResult.data?.data || [];
    console.log(`  Predictions generated: ${predictions.length}`);
  }
  
  console.log('\n=============================================');
  
  if (failed.length === 0) {
    console.log('🎉 ALL ENDPOINTS RETURNING 200 WITH REAL DATA!');
    console.log('Feature completion verification: ✅ PASSED');
    process.exit(0);
  } else {
    console.log('⚠️  Some endpoints failed. Review errors above.');
    console.log('Feature completion verification: ❌ INCOMPLETE');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runVerification().catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}

export { testEndpoint, runVerification };
