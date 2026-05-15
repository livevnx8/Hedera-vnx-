"""
Mirror Node Verifier — reads HCS messages from Hiero/Hedera mirror nodes and validates
that local proof hashes match on-chain records.

Uses the public Hiero Mirror Node REST API (Apache-2.0 open source):
  - Hedera mainnet: https://mainnet-public.mirrornode.hedera.com
  - Hedera testnet: https://testnet.mirrornode.hedera.com
  - Hiero community mirrors: see https://hiero.org for node operators

Hiero is the Linux Foundation open-source project governing Hedera's
consensus node, mirror node, and SDK code. Every endpoint here is
free, stateless, and requires no authentication.
"""

import base64
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

logger = logging.getLogger("vera.mirror_verifier")

MIRROR_URLS = {
    "mainnet": [
        "https://mainnet-public.mirrornode.hedera.com",
        "https://mainnet.mirrornode.hedera.com",
    ],
    "testnet": [
        "https://testnet.mirrornode.hedera.com",
    ],
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

    def __repr__(self) -> str:
        return f"OnChainMessage(topic={self.topic_id}, seq={self.sequence_number})"


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

    def __repr__(self) -> str:
        status = "verified" if self.verified else "failed"
        return f"VerificationResult(task={self.task_id}, {status})"


class MirrorVerifier:
    """
    Verifies local proof receipts against Hiero/Hedera mirror node data.
    Uses the open-source Hiero Mirror Node REST API — no SDK or auth required.
    """

    def __init__(
        self,
        network: Optional[str] = None,
        mirror_url: Optional[str] = None,
    ):
        self._network = network or os.environ.get("HEDERA_NETWORK", "testnet").lower()
        # Support single override URL or fallback list from MIRROR_URLS
        override = mirror_url or os.environ.get("MIRROR_NODE_BASE_URL", "")
        if override:
            self._mirror_urls = [override]
        else:
            self._mirror_urls = MIRROR_URLS.get(self._network, MIRROR_URLS["testnet"])
        self._verifications: List[VerificationResult] = []
        self._total_verified: int = 0
        self._total_failed: int = 0
        self._total_requests: int = 0

        logger.info(f"MirrorVerifier initialized: network={self._network}, mirrors={self._mirror_urls}")

    def __repr__(self) -> str:
        return f"MirrorVerifier(network={self._network}, verified={self._total_verified})"

    def _fetch_from_mirror(
        self,
        mirror_url: str,
        topic_id: str,
        params: str,
    ) -> Optional[Dict[str, Any]]:
        """Fetch raw JSON from a single mirror node. Returns None on failure."""
        url = f"{mirror_url}/api/v1/topics/{topic_id}/messages{params}"
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except (URLError, Exception) as e:
            logger.warning(f"Mirror node {mirror_url} failed: {e}")
            return None

    def fetch_topic_messages(
        self,
        topic_id: str,
        limit: int = 25,
        sequence_after: int = 0,
        sequence_exact: Optional[int] = None,
    ) -> List[OnChainMessage]:
        """Fetch recent messages from a topic via Hiero mirror node REST API.
        Tries all configured mirrors in order until one succeeds."""
        if sequence_exact is not None:
            params = f"?sequencenumber={sequence_exact}&limit=1"
        else:
            params = f"?limit={limit}&order=desc"
            if sequence_after > 0:
                params += f"&sequencenumber=gt:{sequence_after}"

        self._total_requests += 1

        # Try each mirror with fallback
        for mirror_url in self._mirror_urls:
            data = self._fetch_from_mirror(mirror_url, topic_id, params)
            if data is not None:
                break
        else:
            logger.error(f"All mirror nodes failed for topic {topic_id}")
            return []

        messages = []
        for msg in data.get("messages", []):
            content = {}
            try:
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

    def verify_receipt(
        self,
        task_id: str,
        local_proof_hash: str,
        topic_id: str,
        sequence_number: Optional[int] = None,
        retries: int = 3,
        retry_delay: float = 5.0,
    ) -> VerificationResult:
        """
        Verify a local proof hash exists on-chain.

        If sequence_number is provided, checks that specific message with retries
        to handle mirror node propagation delay. Otherwise searches recent messages.
        """
        network = self._network
        hashscan_base = f"https://hashscan.io/{network}"

        if sequence_number:
            # Retry loop for mirror node propagation delay
            for attempt in range(retries):
                messages = self.fetch_topic_messages(
                    topic_id, sequence_exact=sequence_number
                )
                target = next(
                    (m for m in messages if m.sequence_number == sequence_number),
                    None,
                )
                if target:
                    break
                if attempt < retries - 1:
                    delay = retry_delay * (2 ** attempt)  # exponential backoff
                    logger.info(
                        f"Sequence {sequence_number} not yet on mirror node, "
                        f"retry {attempt+1}/{retries} in {delay:.0f}s"
                    )
                    time.sleep(delay)

            if not target:
                result = VerificationResult(
                    task_id=task_id,
                    verified=False,
                    local_hash=local_proof_hash,
                    topic_id=topic_id,
                    sequence_number=sequence_number,
                    mismatch_details=(
                        f"Sequence {sequence_number} not found after "
                        f"{retries} retries (mirror propagation)"
                    ),
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
                mismatch_details=None if verified else (
                    f"Hash mismatch: local={local_proof_hash[:16]}… "
                    f"on_chain={on_chain_hash[:16] if on_chain_hash else 'none'}…"
                ),
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

    def verify_by_hash(
        self,
        proof_hash: str,
        topic_id: str,
        sequence_number: Optional[int] = None,
    ) -> VerificationResult:
        """
        Lightweight standalone verification — no task_id or emitter needed.
        Perfect for verifying individual predictions via Hiero mirror node REST API.
        """
        return self.verify_receipt(
            task_id="standalone",
            local_proof_hash=proof_hash,
            topic_id=topic_id,
            sequence_number=sequence_number,
        )

    def stats(self) -> Dict[str, Any]:
        """Return verifier health stats."""
        total = self._total_verified + self._total_failed
        return {
            "network": self._network,
            "mirror_nodes": self._mirror_urls,
            "total_verified": self._total_verified,
            "total_failed": self._total_failed,
            "total_requests": self._total_requests,
            "success_rate": round(self._total_verified / max(total, 1), 4),
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

