/**
 * Check Vera's Live Verification Count
 */

import { dovuDominance } from './src/dovu/dominanceEngine.js';
import { paymentOrchestrator } from './src/dovu/paymentOrchestrator.js';

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  📊 VERA LIVE VERIFICATION COUNT                                   ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

await dovuDominance.initialize();
await paymentOrchestrator.initialize();

const stats = dovuDominance.getDominanceStats();
const payments = paymentOrchestrator.getPaymentStats();

console.log('🔥 LIVE VERIFICATION STATS:');
console.log('═'.repeat(70));
console.log(`Total Verifications: ${stats.totalVerifications.toLocaleString()}`);
console.log(`Successful: ${stats.successfulVerifications.toLocaleString()}`);
console.log(`Success Rate: ${(stats.batchSuccessRate * 100).toFixed(1)}%`);
console.log(`Average Time: ${stats.averageVerificationTime.toFixed(2)}ms per credit`);
console.log(`Total Carbon Tons: ${stats.totalCarbonTons.toLocaleString()}`);
console.log(`Earnings Tracked: ${(stats.totalEarningsDovu / 100000000).toFixed(2)} DOVU`);
console.log(`Current Rank: #${stats.ranking}`);

console.log('\n💰 PAYMENT STATS:');
console.log(`Total Payments: ${payments.totalPayments}`);
console.log(`Total Amount: ${(payments.totalAmount / 100000000).toFixed(2)} DOVU`);
console.log(`Average Payment: ${(payments.averagePayment / 100000000).toFixed(2)} DOVU`);

console.log('\n═'.repeat(70));
console.log(`✅ Vera has verified ${stats.totalVerifications.toLocaleString()} carbon credits live!`);
console.log('═'.repeat(70));
