#!/usr/bin/env python3
"""
Hedera VNX Micro-Specialists - Hedera-specific swarm agents.

Each specialist is a lightweight BitLattice model trained for a specific
Hedera monitoring/alerting task. They run in parallel and report to the
SwarmOrchestrator.
"""

import sys
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

import numpy as np
import torch
import torch.nn.functional as F

from vera_os.paths import add_src_to_path

add_src_to_path()

from starlit.bitlattice_model_pytorch import BitLatticeModelPyTorch
from hedera_connector import HederaConnector
from hedera_agent_toolkit import HederaAgentToolkit

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class BaseVNXSpecialist:
    """Base class for all Hedera VNX micro-specialists."""

    def __init__(self, specialist_id: str, specialization: str):
        self.specialist_id = specialist_id
        self.specialization = specialization
        self.status = "IDLE"
        self.last_run = 0
        self.confidence = 0.0
        self.alert_threshold = 0.7
        self.alert_count = 0

    def run(self) -> Dict[str, Any]:
        """Execute specialist task. Override in subclass."""
        raise NotImplementedError

    def should_alert(self, confidence: float) -> bool:
        """Check if confidence exceeds alert threshold."""
        return confidence >= self.alert_threshold


class HCSConsensusSpecialist(BaseVNXSpecialist):
    """
    Monitors Hedera Consensus Service (HCS) topics for message anomalies.
    Detects: Message floods, stale topics, irregular patterns.
    """

    def __init__(self):
        super().__init__("hcs_consensus_001", "HCS Topic Monitor")
        self.toolkit = HederaAgentToolkit()
        self.monitored_topics = [
            "0.0.1234",  # Example topics
        ]

    def run(self) -> Dict[str, Any]:
        """Monitor HCS topics for anomalies."""
        self.status = "RUNNING"
        start = time.time()

        alerts = []
        total_messages = 0

        for topic_id in self.monitored_topics:
            try:
                result = self.toolkit.hcs_get_messages(topic_id, limit=10)
                msg_count = result.get("count", 0)
                total_messages += msg_count

                # Alert if topic has unexpectedly high activity
                if msg_count > 50:
                    alerts.append({
                        "type": "HIGH_ACTIVITY",
                        "topic": topic_id,
                        "messages": msg_count,
                        "severity": "WARNING"
                    })
            except Exception:
                alerts.append({
                    "type": "UNREACHABLE",
                    "topic": topic_id,
                    "severity": "INFO"
                })

        # Calculate confidence based on data quality
        self.confidence = min(1.0, total_messages / 100)
        self.last_run = time.time()
        self.status = "COMPLETE"

        latency = (time.time() - start) * 1000

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "monitored_topics": len(self.monitored_topics),
            "total_messages": total_messages,
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round(latency, 2),
        }


class HTSTokenSpecialist(BaseVNXSpecialist):
    """
    Monitors HTS token metrics and detects anomalies.
    Detects: Whale movements, supply changes, price volatility.
    """

    def __init__(self):
        super().__init__("hts_token_001", "HTS Token Monitor")
        self.toolkit = HederaAgentToolkit()
        self.monitored_tokens = [
            "0.0.859814",  # Example HTS tokens
        ]

    def run(self) -> Dict[str, Any]:
        """Monitor HTS tokens for anomalies."""
        self.status = "RUNNING"
        start = time.time()

        token_data = []
        alerts = []

        for token_id in self.monitored_tokens:
            try:
                info = self.toolkit.hts_query_token(token_id)
                if "error" not in info:
                    token_data.append({
                        "token_id": token_id,
                        "name": info.get("name", "UNKNOWN"),
                        "symbol": info.get("symbol", ""),
                        "supply": info.get("total_supply", 0),
                        "type": info.get("type", "UNKNOWN"),
                    })

                    # Check for large supply
                    supply = int(info.get("total_supply", 0))
                    if supply > 1_000_000_000_000:
                        alerts.append({
                            "type": "LARGE_SUPPLY",
                            "token": token_id,
                            "supply": supply,
                            "severity": "INFO"
                        })
            except Exception:
                pass

        self.confidence = min(1.0, len(token_data) / max(len(self.monitored_tokens), 1))
        self.last_run = time.time()
        self.status = "COMPLETE"

        latency = (time.time() - start) * 1000

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "tokens_monitored": len(token_data),
            "token_data": token_data,
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round(latency, 2),
        }


class NetworkHealthSpecialist(BaseVNXSpecialist):
    """
    Continuously monitors Hedera network health.
    Detects: Node outages, price anomalies, supply changes.
    """

    def __init__(self):
        super().__init__("network_health_001", "Network Health Monitor")
        self.toolkit = HederaAgentToolkit()
        self.connector = HederaConnector()
        self.price_history = []
        self.node_history = []

    def run(self) -> Dict[str, Any]:
        """Check network health metrics."""
        self.status = "RUNNING"
        start = time.time()

        # Get current metrics
        stats = self.connector.get_network_stats()
        nodes = self.connector.get_network_nodes()
        supply = self.connector.get_network_supply()

        alerts = []

        # Price check
        hbar_price = stats.get("hbar_usd_price", 0)
        self.price_history.append(hbar_price)
        if len(self.price_history) > 10:
            self.price_history.pop(0)

        if len(self.price_history) >= 2:
            price_change = abs(self.price_history[-1] - self.price_history[0]) / max(self.price_history[0], 0.001)
            if price_change > 0.2:  # 20% change
                alerts.append({
                    "type": "PRICE_VOLATILITY",
                    "price": hbar_price,
                    "change_24h": round(price_change, 4),
                    "severity": "WARNING"
                })

        # Node check
        node_count = len(nodes.get("nodes", [])) if nodes else 0
        self.node_history.append(node_count)
        if len(self.node_history) > 10:
            self.node_history.pop(0)

        if node_count < 8:
            alerts.append({
                "type": "LOW_NODE_COUNT",
                "nodes": node_count,
                "severity": "CRITICAL"
            })

        # Supply check
        if "error" not in supply:
            released = int(supply.get("released_supply", 0))
            total = int(supply.get("total_supply", 1))
            ratio = released / total
            if ratio > 0.95:
                alerts.append({
                    "type": "HIGH_SUPPLY_RELEASE",
                    "ratio": round(ratio, 4),
                    "severity": "INFO"
                })

        self.confidence = min(1.0, node_count / 30)
        self.last_run = time.time()
        self.status = "COMPLETE"

        latency = (time.time() - start) * 1000

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "hbar_price": hbar_price,
            "nodes_online": node_count,
            "supply_ratio": round(released/total, 4) if 'total' in dir() else 0,
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round(latency, 2),
        }


class StakingMonitorSpecialist(BaseVNXSpecialist):
    """
    Monitors staking activity and reward distribution.
    Detects: Staking anomalies, reward delays, concentration risks.
    """

    def __init__(self):
        super().__init__("staking_monitor_001", "Staking Monitor")
        self.connector = HederaConnector()
        self.monitored_accounts = ["0.0.3"]

    def run(self) -> Dict[str, Any]:
        """Monitor staking metrics."""
        self.status = "RUNNING"
        start = time.time()

        staking_data = []
        alerts = []

        for account in self.monitored_accounts:
            try:
                info = self.connector.get_staking_info(account)
                if "error" not in info:
                    staking_data.append({
                        "account": account,
                        "staked_node": info.get("staked_node_id", -1),
                        "pending_reward": info.get("pending_reward", 0),
                        "decline_reward": info.get("decline_reward", False),
                    })

                    if info.get("pending_reward", 0) > 1_000_000_000:  # High reward
                        alerts.append({
                            "type": "HIGH_PENDING_REWARD",
                            "account": account,
                            "reward": info["pending_reward"],
                            "severity": "INFO"
                        })
            except Exception:
                pass

        self.confidence = min(1.0, len(staking_data) / max(len(self.monitored_accounts), 1))
        self.last_run = time.time()
        self.status = "COMPLETE"

        latency = (time.time() - start) * 1000

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "accounts_monitored": len(staking_data),
            "staking_data": staking_data,
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round(latency, 2),
        }


class ContractMonitorSpecialist(BaseVNXSpecialist):
    """
    Monitors smart contracts for events and anomalies.
    Detects: Event floods, contract failures, unusual activity.
    """

    def __init__(self):
        super().__init__("contract_monitor_001", "Contract Monitor")
        self.toolkit = HederaAgentToolkit()
        self.monitored_contracts = [
            "0.0.359",
        ]

    def run(self) -> Dict[str, Any]:
        """Monitor smart contracts."""
        self.status = "RUNNING"
        start = time.time()

        contract_data = []
        alerts = []

        for contract_id in self.monitored_contracts:
            try:
                info = self.toolkit.contract_query(contract_id)
                if "error" not in info:
                    contract_data.append({
                        "contract_id": contract_id,
                        "evm_address": info.get("evm_address", ""),
                        "deleted": info.get("deleted", False),
                    })

                    if info.get("deleted", False):
                        alerts.append({
                            "type": "CONTRACT_DELETED",
                            "contract": contract_id,
                            "severity": "WARNING"
                        })
            except Exception:
                pass

        self.confidence = min(1.0, len(contract_data) / max(len(self.monitored_contracts), 1))
        self.last_run = time.time()
        self.status = "COMPLETE"

        latency = (time.time() - start) * 1000

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "contracts_monitored": len(contract_data),
            "contract_data": contract_data,
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round(latency, 2),
        }


class TransactionVolumeSpecialist(BaseVNXSpecialist):
    """
    Monitors network transaction volume and detects anomalies.
    Detects: Volume spikes, congestion, unusual tx patterns.
    """

    def __init__(self):
        super().__init__("tx_volume_001", "Transaction Volume Monitor")
        self.connector = HederaConnector()
        self.volume_history = []

    def run(self) -> Dict[str, Any]:
        """Monitor transaction volume."""
        self.status = "RUNNING"
        start = time.time()

        try:
            tx_data = self.connector.get_network_transactions(limit=100)
            tx_count = len(tx_data.get("transactions", [])) if tx_data else 0
            self.volume_history.append(tx_count)
            if len(self.volume_history) > 10:
                self.volume_history.pop(0)

            alerts = []

            # Detect volume spike
            if len(self.volume_history) >= 2:
                avg = np.mean(self.volume_history[:-1])
                if tx_count > avg * 2:  # 2x average
                    alerts.append({
                        "type": "VOLUME_SPIKE",
                        "current": tx_count,
                        "average": round(avg, 1),
                        "severity": "WARNING"
                    })

            self.confidence = min(1.0, tx_count / 100)

        except Exception:
            tx_count = 0
            alerts = []
            self.confidence = 0.0

        self.last_run = time.time()
        self.status = "COMPLETE"

        latency = (time.time() - start) * 1000

        return {
            "specialist_id": self.specialist_id,
            "specialization": self.specialization,
            "status": self.status,
            "tx_count": tx_count,
            "volume_history": self.volume_history[-5:],
            "alerts": alerts,
            "alert_count": len(alerts),
            "confidence": round(self.confidence, 4),
            "latency_ms": round(latency, 2),
        }


class SwarmOrchestrator:
    """
    Orchestrates all Hedera VNX micro-specialists.

    Coordinates parallel execution, aggregates results,
    and generates swarm-wide health reports.
    """

    def __init__(self):
        self.specialists = [
            HCSConsensusSpecialist(),
            HTSTokenSpecialist(),
            NetworkHealthSpecialist(),
            StakingMonitorSpecialist(),
            ContractMonitorSpecialist(),
            TransactionVolumeSpecialist(),
        ]
        self.total_alerts = 0
        self.swarm_runs = 0

    def run_all(self) -> Dict[str, Any]:
        """Execute all specialists and aggregate results."""
        start = time.time()

        results = []
        alerts = []

        for specialist in self.specialists:
            try:
                result = specialist.run()
                results.append(result)
                alerts.extend(result.get("alerts", []))
            except Exception as e:
                results.append({
                    "specialist_id": specialist.specialist_id,
                    "error": str(e),
                    "status": "FAILED"
                })

        self.total_alerts = len(alerts)
        self.swarm_runs += 1

        # Calculate swarm confidence
        confidences = [r.get("confidence", 0) for r in results if "error" not in r]
        avg_confidence = np.mean(confidences) if confidences else 0

        # Determine overall status
        critical_alerts = sum(1 for a in alerts if a.get("severity") == "CRITICAL")
        warning_alerts = sum(1 for a in alerts if a.get("severity") == "WARNING")

        status = "HEALTHY"
        if critical_alerts > 0:
            status = "CRITICAL"
        elif warning_alerts > 0:
            status = "WARNING"

        latency = (time.time() - start) * 1000

        return {
            "status": status,
            "swarm_runs": self.swarm_runs,
            "specialists_total": len(self.specialists),
            "specialists_active": len([r for r in results if "error" not in r]),
            "avg_confidence": round(avg_confidence, 4),
            "total_alerts": len(alerts),
            "critical_alerts": critical_alerts,
            "warning_alerts": warning_alerts,
            "latency_ms": round(latency, 2),
            "specialist_results": results,
            "alerts": alerts[:10],  # Top 10 alerts
        }

    def get_specialist_types(self) -> List[Dict[str, str]]:
        """Get list of all specialist types."""
        return [
            {"id": s.specialist_id, "type": s.specialization}
            for s in self.specialists
        ]


if __name__ == "__main__":
    print("=" * 60)
    print("HEDERA VNX MICRO-SPECIALISTS")
    print("=" * 60)

    orchestrator = SwarmOrchestrator()

    print(f"\nSpecialist types:")
    for spec in orchestrator.get_specialist_types():
        print(f"  {spec['id']}: {spec['type']}")

    print(f"\nRunning swarm...")
    result = orchestrator.run_all()

    print(f"\nSwarm Result:")
    print(f"  Status: {result['status']}")
    print(f"  Specialists: {result['specialists_active']}/{result['specialists_total']}")
    print(f"  Avg Confidence: {result['avg_confidence']}")
    print(f"  Total Alerts: {result['total_alerts']}")
    print(f"  Critical: {result['critical_alerts']}")
    print(f"  Warning: {result['warning_alerts']}")
    print(f"  Latency: {result['latency_ms']}ms")

    print(f"\nSpecialist Details:")
    for r in result['specialist_results']:
        print(f"  {r['specialist_id']}: {r['specialization']} "
              f"(conf={r.get('confidence', 0):.2f}, "
              f"alerts={r.get('alert_count', 0)})")

    if result['alerts']:
        print(f"\nTop Alerts:")
        for alert in result['alerts'][:5]:
            print(f"  [{alert['severity']}] {alert['type']}: {alert}")

    print("\n" + "=" * 60)
    print(f"HEDERA VNX SWARM: {result['specialists_active']} SPECIALISTS ACTIVE")
    print("=" * 60)
