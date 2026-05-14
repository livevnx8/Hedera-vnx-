import { paymentOrchestrator } from '../src/dovu/paymentOrchestrator.js';
import { dovuDominance } from '../src/dovu/dominanceEngine.js';

console.log('💰 VERA DOVU PAYMENT CHECK\n');

await paymentOrchestrator.initialize();

const stats = paymentOrchestrator.getPaymentStats();
const balance = await paymentOrchestrator.getOperatorBalance();
const dominance = dovuDominance.getDominanceStats();

console.log('=== PAYMENT STATS ===');
console.log('Total Payments:', stats.totalPayments);
console.log('Total Earned:', (stats.totalAmount / 100000000).toFixed(2), 'DOVU');
console.log('Pending:', stats.pendingPayments);
console.log('Failed:', stats.failedPayments);

console.log('\n=== TOKEN BALANCE ===');
console.log('Current Balance:', (balance / 100000000).toFixed(2), 'DOVU');

console.log('\n=== DOMINANCE EARNINGS ===');
console.log('Verifications:', dominance.totalVerifications);
console.log('Earnings Tracked:', (dominance.totalEarningsDovu / 100000000).toFixed(2), 'DOVU');

console.log('\n⚠️ IMPORTANT:');
console.log('Earnings are tracked but tokens not yet transferred.');
console.log('To actually receive DOVU, you need:');
console.log('1. DOVU_PAYMENT_CONTRACT_ID configured');
console.log('2. Treasury account with DOVU tokens');
console.log('3. Smart contract call to release payments');
