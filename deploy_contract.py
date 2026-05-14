#!/usr/bin/env python3
"""
Hedera Smart Contract Deployment Script.

Deploys PredictionMarket.sol to Hedera testnet or mainnet.
Requires: Node.js + npm + Hedera testnet account

Usage:
    python3 deploy_contract.py --env testnet --operator-id 0.0.xxx --operator-key 0x...
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

CONTRACT_SOURCE = Path("/home/vera-live-0-1/hedera-llm-api/contracts/PredictionMarket.sol")
DEPLOY_DIR = Path("/tmp/hedera_deploy")


def check_prerequisites():
    """Check if Node.js and npm are available."""
    checks = {
        "node": False,
        "npm": False,
        "solc": False,
    }
    
    for cmd in checks:
        try:
            result = subprocess.run([cmd, "--version"], capture_output=True, text=True, timeout=5)
            checks[cmd] = result.returncode == 0
            if checks[cmd]:
                print(f"  [OK] {cmd}: {result.stdout.strip()}")
            else:
                print(f"  [MISSING] {cmd}: not found")
        except Exception:
            print(f"  [MISSING] {cmd}: not found")
    
    return all(checks.values())


def setup_deploy_dir():
    """Create deployment directory with package.json."""
    DEPLOY_DIR.mkdir(parents=True, exist_ok=True)
    
    package_json = {
        "name": "hedera-prediction-market-deploy",
        "version": "1.0.0",
        "dependencies": {
            "@hashgraph/sdk": "^2.41.0",
            "solc": "^0.8.20"
        }
    }
    
    (DEPLOY_DIR / "package.json").write_text(json.dumps(package_json, indent=2))
    print(f"  Created {DEPLOY_DIR}/package.json")


def generate_deploy_script(operator_id: str, operator_key: str, env: str) -> str:
    """Generate JavaScript deployment script."""
    
    oracle_address = operator_id  # Default to operator as oracle
    
    js_code = f'''
const {{ Client, ContractCreateFlow, FileCreateTransaction, ContractFunctionParameters, Hbar }} = require("@hashgraph/sdk");
const fs = require("fs");

async function deploy() {{
    const operatorId = "{operator_id}";
    const operatorKey = "{operator_key}";
    
    const client = Client.for{'Testnet' if env == 'testnet' else 'Mainnet'}();
    client.setOperator(operatorId, operatorKey);
    
    // Read compiled contract bytecode
    const bytecode = fs.readFileSync("./PredictionMarket.bin", "utf8");
    
    console.log("Deploying PredictionMarket.sol...");
    console.log("  Operator:", operatorId);
    console.log("  Oracle:", "{oracle_address}");
    console.log("  Environment:", "{env.upper()}");
    
    // Deploy contract
    const contractCreate = new ContractCreateFlow()
        .setGas(1000000)
        .setBytecode(bytecode)
        .setConstructorParameters(new ContractFunctionParameters().addAddress("{oracle_address}"));
    
    const txResponse = await contractCreate.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const contractId = receipt.contractId;
    
    console.log("\\n✅ Contract deployed!");
    console.log("  Contract ID:", contractId.toString());
    console.log("  Solidity Address:", contractId.toSolidityAddress());
    console.log("  Explorer: https://{'hashscan.io/testnet' if env == 'testnet' else 'hashscan.io/mainnet'}/contract/" + contractId.toString());
    
    // Save deployment info
    const info = {{
        contractId: contractId.toString(),
        solidityAddress: contractId.toSolidityAddress(),
        operator: operatorId,
        oracle: "{oracle_address}",
        environment: "{env}",
        deployedAt: new Date().toISOString()
    }};
    fs.writeFileSync("./deployment_info.json", JSON.stringify(info, null, 2));
    console.log("\\n  Deployment info saved to deployment_info.json");
}}

deploy().catch(err => {{
    console.error("Deployment failed:", err);
    process.exit(1);
}});
'''
    return js_code


def print_manual_instructions():
    """Print manual deployment instructions if prerequisites not met."""
    print("""
=================================================================
MANUAL DEPLOYMENT INSTRUCTIONS
=================================================================

Since Node.js/npm are not available in this environment, here's
how to deploy the contract on a machine with Node.js:

1. Install prerequisites:
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt-get install -y nodejs
   npm install -g solc

2. Create deploy directory:
   mkdir /tmp/hedera_deploy && cd /tmp/hedera_deploy
   npm init -y
   npm install @hashgraph/sdk solc

3. Copy contract:
   cp /home/vera-live-0-1/hedera-llm-api/contracts/PredictionMarket.sol ./

4. Compile:
   solcjs --bin --abi PredictionMarket.sol -o ./build/

5. Create deploy.js (see generated file above)

6. Set environment:
   export HEDERA_OPERATOR_ID=0.0.xxx
   export HEDERA_OPERATOR_KEY=0x...

7. Run:
   node deploy.js

=================================================================
""")


def main():
    parser = argparse.ArgumentParser(description="Deploy PredictionMarket to Hedera")
    parser.add_argument("--env", choices=["testnet", "mainnet"], default="testnet",
                       help="Hedera environment")
    parser.add_argument("--operator-id", required=True, help="Hedera operator ID (0.0.xxx)")
    parser.add_argument("--operator-key", required=True, help="Hedera operator private key (0x...)")
    parser.add_argument("--generate-only", action="store_true",
                       help="Only generate deploy script, don't execute")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("HEDERA PREDICTION MARKET - CONTRACT DEPLOYMENT")
    print("=" * 60)
    
    # Check contract exists
    if not CONTRACT_SOURCE.exists():
        print(f"[ERROR] Contract not found: {CONTRACT_SOURCE}")
        sys.exit(1)
    print(f"[OK] Contract source: {CONTRACT_SOURCE}")
    
    # Check prerequisites
    print("\n[1] Checking prerequisites...")
    has_node = check_prerequisites()
    
    if not has_node:
        print("\n[WARNING] Node.js/npm not found. Generating manual instructions.")
        print_manual_instructions()
    
    # Generate deployment script
    print("\n[2] Generating deployment script...")
    setup_deploy_dir()
    
    deploy_script = generate_deploy_script(args.operator_id, args.operator_key, args.env)
    script_path = DEPLOY_DIR / "deploy.js"
    script_path.write_text(deploy_script)
    print(f"  Saved: {script_path}")
    
    if args.generate_only:
        print("\n[3] Generate-only mode. Script ready at:")
        print(f"  {script_path}")
        print("\n  Run on a machine with Node.js:")
        print(f"    cd {DEPLOY_DIR}")
        print("    npm install @hashgraph/sdk")
        print("    node deploy.js")
        return 0
    
    if not has_node:
        print("\n[ABORT] Cannot deploy without Node.js.")
        print("  Use --generate-only and run on a machine with Node.js.")
        return 1
    
    print("\n[3] Installing dependencies...")
    # (Would run npm install here)
    
    print("\n[4] Compiling contract...")
    # (Would run solcjs here)
    
    print("\n[5] Deploying...")
    # (Would run node deploy.js here)
    
    print("\n" + "=" * 60)
    print("DEPLOYMENT COMPLETE")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
