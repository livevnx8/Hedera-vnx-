# Vera SDK Manager v3.0 - Documentation

## Overview

The Vera SDK Manager provides a modular, production-ready architecture for interacting with the Hedera network. It features comprehensive error handling, rate limiting, and health monitoring.

## Architecture

### Core Components

```
VeraSDKManager
├── AccountService    - Account creation, updates, balance queries
├── TokenService      - HTS token operations (create, mint, burn, transfer)
├── TopicService      - HCS topic management (create, submit, update, delete)
├── ContractService   - Smart contract deployment and execution
├── ErrorHandler      - Retry logic, circuit breakers, error tracking
└── RateLimiter       - Request throttling and burst handling
```

## Quick Start

```javascript
import { VeraSDKManager } from './vera-sdk-manager.mjs';

// Initialize
const manager = new VeraSDKManager();
await manager.initialize('mainnet', {
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 100,
    burstSize: 5
  }
});

// Use services
const balance = await manager.account.getBalance('0.0.12345');
console.log(`Balance: ${balance.hbar} HBAR`);

// Clean up
manager.close();
```

## Services

### Account Service

```javascript
// Create account
const result = await manager.account.create({
  initialBalance: 10,
  memo: 'My new account',
  maxAutomaticTokenAssociations: 10
});

// Update account
await manager.account.update({
  accountId: '0.0.12345',
  memo: 'Updated memo',
  stakedNodeId: 0
});

// Get balance
const balance = await manager.account.getBalance('0.0.12345');
```

### Token Service (HTS)

```javascript
// Create fungible token
const token = await manager.token.create({
  name: 'MyToken',
  symbol: 'MTK',
  decimals: 8,
  initialSupply: 1000000,
  treasury: '0.0.12345'
});

// Mint tokens
await manager.token.mint(token.tokenId, 100000);

// Transfer tokens
await manager.token.transfer(
  token.tokenId,
  '0.0.12345',  // from
  '0.0.67890',  // to
  1000
);

// Create NFT
const nft = await manager.token.create({
  name: 'MyNFT',
  symbol: 'MNFT',
  tokenType: 'NFT',
  treasury: '0.0.12345'
});
```

### Topic Service (HCS)

```javascript
// Create topic
const topic = await manager.topic.create({
  memo: 'My HCS topic',
  adminKey: '302e...'
});

// Submit message
await manager.topic.submitMessage(topic.topicId, {
  event: 'user_action',
  data: { action: 'login', user: 'alice' }
});

// Update topic
await manager.topic.update(topic.topicId, {
  memo: 'Updated memo'
});

// Delete topic
await manager.topic.delete(topic.topicId);
```

### Contract Service

```javascript
// Deploy contract
const contract = await manager.contract.deploy(bytecode, {
  gas: 100000,
  adminKey: '302e...'
});

// Execute function
await manager.contract.execute(
  contract.contractId,
  'transfer',
  [recipient, amount],
  100000
);

// Call view function
const result = await manager.contract.call(
  contract.contractId,
  'balanceOf',
  [accountId],
  50000
);
```

## Error Handling

### Automatic Retries

The SDK automatically retries failed operations:

- **Max Retries**: 3 attempts by default
- **Backoff**: Exponential (1s, 2s, 4s)
- **Non-retryable errors**: INSUFFICIENT_PAYER_BALANCE, INVALID_SIGNATURE, etc.

### Circuit Breaker

After 5 consecutive failures, the circuit opens for 30 seconds:

```javascript
// Check circuit status
const isOpen = manager.errorHandler.isCircuitOpen('Account-create');

// Get error stats
const stats = manager.errorHandler.getErrorStats();
console.log(stats);
// {
//   totalErrors: 10,
//   byOperation: { 'Account-create': 5, 'Token-mint': 3 },
//   circuitBreakersOpen: 1
// }
```

## Rate Limiting

### Configuration

```javascript
await manager.initialize('mainnet', {
  rateLimit: {
    requestsPerSecond: 10,    // Max 10 req/s
    requestsPerMinute: 100,   // Max 100 req/min
    burstSize: 5              // Allow bursts of 5
  }
});
```

### Monitoring

```javascript
// Get current stats
const stats = manager.rateLimiter.getStats();
console.log(stats);
// {
//   requestsThisSecond: 3,
//   requestsThisMinute: 45,
//   queueLength: 0
// }
```

## Health Monitoring

### Automatic Health Checks

The SDK performs health checks every 30 seconds:

```javascript
// Listen to health events
manager.on('health', (status) => {
  console.log(`Health: ${status.status}`);
});

// Get current health
const health = manager.getHealth();
manager.displayHealth();
```

### Health Output

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🔍 SDK HEALTH STATUS                                         ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Overall: 🟢 HEALTHY                                          ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Service Metrics:                                              ┃
┃  • account: 50 calls, 98% success                              ┃
┃  • token: 20 calls, 100% success                               ┃
┃  • topic: 100 calls, 99% success                               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  Rate Limiting: 3/10 r/s, 45/100 r/m                           ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

## Event System

### Service Events

```javascript
// Listen to service events
manager.account.on('success', ({ context, result }) => {
  console.log(`✅ ${context.method} succeeded`);
});

manager.account.on('error', ({ context, error }) => {
  console.log(`❌ ${context.method} failed: ${error.message}`);
});
```

## Testing

Run the test suite:

```bash
node agents/vera-sdk-tests.mjs
```

Tests cover:
- Error handling and retries
- Rate limiting
- Circuit breakers
- All service operations
- Health monitoring
- Event system

## Environment Variables

```bash
HEDERA_OPERATOR_ID=0.0.12345
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420...
```

## Best Practices

1. **Always initialize before use**
   ```javascript
   await manager.initialize('mainnet');
   ```

2. **Handle errors gracefully**
   ```javascript
   try {
     await manager.token.mint(tokenId, amount);
   } catch (error) {
     console.error('Mint failed:', error.message);
   }
   ```

3. **Monitor health regularly**
   ```javascript
   setInterval(() => {
     manager.displayHealth();
   }, 60000);
   ```

4. **Close when done**
   ```javascript
   process.on('SIGINT', () => {
     manager.close();
   });
   ```

5. **Use appropriate rate limits**
   - Development: 5 req/s
   - Production: 10-20 req/s
   - Burst handling: 5-10

## API Reference

### VeraSDKManager

#### Methods

- `initialize(network, options)` - Initialize SDK
- `getHealth()` - Get health status
- `displayHealth()` - Display health table
- `close()` - Clean up resources

#### Events

- `health` - Health status changes

### AccountService

#### Methods

- `create(params)` - Create new account
- `update(params)` - Update account
- `delete(accountId, transferAccountId)` - Delete account
- `getBalance(accountId)` - Query balance

### TokenService

#### Methods

- `create(params)` - Create token
- `mint(tokenId, amount)` - Mint tokens
- `burn(tokenId, amount)` - Burn tokens
- `transfer(tokenId, from, to, amount)` - Transfer tokens
- `associate(tokenId, accountId)` - Associate token

### TopicService

#### Methods

- `create(params)` - Create topic
- `submitMessage(topicId, message)` - Submit message
- `update(topicId, params)` - Update topic
- `delete(topicId)` - Delete topic

### ContractService

#### Methods

- `deploy(bytecode, params)` - Deploy contract
- `execute(contractId, function, params, gas)` - Execute function
- `call(contractId, function, params, gas)` - Call view function

## Examples

### Complete Workflow

```javascript
import { VeraSDKManager } from './vera-sdk-manager.mjs';

async function main() {
  const manager = new VeraSDKManager();
  
  // Initialize
  await manager.initialize('testnet');
  
  // Create token
  const token = await manager.token.create({
    name: 'DemoToken',
    symbol: 'DEMO',
    decimals: 8,
    initialSupply: 1000000,
    treasury: manager.operatorId
  });
  
  console.log(`Created token: ${token.tokenId}`);
  
  // Create topic for events
  const topic = await manager.topic.create({
    memo: 'Demo events'
  });
  
  // Log token creation
  await manager.topic.submitMessage(topic.topicId, {
    event: 'token_created',
    tokenId: token.tokenId,
    timestamp: Date.now()
  });
  
  // Check health
  manager.displayHealth();
  
  // Clean up
  manager.close();
}

main().catch(console.error);
```

## Changelog

### v3.0
- Modular service architecture
- Error handling with retries
- Rate limiting
- Circuit breakers
- Health monitoring
- Event system
- Comprehensive test suite

## License

MIT - See LICENSE file

## Support

For issues and questions:
- GitHub Issues
- Discord: Vera Community
- Email: support@vera.network
