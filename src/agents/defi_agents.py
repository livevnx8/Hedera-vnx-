"""
DeFi Operations Agents — 5 specialists for yield, swaps, LP management, and fees.

These agents monitor SaucerSwap/HeliSwap pools, track LP positions,
optimize swap routing, and harvest accrued fees.
"""

import hashlib
import math
import random
import time
from typing import Any, Dict, List

from .base_agent import (
    AgentAction,
    ActionType,
    AgentDomain,
    WorkflowAgent,
    WorkflowOrchestrator,
)


class YieldOptimizerAgent(WorkflowAgent):
    """
    Scans DEX pools, ranks by risk-adjusted APY, factors in impermanent loss.
    """

    def __init__(self):
        super().__init__("defi_yield_001", "Yield Optimizer", AgentDomain.DEFI)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        pools = context.get("pools", self._default_pools())
        user_balance = context.get("user_balance", 100_000_000_000)  # 1000 HBAR

        ranked = []
        actions: List[AgentAction] = []

        for pool in pools:
            tvl = pool.get("tvl", 0)
            apr = pool.get("apr", 0)
            volume_24h = pool.get("volume_24h", 0)

            # IL risk estimate (higher for volatile pairs)
            volatility = pool.get("volatility", 0.15)
            il_risk = min(1.0, volatility * 2.5)

            # Risk-adjusted yield
            risk_adjusted_apy = apr * (1 - il_risk * 0.3)

            # Utilization = volume / tvl
            utilization = (volume_24h / max(tvl, 1)) * 100

            score = risk_adjusted_apy * (1 + utilization / 100)

            ranked.append({
                "pool": pool.get("name", "Unknown"),
                "token_pair": pool.get("pair", "?/?"),
                "tvl": tvl,
                "apr": round(apr, 2),
                "risk_adjusted_apy": round(risk_adjusted_apy, 2),
                "il_risk": round(il_risk, 3),
                "utilization_pct": round(utilization, 1),
                "score": round(score, 3),
            })

        ranked.sort(key=lambda x: x["score"], reverse=True)

        if ranked:
            best = ranked[0]
            allocation = min(user_balance, int(user_balance * 0.3))  # max 30%
            actions.append(AgentAction(
                action_type=ActionType.RECOMMEND,
                title=f"Deposit into {best['pool']}",
                description=(
                    f"Best risk-adjusted yield: {best['risk_adjusted_apy']}% APY "
                    f"(IL risk {best['il_risk']:.1%}). "
                    f"Recommended allocation: {allocation / 100_000_000:.2f} HBAR"
                ),
                params={
                    "pool": best["pool"],
                    "pair": best["token_pair"],
                    "amount": allocation,
                    "risk_adjusted_apy": best["risk_adjusted_apy"],
                },
                confidence=0.78,
                urgency="medium",
            ))

            # Alert on high-risk pools
            for p in ranked:
                if p["il_risk"] > 0.7:
                    actions.append(AgentAction(
                        action_type=ActionType.ALERT,
                        title=f"High IL risk: {p['pool']}",
                        description=f"Impermanent loss risk {p['il_risk']:.1%} — avoid or hedge",
                        params={"pool": p["pool"], "il_risk": p["il_risk"]},
                        confidence=0.85,
                        urgency="high",
                    ))

        return {
            "status": "completed",
            "ranked_pools": ranked[:10],
            "total_pools_analyzed": len(pools),
            "actions": actions,
        }

    def _default_pools(self) -> List[Dict]:
        return [
            {"name": "HBAR/USDC", "pair": "HBAR/USDC", "tvl": 5_200_000, "apr": 12.5, "volume_24h": 820_000, "volatility": 0.18},
            {"name": "HBAR/SAUCE", "pair": "HBAR/SAUCE", "tvl": 2_100_000, "apr": 28.3, "volume_24h": 340_000, "volatility": 0.35},
            {"name": "HBAR/DOVU", "pair": "HBAR/DOVU", "tvl": 450_000, "apr": 45.0, "volume_24h": 60_000, "volatility": 0.55},
            {"name": "USDC/USDT", "pair": "USDC/USDT", "tvl": 8_000_000, "apr": 3.2, "volume_24h": 1_500_000, "volatility": 0.01},
            {"name": "SAUCE/USDC", "pair": "SAUCE/USDC", "tvl": 1_800_000, "apr": 18.7, "volume_24h": 250_000, "volatility": 0.30},
        ]


class SwapRouterAgent(WorkflowAgent):
    """
    Finds optimal swap path, estimates slippage, recommends timing.
    """

    def __init__(self):
        super().__init__("defi_swap_001", "Swap Router", AgentDomain.DEFI)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        from_token = context.get("from_token", "HBAR")
        to_token = context.get("to_token", "USDC")
        amount = context.get("swap_amount", 10_000_000_000)  # 100 HBAR

        actions: List[AgentAction] = []

        # Simulate route finding
        routes = self._find_routes(from_token, to_token, amount)
        routes.sort(key=lambda r: r["output_amount"], reverse=True)

        if routes:
            best = routes[0]
            actions.append(AgentAction(
                action_type=ActionType.RECOMMEND,
                title=f"Swap {from_token} → {to_token} via {best['path']}",
                description=(
                    f"Best route: {best['path']} | "
                    f"Output: {best['output_amount'] / 100_000_000:.4f} {to_token} | "
                    f"Slippage: {best['slippage_pct']:.2f}% | "
                    f"Price impact: {best['price_impact_pct']:.3f}%"
                ),
                params={
                    "path": best["path"],
                    "output_amount": best["output_amount"],
                    "slippage_pct": best["slippage_pct"],
                    "price_impact_pct": best["price_impact_pct"],
                },
                confidence=0.82,
                urgency="medium" if best["slippage_pct"] < 1.0 else "high",
            ))

            # Warn on high slippage
            if best["slippage_pct"] > 2.0:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title="High slippage warning",
                    description=f"Best route has {best['slippage_pct']:.2f}% slippage — consider splitting order",
                    params={"slippage_pct": best["slippage_pct"]},
                    confidence=0.90,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "from_token": from_token,
            "to_token": to_token,
            "amount": amount,
            "routes": routes,
            "best_route": routes[0] if routes else None,
            "actions": actions,
        }

    def _find_routes(self, from_t: str, to_t: str, amount: int) -> List[Dict]:
        base_price = 0.085  # HBAR/USDC
        hbar_amount = amount / 100_000_000

        return [
            {
                "path": f"{from_t} → {to_t} (direct)",
                "hops": 1,
                "output_amount": int(hbar_amount * base_price * 0.997 * 100_000_000),
                "slippage_pct": round(0.3 + (hbar_amount / 10000) * 0.1, 2),
                "price_impact_pct": round(hbar_amount / 50000 * 0.5, 3),
            },
            {
                "path": f"{from_t} → SAUCE → {to_t}",
                "hops": 2,
                "output_amount": int(hbar_amount * base_price * 0.994 * 100_000_000),
                "slippage_pct": round(0.6 + (hbar_amount / 10000) * 0.15, 2),
                "price_impact_pct": round(hbar_amount / 50000 * 0.3, 3),
            },
        ]


class LPPositionManagerAgent(WorkflowAgent):
    """
    Tracks LP positions, monitors impermanent loss, suggests rebalance or exit.
    """

    def __init__(self):
        super().__init__("defi_lp_001", "LP Position Manager", AgentDomain.DEFI)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        positions = context.get("lp_positions", self._default_positions())
        actions: List[AgentAction] = []

        analyzed = []
        for pos in positions:
            initial_value = pos.get("initial_value", 0)
            current_value = pos.get("current_value", 0)
            fees_earned = pos.get("fees_earned", 0)
            price_ratio_change = pos.get("price_ratio_change", 0)

            # IL calculation (simplified)
            r = 1 + price_ratio_change
            il_pct = (2 * math.sqrt(r) / (1 + r) - 1) * 100 if r > 0 else 0

            net_pnl = current_value - initial_value + fees_earned
            net_pnl_pct = (net_pnl / max(initial_value, 1)) * 100

            entry = {
                "pool": pos.get("pool", "Unknown"),
                "initial_value": initial_value,
                "current_value": current_value,
                "fees_earned": fees_earned,
                "il_pct": round(il_pct, 2),
                "net_pnl": net_pnl,
                "net_pnl_pct": round(net_pnl_pct, 2),
                "age_days": pos.get("age_days", 0),
            }
            analyzed.append(entry)

            # Action recommendations
            if il_pct < -5:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Heavy IL on {pos['pool']}: {il_pct:.1f}%",
                    description=f"Consider exiting — net P&L: {net_pnl_pct:.1f}%",
                    params={"pool": pos["pool"], "il_pct": il_pct, "net_pnl_pct": net_pnl_pct},
                    confidence=0.80,
                    urgency="high",
                ))
            elif net_pnl_pct > 15:
                actions.append(AgentAction(
                    action_type=ActionType.RECOMMEND,
                    title=f"Take profit on {pos['pool']}",
                    description=f"Net P&L: +{net_pnl_pct:.1f}% — consider partial exit",
                    params={"pool": pos["pool"], "net_pnl_pct": net_pnl_pct},
                    confidence=0.72,
                    urgency="medium",
                ))

        return {
            "status": "completed",
            "positions": analyzed,
            "total_positions": len(analyzed),
            "total_pnl": sum(p["net_pnl"] for p in analyzed),
            "actions": actions,
        }

    def _default_positions(self) -> List[Dict]:
        return [
            {"pool": "HBAR/USDC", "initial_value": 10000, "current_value": 10350,
             "fees_earned": 420, "price_ratio_change": 0.15, "age_days": 30},
            {"pool": "HBAR/SAUCE", "initial_value": 5000, "current_value": 4200,
             "fees_earned": 580, "price_ratio_change": -0.25, "age_days": 45},
        ]


class PoolHealthMonitorAgent(WorkflowAgent):
    """
    Monitors pool TVL changes, liquidity depth, whale concentration.
    """

    def __init__(self):
        super().__init__("defi_pool_001", "Pool Health Monitor", AgentDomain.DEFI)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        pools = context.get("pools", self._default_pools())
        actions: List[AgentAction] = []

        analyzed = []
        for pool in pools:
            tvl = pool.get("tvl", 0)
            tvl_24h_change = pool.get("tvl_24h_change_pct", 0)
            whale_pct = pool.get("whale_concentration_pct", 0)
            utilization = pool.get("utilization_pct", 0)

            health_score = 100
            if tvl_24h_change < -10:
                health_score -= 30
            if whale_pct > 60:
                health_score -= 25
            if tvl < 100_000:
                health_score -= 20
            if utilization < 5:
                health_score -= 15

            entry = {
                "pool": pool.get("name", "Unknown"),
                "tvl": tvl,
                "tvl_24h_change_pct": tvl_24h_change,
                "whale_concentration_pct": whale_pct,
                "utilization_pct": utilization,
                "health_score": max(0, health_score),
            }
            analyzed.append(entry)

            if tvl_24h_change < -15:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"TVL drain: {pool['name']} ({tvl_24h_change:+.1f}%)",
                    description=f"Significant liquidity leaving pool — whale exit possible",
                    params={"pool": pool["name"], "tvl_change": tvl_24h_change},
                    confidence=0.85,
                    urgency="critical",
                ))
            if whale_pct > 70:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Whale concentration: {pool['name']} ({whale_pct:.0f}%)",
                    description=f"Single entity controls >70% of pool — rug risk",
                    params={"pool": pool["name"], "whale_pct": whale_pct},
                    confidence=0.80,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "pools": analyzed,
            "avg_health": round(sum(p["health_score"] for p in analyzed) / max(len(analyzed), 1), 1),
            "actions": actions,
        }

    def _default_pools(self) -> List[Dict]:
        return [
            {"name": "HBAR/USDC", "tvl": 5_200_000, "tvl_24h_change_pct": 2.3, "whale_concentration_pct": 35, "utilization_pct": 15.8},
            {"name": "HBAR/SAUCE", "tvl": 2_100_000, "tvl_24h_change_pct": -8.1, "whale_concentration_pct": 48, "utilization_pct": 16.2},
            {"name": "HBAR/DOVU", "tvl": 450_000, "tvl_24h_change_pct": -22.5, "whale_concentration_pct": 72, "utilization_pct": 13.3},
        ]


class FeeHarvesterAgent(WorkflowAgent):
    """
    Tracks accrued fees across LP positions, recommends claim timing.
    """

    def __init__(self):
        super().__init__("defi_fees_001", "Fee Harvester", AgentDomain.DEFI)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        positions = context.get("fee_positions", self._default_positions())
        gas_cost = context.get("gas_cost_tinybar", 500_000)  # 0.005 HBAR
        actions: List[AgentAction] = []

        total_pending = 0
        harvest_ready = []

        for pos in positions:
            pending = pos.get("pending_fees", 0)
            total_pending += pending

            roi_on_harvest = (pending - gas_cost) / max(gas_cost, 1)

            entry = {
                "pool": pos.get("pool", "Unknown"),
                "pending_fees": pending,
                "gas_cost": gas_cost,
                "roi_on_harvest": round(roi_on_harvest, 2),
                "worth_claiming": roi_on_harvest > 5,  # >5x gas cost
            }

            if entry["worth_claiming"]:
                harvest_ready.append(entry)

        if harvest_ready:
            total_harvestable = sum(h["pending_fees"] for h in harvest_ready)
            actions.append(AgentAction(
                action_type=ActionType.RECOMMEND,
                title=f"Harvest fees from {len(harvest_ready)} pools",
                description=(
                    f"Total harvestable: {total_harvestable / 100_000_000:.4f} HBAR "
                    f"across {len(harvest_ready)} pools"
                ),
                params={
                    "pools": [h["pool"] for h in harvest_ready],
                    "total_harvestable": total_harvestable,
                },
                confidence=0.88,
                urgency="low",
            ))

        return {
            "status": "completed",
            "total_pending_fees": total_pending,
            "harvest_ready": harvest_ready,
            "gas_cost": gas_cost,
            "actions": actions,
        }

    def _default_positions(self) -> List[Dict]:
        return [
            {"pool": "HBAR/USDC", "pending_fees": 15_000_000},
            {"pool": "HBAR/SAUCE", "pending_fees": 8_500_000},
            {"pool": "USDC/USDT", "pending_fees": 250_000},
        ]


def create_defi_orchestrator() -> WorkflowOrchestrator:
    """Create the DeFi operations orchestrator with all 5 agents."""
    return WorkflowOrchestrator(
        domain=AgentDomain.DEFI,
        agents=[
            YieldOptimizerAgent(),
            SwapRouterAgent(),
            LPPositionManagerAgent(),
            PoolHealthMonitorAgent(),
            FeeHarvesterAgent(),
        ],
    )
