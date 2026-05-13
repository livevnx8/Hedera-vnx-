"""
Mirror Node Verifier — reads HCS messages from Hedera mirror node and validates
that local proof hashes match on-chain records.

Uses the public Hedera Mirror Node REST API:
  - mainnet: https://mainnet-public.mirrornode.hedera.com
  - testnet: https://testnet.mirrornode.hedera.com
"""

import hashlib
import json
import os
import time
import logging
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

logger = logging.getLogger("vera.mirror_verifier")

MIRROR_URLS = {
    "mainnet": "https://mainnet-public.mirrornode.hedera.com",
    "testnet": "https://testnet.mirrornode.hedera.com",
}


@dataclass
class OnChainMessage:
    """A single HCS message retrieved from the mirror node."""
    topic_id: str = ""
    sequence_number: int = 0
    consensus_timestamp: str = ""
    message_content: Dict[str, Any] = field(default_factory=dict)
    payer_account_id: str = ""
    running_hash: str = ""
    chunk_info: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class VerificationResult:
    """Result of verifying a local proof hash against on-chain data."""
    task_id: str = ""
    verified: bool = False
    local_hash: str = ""
    on_chain_hash: Optional[str] = None
    topic_id: str = ""
    sequence_number: Optional[int] = None
    consensus_timestamp: Optional[str] = None
    hashscan_url: Optional[str] = None
    mismatch_details: Optional[str] = None
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class MirrorVerifier:
    """
    Verifies local proof receipts against Hedera mirror node data.
    """

    def __init__(
        self,
        network: Optional[str] = None,
        mirror_url: Optional[str] = None,
    ):
        self._network = network or os.environ.get("HEDERA_NETWORK", "testnet").lower()
        self._mirror_url = mirror_url or os.environ.get(
            "MIRROR_NODE_BASE_URL",
            MIRROR_URLS.get(self._network, MIRROR_URLS["testnet"])
        )
        self._verifications: List[VerificationResult] = []
        self._total_verified: int = 0
        self._total_failed: int = 0
        self._total_requests: int = 0

        logger.info(f"MirrorVerifier initialized: network={self._network}, mirror={self._mirror_url}")

    def fetch_topic_messages(
        self,
        topic_id: str,
        limit: int = 25,
        sequence_after: int = 0,
    ) -> List[OnChainMessage]:
        """Fetch recent messages from a topic via mirror node REST API."""
        url = f"{self._mirror_url}/api/v1/topics/{topic_id}/messages"
        params = f"?limit={limit}&order=desc"
        if sequence_after > 0:
            params += f"&sequencenumber=gt:{sequence_after}"

        self._total_requests += 1

        try:
            req = Request(url + params, headers={"Accept": "application/json"})
            with urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())

            messages = []
            for msg in data.get("messages", []):
                content = {}
                try:
                    import base64
                    raw = base64.b64decode(msg.get("message", ""))
                    content = json.loads(raw)
                except Exception:
                    content = {"raw": msg.get("message", "")}

                messages.append(OnChainMessage(
                    topic_id=topic_id,
                    sequence_number=msg.get("sequence_number", 0),
                    consensus_timestamp=msg.get("consensus_timestamp", ""),
                    message_content=content,
                    payer_account_id=msg.get("payer_account_id", ""),
                    running_hash=msg.get("running_hash", ""),
                    chunk_info=msg.get("chunk_info"),
                ))
            return messages

        except (URLError, Exception) as e:
            logger.error(f"Mirror node fetch failed: {e}")
            return []

    def verify_receipt(
        self,
        task_id: str,
        local_proof_hash: str,
        topic_id: str,
        sequence_number: Optional[int] = None,
    ) -> VerificationResult:
        """
        Verify a local proof hash exists on-chain.

        If sequence_number is provided, checks that specific message.
        Otherwise, searches recent messages for a matching proof hash.
        """
        network = self._network
        hashscan_base = f"https://hashscan.io/{network}"

        if sequence_number:
            messages = self.fetch_topic_messages(topic_id, limit=1, sequence_after=sequence_number - 1)
            target = next((m for m in messages if m.sequence_number == sequence_number), None)

            if not target:
                result = VerificationResult(
                    task_id=task_id,
                    verified=False,
                    local_hash=local_proof_hash,
                    topic_id=topic_id,
                    sequence_number=sequence_number,
                    mismatch_details=f"Sequence {sequence_number} not found on mirror node",
                )
                self._record(result)
                return result

            on_chain_hash = self._extract_proof_hash(target.message_content)
            verified = on_chain_hash == local_proof_hash

            result = VerificationResult(
                task_id=task_id,
                verified=verified,
                local_hash=local_proof_hash,
                on_chain_hash=on_chain_hash,
                topic_id=topic_id,
                sequence_number=sequence_number,
                consensus_timestamp=target.consensus_timestamp,
                hashscan_url=f"{hashscan_base}/topic/{topic_id}",
                mismatch_details=None if verified else f"Hash mismatch: local={local_proof_hash[:16]}… on_chain={on_chain_hash[:16] if on_chain_hash else 'none'}…",
            )
            self._record(result)
            return result

        # Search recent messages for matching proof hash
        messages = self.fetch_topic_messages(topic_id, limit=50)
        for msg in messages:
            on_chain_hash = self._extract_proof_hash(msg.message_content)
            if on_chain_hash == local_proof_hash:
                result = VerificationResult(
                    task_id=task_id,
                    verified=True,
                    local_hash=local_proof_hash,
                    on_chain_hash=on_chain_hash,
                    topic_id=topic_id,
                    sequence_number=msg.sequence_number,
                    consensus_timestamp=msg.consensus_timestamp,
                    hashscan_url=f"{hashscan_base}/topic/{topic_id}",
                )
                self._record(result)
                return result

        result = VerificationResult(
            task_id=task_id,
            verified=False,
            local_hash=local_proof_hash,
            topic_id=topic_id,
            mismatch_details=f"Proof hash not found in last 50 messages on topic {topic_id}",
        )
        self._record(result)
        return result

    def verify_task_chain(
        self,
        task_id: str,
        receipts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Verify all receipts in a task's proof chain against on-chain data."""
        results = []
        all_verified = True

        for receipt in receipts:
            if receipt.get("mode") == "dry_run":
                results.append({
                    "event_type": receipt.get("event_type", ""),
                    "status": "dry_run",
                    "verified": None,
                })
                continue

            topic_id = receipt.get("topic_id", "")
            if not topic_id:
                results.append({
                    "event_type": receipt.get("event_type", ""),
                    "status": "no_topic",
                    "verified": False,
                })
                all_verified = False
                continue

            vr = self.verify_receipt(
                task_id=task_id,
                local_proof_hash=receipt.get("proof_hash", ""),
                topic_id=topic_id,
                sequence_number=receipt.get("sequence_number"),
            )
            results.append({
                "event_type": receipt.get("event_type", ""),
                "status": "verified" if vr.verified else "failed",
                "verified": vr.verified,
                "hashscan_url": vr.hashscan_url,
                "consensus_timestamp": vr.consensus_timestamp,
            })
            if not vr.verified:
                all_verified = False

        return {
            "task_id": task_id,
            "total_receipts": len(receipts),
            "all_verified": all_verified,
            "results": results,
        }

    def _extract_proof_hash(self, content: Dict[str, Any]) -> Optional[str]:
        """Extract proof_hash from an HCS message payload (handles HIP-993 wrapping)."""
        if "data" in content and "_hip993" in content:
            try:
                inner = json.loads(content["data"]) if isinstance(content["data"], str) else content["data"]
                return inner.get("proof_hash")
            except Exception:
                pass
        return content.get("proof_hash")

    def _record(self, result: VerificationResult):
        if result.verified:
            self._total_verified += 1
        else:
            self._total_failed += 1
        self._verifications.append(result)
        if len(self._verifications) > 2000:
            self._verifications = self._verifications[-1000:]

    def get_verifications(self, task_id: Optional[str] = None, limit: int = 50) -> List[VerificationResult]:
        vrs = self._verifications
        if task_id:
            vrs = [v for v in vrs if v.task_id == task_id]
        return list(reversed(vrs[-limit:]))

    def stats(self) -> Dict[str, Any]:
        return {
            "network": self._network,
            "mirror_url": self._mirror_url,
            "total_verified": self._total_verified,
            "total_failed": self._total_failed,
            "total_requests": self._total_requests,
            "buffered": len(self._verifications),
        }
