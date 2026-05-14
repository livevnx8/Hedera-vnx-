"""
Fetch real Hedera blockchain data from mirror nodes
Extract transactions, blocks, and other blockchain data for training
"""

import requests
import json
import time
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime

# Hedera mirror node endpoints (public testnet/mainnet)
HEDERA_MIRROR_NODES = [
    "https://testnet.mirrornode.hedera.com/api/v1",
    "https://mainnet-public.mirrornode.hedera.com/api/v1"
]

# Transaction types to fetch
TRANSACTION_TYPES = [
    "CRYPTOTRANSFER",
    "TOKENCREATE",
    "TOKENTRANSFER",
    "CONTRACTCALL",
    "CONSENSUSSUBMITMESSAGE",
    "TOKENMINT"
]


class HederaDataFetcher:
    """Fetch real Hedera blockchain data from mirror nodes."""
    
    def __init__(self, network: str = "testnet"):
        """
        Initialize Hedera data fetcher.
        
        Args:
            network: Network to connect to (testnet or mainnet)
        """
        self.network = network
        if network == "testnet":
            self.base_url = "https://testnet.mirrornode.hedera.com/api/v1"
            self.domain_url = "https://testnet.mirrornode.hedera.com"
        else:
            self.base_url = "https://mainnet-public.mirrornode.hedera.com/api/v1"
            self.domain_url = "https://mainnet-public.mirrornode.hedera.com"
        
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json"
        })
    
    def fetch_transactions(self, limit: int = 10000, transaction_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch transactions from Hedera mirror node.
        
        Args:
            limit: Number of transactions to fetch
            transaction_type: Specific transaction type to filter
            
        Returns:
            List of transaction records
        """
        transactions = []
        
        # Fetch transactions by type or all
        endpoint = f"{self.base_url}/transactions"
        params = {
            "limit": min(100, limit),  # Mirror node max per request
            "order": "desc"
        }
        
        if transaction_type:
            params["transactiontype"] = transaction_type
        
        print(f"Fetching {transaction_type or 'all'} transactions from {self.network}...")
        
        while len(transactions) < limit:
            try:
                response = self.session.get(endpoint, params=params, timeout=10)
                response.raise_for_status()
                data = response.json()
                
                if "transactions" not in data or not data["transactions"]:
                    print(f"No more transactions found. Total fetched: {len(transactions)}")
                    break
                
                transactions.extend(data["transactions"])
                print(f"Fetched {len(transactions)}/{limit} transactions...")
                
                # Get next page
                if "links" in data and "next" in data["links"] and data["links"]["next"]:
                    next_url = data["links"]["next"]
                    # Handle relative URLs (e.g., /api/v1/transactions?...)
                    if next_url.startswith("/"):
                        endpoint = f"{self.domain_url}{next_url}"
                    else:
                        endpoint = next_url
                    params = {}  # Clear params for next page
                else:
                    break
                
                # Rate limiting
                time.sleep(0.1)
                
            except Exception as e:
                print(f"Error fetching transactions: {e}")
                break
        
        return transactions[:limit]
    
    def fetch_blocks(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Fetch blocks from Hedera mirror node.
        
        Args:
            limit: Number of blocks to fetch
            
        Returns:
            List of block records
        """
        blocks = []
        endpoint = f"{self.base_url}/blocks"
        params = {
            "limit": min(100, limit),
            "order": "desc"
        }
        
        print(f"Fetching blocks from {self.network}...")
        
        while len(blocks) < limit:
            try:
                response = self.session.get(endpoint, params=params, timeout=10)
                response.raise_for_status()
                data = response.json()
                
                if "blocks" not in data or not data["blocks"]:
                    print(f"No more blocks found. Total fetched: {len(blocks)}")
                    break
                
                blocks.extend(data["blocks"])
                print(f"Fetched {len(blocks)}/{limit} blocks...")
                
                # Get next page
                if "links" in data and "next" in data["links"] and data["links"]["next"]:
                    next_url = data["links"]["next"]
                    # Handle relative URLs
                    if next_url.startswith("/"):
                        endpoint = f"{self.domain_url}{next_url}"
                    else:
                        endpoint = next_url
                    params = {}
                else:
                    break
                
                time.sleep(0.1)
                
            except Exception as e:
                print(f"Error fetching blocks: {e}")
                break
        
        return blocks[:limit]
    
    def fetch_transaction_by_id(self, transaction_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a specific transaction by ID.
        
        Args:
            transaction_id: Transaction ID to fetch
            
        Returns:
            Transaction record or None
        """
        try:
            response = self.session.get(
                f"{self.base_url}/transactions/{transaction_id}",
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error fetching transaction {transaction_id}: {e}")
            return None


def extract_features_from_real_transaction(transaction: Dict[str, Any]) -> Dict[str, float]:
    """
    Extract 20 features from real Hedera transaction.
    
    Args:
        transaction: Real Hedera transaction data
        
    Returns:
        Dictionary of 20 normalized features
    """
    features = {}
    
    # Transaction type
    transaction_type = transaction.get("name", "UNKNOWN")
    type_map = {
        "CRYPTOTRANSFER": 0,
        "TOKENCREATE": 1,
        "TOKENTRANSFER": 2,
        "CONTRACTCALL": 3,
        "CONSENSUSSUBMITMESSAGE": 4,
        "TOKENMINT": 5,
        "SYSTEMDELETE": 6,
        "SYSTEMUNDELETE": 7,
        "FREEZE": 8,
        "UNFREEZE": 9
    }
    features["transaction_type_idx"] = float(type_map.get(transaction_type, 0))
    
    # Account ID
    account_id = transaction.get("account", transaction.get("entity_id", "0.0.0"))
    account_parts = account_id.split(".") if account_id else ["0", "0", "0"]
    account_num = int(account_parts[-1]) if len(account_parts) > 2 else 0
    features["account_id_normalized"] = min(float(account_num) / 1000000.0, 1.0)
    
    # Transaction fee
    fee = transaction.get("charged_tx_fee", 0)
    features["transaction_fee_log"] = np.log1p(max(0, fee / 100000000.0)) / 15.0
    
    # Timestamp
    consensus_timestamp = transaction.get("consensus_timestamp", "")
    if consensus_timestamp:
        timestamp_parts = consensus_timestamp.split(".")
        if len(timestamp_parts) >= 1:
            seconds = int(timestamp_parts[0])
            features["hour_of_day"] = float((seconds % 86400)) / 86400.0
            features["day_of_week"] = float((seconds // 86400) % 7) / 7.0
        else:
            features["hour_of_day"] = 0.0
            features["day_of_week"] = 0.0
    else:
        features["hour_of_day"] = 0.0
        features["day_of_week"] = 0.0
    
    # Memo length
    memo_base64 = transaction.get("memo_base64", "")
    features["memo_length"] = float(len(memo_base64)) / 100.0
    
    # Max fee
    max_fee = transaction.get("max_fee", "0")
    features["max_fee"] = min(float(max_fee) / 1000000000.0, 1.0)
    
    # Token ID (for token transactions)
    token_id = transaction.get("token_id", "0.0.0")
    token_parts = token_id.split(".") if token_id else ["0", "0", "0"]
    token_num = int(token_parts[-1]) if len(token_parts) > 2 else 0
    features["token_id_normalized"] = float(token_num) / 1000000.0
    
    # Fee efficiency: how close actual fee is to max fee (indicates congestion)
    fee = float(transaction.get("charged_tx_fee", 0))
    max_fee_val = float(transaction.get("max_fee", 1))
    features["fee_efficiency"] = min(fee / max(max_fee_val, 1), 1.0)
    
    # High volume flag and multiplier (real network metrics)
    features["is_high_volume"] = 1.0 if transaction.get("high_volume", False) else 0.0
    multiplier = transaction.get("high_volume_pricing_multiplier", 1.0)
    features["volume_multiplier"] = float(multiplier if multiplier is not None else 1.0) / 4.0
    
    # Has custom fees (token transactions often have custom fees)
    max_custom = transaction.get("max_custom_fees", 0)
    features["has_custom_fees"] = 1.0 if max_custom and int(max_custom) > 0 else 0.0
    
    # Transfer count (CRYPTOTRANSFER, TOKENTRANSFER have multiple transfers)
    transfers = transaction.get("transfers", [])
    features["transfer_count_log"] = np.log1p(len(transfers)) / 5.0
    
    # Has memo
    memo = transaction.get("memo_base64", "")
    features["has_memo"] = 1.0 if len(memo) > 0 else 0.0
    
    # Transaction nonce (0 for parent, >0 for child transactions)
    nonce = int(transaction.get("nonce", 0))
    features["nonce_normalized"] = min(nonce / 10.0, 1.0)
    
    # Has valid start timestamp (scheduled transactions have this)
    valid_start = transaction.get("valid_start_timestamp", "")
    features["has_valid_start"] = 1.0 if valid_start else 0.0
    
    # Entity type from entity_id prefix (0=account, 1=topic, 2=token, 3=file, 4=contract)
    entity_id = transaction.get("entity_id", "")
    if entity_id and len(entity_id.split(".")) >= 3:
        entity_type = int(entity_id.split(".")[1]) if entity_id.split(".")[1].isdigit() else 0
        features["entity_type"] = min(entity_type / 10.0, 1.0)
    else:
        features["entity_type"] = 0.0
    
    # Has parent consensus timestamp (child transaction indicator)
    parent = transaction.get("parent_consensus_timestamp", "")
    features["is_child_transaction"] = 1.0 if parent else 0.0
    
    # Byte size of transaction (larger = more complex)
    tx_bytes_str = transaction.get("bytes", "") or ""
    tx_bytes = len(tx_bytes_str)
    features["tx_byte_size_log"] = np.log1p(tx_bytes) / 10.0
    
    # Has batch key (batch transaction indicator)
    features["is_batched"] = 1.0 if transaction.get("batch_key", "") else 0.0
    
    return features


if __name__ == "__main__":
    import numpy as np
    
    # Test fetching real data
    print("=== Testing Hedera Real Data Fetcher ===\n")
    
    fetcher = HederaDataFetcher(network="testnet")
    
    # Fetch some transactions
    transactions = fetcher.fetch_transactions(limit=100)
    print(f"\nFetched {len(transactions)} transactions")
    
    if transactions:
        print(f"\nSample transaction:")
        print(json.dumps(transactions[0], indent=2))
        
        # Extract features
        features = extract_features_from_real_transaction(transactions[0])
        print(f"\nExtracted features ({len(features)}):")
        for key, value in features.items():
            print(f"  {key}: {value}")
