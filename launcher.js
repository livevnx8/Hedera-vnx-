const { execSync } = require('child_process');

console.log('🚀 VERA LIVE DOVU STARTING...');
console.log('Token: 0.0.3716059');
console.log('Wallet: 0.0.10294360\n');

try {
  // Run the TypeScript file using tsx
  execSync('npx tsx vera-dovu-3716059-live.ts', {
    cwd: '/home/vera-live-0-1/hedera-llm-api',
    stdio: 'inherit',
    timeout: 0
  });
} catch (e) {
  console.log('Error:', e.message);
  process.exit(1);
}
