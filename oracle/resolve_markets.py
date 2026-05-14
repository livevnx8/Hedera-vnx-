#!/usr/bin/env python3
"""
Oracle: Automatically resolve prediction markets using ML model predictions.

Usage:
  python3 resolve_markets.py --market-id 0  # Resolve specific market
  python3 resolve_markets.py --all          # Resolve all expired markets
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

import requests

# For Hedera SDK integration (would need @hashgraph/sdk installed)
# from hedera import Client, AccountId, PrivateKey, ContractExecuteTransaction

# For now, use REST API to prediction server
PREDICTION_SERVER = "http://localhost:8000"


def get_market_info(market_id: int) -> dict:
    """Get market info from blockchain."""
    # In production, this would call the smart contract
    # For demo, we simulate
    print(f"  Fetching market {market_id} info from contract...")
    return {
        "token": "hbar",
        "endTime": time.time() - 3600,  # Expired 1h ago
        "resolved": False,
    }


def get_prediction(token: str) -> dict:
    """Get ML prediction for a token."""
    try:
        response = requests.get(f"{PREDICTION_SERVER}/predict/{token}", timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"  Error getting prediction: {e}")
        return None


def resolve_market(market_id: int, outcome: bool) -> bool:
    """Resolve market on blockchain. Oracle-only function."""
    # In production, this would:
    # 1. Load oracle private key
    # 2. Call contract.resolveMarket(marketId, outcome)
    # 3. Submit to Hedera network
    
    print(f"  Resolving market {market_id}: {'UP' if outcome else 'DOWN'}")
    print(f"  (In production: would submit Hedera transaction)")
    return True


def main():
    parser = argparse.ArgumentParser(description="Resolve prediction markets")
    parser.add_argument("--market-id", type=int, help="Specific market to resolve")
    parser.add_argument("--all", action="store_true", help="Resolve all expired markets")
    parser.add_argument("--server", type=str, default=PREDICTION_SERVER, help="Prediction server URL")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without submitting")
    args = parser.parse_args()
    
    print("=" * 60)
    print("PREDICTION MARKET ORACLE")
    print("=" * 60)
    
    # Check prediction server
    try:
        response = requests.get(f"{args.server}/health", timeout=5)
        health = response.json()
        print(f"Server: {args.server}")
        print(f"Status: {health['status']}")
        print(f"Models: {health['models_loaded']} loaded")
    except Exception as e:
        print(f"Error: Cannot connect to prediction server at {args.server}")
        print(f"  {e}")
        print("\nStart server with: python3 prediction_server_unified.py")
        return
    
    # Resolve markets
    if args.market_id is not None:
        market_ids = [args.market_id]
    elif args.all:
        # In production, query contract for expired markets
        market_ids = [0, 1, 2]  # Demo
    else:
        print("\nUse --market-id N or --all")
        return
    
    print(f"\nResolving {len(market_ids)} market(s)...")
    
    for market_id in market_ids:
        print(f"\nMarket {market_id}:")
        
        market = get_market_info(market_id)
        if market["resolved"]:
            print("  Already resolved")
            continue
        
        if time.time() < market["endTime"]:
            print(f"  Not expired yet (expires in {market['endTime'] - time.time():.0f}s)")
            continue
        
        # Get prediction
        prediction = get_prediction(market["token"])
        if not prediction:
            print("  Failed to get prediction")
            continue
        
        print(f"  Prediction: {prediction['direction']} "
              f"(UP: {prediction['up_probability']:.1%}, "
              f"conf: {prediction['confidence']:.1%})")
        
        # Determine outcome
        outcome = prediction["direction"] == "UP"
        
        if args.dry_run:
            print(f"  DRY RUN: Would resolve as {'UP' if outcome else 'DOWN'}")
        else:
            resolve_market(market_id, outcome)
    
    print(f"\n{'='*60}")
    print("ORACLE COMPLETE")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
