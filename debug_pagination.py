#!/usr/bin/env python3
"""
Debug Hedera REST API pagination to understand why only 100 transactions are returned.
"""

import json
import requests
import sys

sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')

from starlit.hedera_real_data_fetcher import HederaDataFetcher

print("=" * 60)
print("DEBUGGING HEDERA REST PAGINATION")
print("=" * 60)

# Manual fetch to inspect response structure
base_url = "https://testnet.mirrornode.hedera.com/api/v1"
endpoint = f"{base_url}/transactions"
params = {
    "limit": 100,
    "order": "desc"
}

print(f"\nFetching from: {endpoint}")
print(f"Params: {params}")

session = requests.Session()
session.headers.update({"Accept": "application/json"})

response = session.get(endpoint, params=params, timeout=10)
print(f"Status: {response.status_code}")

data = response.json()

print(f"\nTop-level keys: {list(data.keys())}")

if "transactions" in data:
    print(f"Number of transactions: {len(data['transactions'])}")
    if data['transactions']:
        print(f"First tx keys: {list(data['transactions'][0].keys())[:10]}")
        print(f"First tx type: {data['transactions'][0].get('name', 'N/A')}")

if "links" in data:
    print(f"\nLinks keys: {list(data['links'].keys())}")
    for key, value in data['links'].items():
        print(f"  {key}: {value[:100] if value else 'None'}...")
else:
    print("\nNo 'links' key in response!")

# Now test with transaction type filter
print("\n" + "=" * 60)
print("Testing with transaction_type=CRYPTOTRANSFER")
print("=" * 60)

params2 = {
    "limit": 100,
    "order": "desc",
    "transactiontype": "CRYPTOTRANSFER"
}

response2 = session.get(endpoint, params=params2, timeout=10)
data2 = response2.json()

print(f"Transactions returned: {len(data2.get('transactions', []))}")
if "links" in data2:
    print(f"Links next: {data2['links'].get('next', 'None')[:100]}...")

# Test pagination manually
print("\n" + "=" * 60)
print("Testing manual pagination (following 'next' link)")
print("=" * 60)

if "links" in data and "next" in data["links"] and data["links"]["next"]:
    next_url = data["links"]["next"]
    print(f"Next URL: {next_url[:150]}...")
    
    # Check if relative or absolute
    if next_url.startswith("http"):
        print("URL is absolute")
    else:
        print(f"URL is relative: {next_url}")
        # Need to prepend base_url
        if not next_url.startswith("/"):
            next_url = "/" + next_url
        next_url = base_url + next_url
        print(f"Fixed URL: {next_url[:150]}...")
    
    response3 = session.get(next_url, timeout=10)
    data3 = response3.json()
    print(f"Page 2 status: {response3.status_code}")
    print(f"Page 2 transactions: {len(data3.get('transactions', []))}")
else:
    print("No next link available - pagination not working!")

# Test the actual fetcher
print("\n" + "=" * 60)
print("Testing HederaDataFetcher.fetch_transactions")
print("=" * 60)

fetcher = HederaDataFetcher(network="testnet")
tx = fetcher.fetch_transactions(limit=250, transaction_type="CRYPTOTRANSFER")
print(f"Total fetched: {len(tx)}")

# Test mainnet
print("\n" + "=" * 60)
print("Testing mainnet access")
print("=" * 60)

fetcher_main = HederaDataFetcher(network="mainnet")
tx_main = fetcher_main.fetch_transactions(limit=250)
print(f"Mainnet fetched: {len(tx_main)}")
if tx_main:
    print(f"First tx type: {tx_main[0].get('name', 'N/A')}")

print("\n" + "=" * 60)
print("DEBUG COMPLETE")
print("=" * 60)
