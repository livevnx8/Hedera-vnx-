# Vera Sandbox Examples

This directory contains working examples demonstrating Vera's capabilities in the sandbox environment.

## Quick Start

```bash
# 1. Start the sandbox
./vera-sandbox start

# 2. Run an example
node examples/sandbox/01-hello-vera.mjs
```

## Examples Overview

| # | Example | Description | Topics |
|---|---------|-------------|--------|
| 01 | [hello-vera.mjs](./01-hello-vera.mjs) | Health checks & API basics | API, Health |
| 02 | [create-topic.mjs](./02-create-topic.mjs) | HCS topic operations | HCS, Hedera |
| 03 | [deploy-agent.mjs](./03-deploy-agent.mjs) | Agent lifecycle management | Agents |
| 04 | [carbon-audit.mjs](./04-carbon-audit.mjs) | WV carbon credit validation | Carbon, Audit |
| 05 | [energy-monitor.mjs](./05-energy-monitor.mjs) | WV energy grid monitoring | Energy, Grid |

## Environment Variables

```bash
VERA_API_URL=http://localhost:8080    # Vera API endpoint
HEDERA_NETWORK=testnet                  # or 'mainnet'
HEDERA_TESTNET_ACCOUNT_ID=0.0.xxxx    # Your testnet account
HEDERA_TESTNET_PRIVATE_KEY=...        # Your testnet key
MOCK_MODE=true                        # Use mock services (offline)
```

## Running Examples

### With Testnet (Real Hedera)
```bash
# Set up testnet credentials first
node scripts/setup-testnet.mjs
source .env.sandbox.local

# Run examples
node examples/sandbox/01-hello-vera.mjs
node examples/sandbox/02-create-topic.mjs
```

### With Mock Mode (Offline)
```bash
# No Hedera credentials needed
MOCK_MODE=true node examples/sandbox/02-create-topic.mjs
```

### Against Running Sandbox
```bash
# If sandbox is running locally
VERA_API_URL=http://localhost:8080 node examples/sandbox/03-deploy-agent.mjs
```

## Example Output

### 01-hello-vera.mjs
```
🧪 Vera Sandbox - Hello Vera Example

Connecting to: http://localhost:8080

1️⃣  Checking Vera health...
   ✅ Vera is healthy!
   Status: operational

2️⃣  Getting API status...
   ✅ API Status received
   Network: testnet
   Version: 1.0.0

🎉 Hello Vera complete!
```

### 04-carbon-audit.mjs
```
🧪 Vera Sandbox - Carbon Credit Audit Example

1️⃣  Checking carbon validator...
   ✅ Carbon validator status:
   Active: true
   Projects Tracked: 3

2️⃣  Listing carbon projects...
   ✅ Found 3 project(s):
   - VCS-VCU-1523: 50,000 tons | FORESTRY | WV
   - VCS-VCU-1524: 75,000 tons | RENEWABLE_ENERGY | WV
   - ACR-CR-7892: 15,000 tons | DIRECT_AIR_CAPTURE | WV

🎉 Carbon Audit Example Complete!
```

## Creating Your Own Examples

Template:
```javascript
const API_URL = process.env.VERA_API_URL || 'http://localhost:8080';

async function myExample() {
  try {
    // API call
    const response = await fetch(`${API_URL}/api/v1/...`);
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

myExample();
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Start sandbox: `./vera-sandbox start` |
| No credentials | Run: `node scripts/setup-testnet.mjs` |
| 404 errors | Check API URL with `./vera-sandbox status` |
| Testnet errors | Try mock mode: `MOCK_MODE=true node example.mjs` |

## Next Steps

- Read [SANDBOX.md](../../SANDBOX.md) for full documentation
- Explore the [API documentation](../../API.md)
- Build your own agents and workflows
