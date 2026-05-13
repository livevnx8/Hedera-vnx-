"""
Risk Management Agents — 5 specialists for position sizing, rebalancing,
stop-loss automation, exposure monitoring, and drawdown protection.
"""

import math
import time
from typing import Any, Dict, List

from .base_agent import (
    AgentAction,
    ActionType,
    AgentDomain,
    WorkflowAgent,
    WorkflowOrchestrator,
)


class PositionSizerAgent(WorkflowAgent):
    """
    Kelly criterion + volatility-adjusted position sizing.
    """

    def __init__(self):
        super().__init__("risk_size_001", "Position Sizer", AgentDomain.RISK)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        portfolio_value = context.get("portfolio_value", 100_000_000_000)  # 1000 HBAR
        win_rate = context.get("win_rate", 0.58)
        avg_win = context.get("avg_win_pct", 4.2)
        avg_loss = context.get("avg_loss_pct", 2.8)
        volatility = context.get("volatility", 0.22)
        max_risk_pct = context.get("max_risk_per_trade_pct", 2.0)
        actions: List[AgentAction] = []

        # Kelly criterion
        if avg_loss > 0:
            b = avg_win / avg_loss  # win/loss ratio
            kelly_fraction = (win_rate * b - (1 - win_rate)) / b
        else:
            kelly_fraction = 0

        # Half-Kelly for safety
        half_kelly = max(0, kelly_fraction * 0.5)

        # Volatility adjustment
        vol_adj = max(0.3, 1 - volatility)  # reduce size in high vol
        adjusted_size_pct = min(max_risk_pct, half_kelly * 100 * vol_adj)

        position_size = int(portfolio_value * (adjusted_size_pct / 100))

        # Stop-loss level from volatility
        stop_loss_pct = min(10.0, volatility * 100 * 1.5)

        actions.append(AgentAction(
            action_type=ActionType.RECOMMEND,
            title=f"Position size: {adjusted_size_pct:.2f}% of portfolio",
            description=(
                f"Kelly: {kelly_fraction:.3f} | Half-Kelly: {half_kelly:.3f} | "
                f"Vol-adj: {vol_adj:.2f} | Size: {position_size / 100_000_000:.2f} HBAR | "
                f"Stop-loss: {stop_loss_pct:.1f}%"
            ),
            params={
                "position_size_tinybar": position_size,
                "position_size_pct": round(adjusted_size_pct, 2),
                "kelly_fraction": round(kelly_fraction, 4),
                "half_kelly": round(half_kelly, 4),
                "stop_loss_pct": round(stop_loss_pct, 1),
                "volatility_adjustment": round(vol_adj, 3),
            },
            confidence=0.80,
            urgency="medium",
        ))

        if kelly_fraction < 0:
            actions.append(AgentAction(
                action_type=ActionType.ALERT,
                title="Negative Kelly — edge is negative",
                description="Win rate / win-loss ratio does not justify trading. Stand aside.",
                params={"kelly": round(kelly_fraction, 4)},
                confidence=0.90,
                urgency="critical",
            ))

        return {
            "status": "completed",
            "kelly_fraction": round(kelly_fraction, 4),
            "half_kelly": round(half_kelly, 4),
            "volatility_adjustment": round(vol_adj, 3),
            "position_size_pct": round(adjusted_size_pct, 2),
            "position_size_tinybar": position_size,
            "stop_loss_pct": round(stop_loss_pct, 1),
            "actions": actions,
        }


class PortfolioRebalancerAgent(WorkflowAgent):
    """
    Monitors target allocations, generates rebalance orders when drift exceeds threshold.
    """

    def __init__(self):
        super().__init__("risk_rebal_001", "Portfolio Rebalancer", AgentDomain.RISK)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        holdings = context.get("holdings", self._default_holdings())
        targets = context.get("target_allocations", self._default_targets())
        drift_threshold = context.get("drift_threshold_pct", 5.0)
        actions: List[AgentAction] = []

        total_value = sum(h.get("value", 0) for h in holdings)
        if total_value == 0:
            return {"status": "completed", "message": "Empty portfolio", "actions": []}

        current_alloc: Dict[str, float] = {}
        for h in holdings:
            token = h.get("token", "")
            pct = (h.get("value", 0) / total_value) * 100
            current_alloc[token] = round(pct, 2)

        # Calculate drift
        rebalance_orders = []
        max_drift = 0

        for token, target_pct in targets.items():
            current_pct = current_alloc.get(token, 0)
            drift = current_pct - target_pct
            max_drift = max(max_drift, abs(drift))

            if abs(drift) > drift_threshold:
                # How much to move (in value)
                delta_pct = target_pct - current_pct
                delta_value = int(total_value * (delta_pct / 100))

                rebalance_orders.append({
                    "token": token,
                    "current_pct": current_pct,
                    "target_pct": target_pct,
                    "drift_pct": round(drift, 2),
                    "action": "buy" if delta_value > 0 else "sell",
                    "amount_value": abs(delta_value),
                })

        needs_rebalance = len(rebalance_orders) > 0

        if needs_rebalance:
            actions.append(AgentAction(
                action_type=ActionType.RECOMMEND,
                title=f"Rebalance {len(rebalance_orders)} positions",
                description=(
                    f"Max drift: {max_drift:.1f}% (threshold: {drift_threshold}%) | "
                    f"Orders: {', '.join(f'{o['action']} {o['token']}' for o in rebalance_orders)}"
                ),
                params={
                    "orders": rebalance_orders,
                    "max_drift": round(max_drift, 2),
                },
                confidence=0.82,
                urgency="medium" if max_drift < 15 else "high",
            ))

        return {
            "status": "completed",
            "portfolio_value": total_value,
            "current_allocation": current_alloc,
            "target_allocation": targets,
            "max_drift_pct": round(max_drift, 2),
            "needs_rebalance": needs_rebalance,
            "rebalance_orders": rebalance_orders,
            "actions": actions,
        }

    def _default_holdings(self) -> List[Dict]:
        return [
            {"token": "HBAR", "value": 55_000},
            {"token": "SAUCE", "value": 28_000},
            {"token": "USDC", "value": 12_000},
            {"token": "DOVU", "value": 5_000},
        ]

    def _default_targets(self) -> Dict[str, float]:
        return {"HBAR": 50.0, "SAUCE": 20.0, "USDC": 20.0, "DOVU": 10.0}


class StopLossAutomationAgent(WorkflowAgent):
    """
    Trailing stops, time-based exits, volatility-adjusted stop levels.
    """

    def __init__(self):
        super().__init__("risk_stop_001", "Stop-Loss Automation", AgentDomain.RISK)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        positions = context.get("positions", self._default_positions())
        actions: List[AgentAction] = []

        analyzed = []
        for pos in positions:
            token = pos.get("token", "Unknown")
            entry_price = pos.get("entry_price", 0)
            current_price = pos.get("current_price", 0)
            high_since_entry = pos.get("high_since_entry", current_price)
            volatility = pos.get("volatility", 0.15)
            age_hours = pos.get("age_hours", 0)

            if entry_price <= 0:
                continue

            pnl_pct = ((current_price - entry_price) / entry_price) * 100

            # ATR-style stop (2x volatility from high)
            trailing_stop = high_since_entry * (1 - volatility * 2)
            # Fixed stop at entry - 3x volatility
            fixed_stop = entry_price * (1 - volatility * 3)
            # Time-based exit: reduce tolerance over time
            time_decay = min(1.0, age_hours / 168)  # full decay over 1 week
            time_adjusted_stop = entry_price * (1 - volatility * 3 * (1 - time_decay * 0.5))

            effective_stop = max(trailing_stop, fixed_stop, time_adjusted_stop)
            triggered = current_price <= effective_stop

            entry = {
                "token": token,
                "entry_price": entry_price,
                "current_price": current_price,
                "pnl_pct": round(pnl_pct, 2),
                "trailing_stop": round(trailing_stop, 6),
                "fixed_stop": round(fixed_stop, 6),
                "time_adjusted_stop": round(time_adjusted_stop, 6),
                "effective_stop": round(effective_stop, 6),
                "triggered": triggered,
            }
            analyzed.append(entry)

            if triggered:
                actions.append(AgentAction(
                    action_type=ActionType.EXECUTE,
                    title=f"STOP TRIGGERED: Sell {token}",
                    description=(
                        f"Price {current_price} ≤ stop {effective_stop:.6f} | "
                        f"P&L: {pnl_pct:+.1f}%"
                    ),
                    params={"token": token, "current_price": current_price,
                            "stop_price": effective_stop, "pnl_pct": pnl_pct},
                    confidence=0.95,
                    urgency="critical",
                ))
            elif pnl_pct < -5:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Approaching stop: {token} ({pnl_pct:+.1f}%)",
                    description=f"Stop at {effective_stop:.6f}, current {current_price}",
                    params={"token": token, "pnl_pct": pnl_pct},
                    confidence=0.80,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "positions": analyzed,
            "stops_triggered": sum(1 for a in analyzed if a["triggered"]),
            "actions": actions,
        }

    def _default_positions(self) -> List[Dict]:
        return [
            {"token": "HBAR", "entry_price": 0.085, "current_price": 0.082,
             "high_since_entry": 0.092, "volatility": 0.18, "age_hours": 72},
            {"token": "SAUCE", "entry_price": 0.012, "current_price": 0.0135,
             "high_since_entry": 0.014, "volatility": 0.30, "age_hours": 24},
        ]


class ExposureMonitorAgent(WorkflowAgent):
    """
    Tracks total exposure per token/market, enforces max-position limits.
    """

    def __init__(self):
        super().__init__("risk_exposure_001", "Exposure Monitor", AgentDomain.RISK)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        portfolio_value = context.get("portfolio_value", 100_000)
        positions = context.get("exposure_positions", self._default_positions())
        max_single_pct = context.get("max_single_exposure_pct", 25.0)
        max_correlated_pct = context.get("max_correlated_exposure_pct", 50.0)
        actions: List[AgentAction] = []

        exposures = []
        by_sector: Dict[str, float] = {}

        for pos in positions:
            token = pos.get("token", "Unknown")
            value = pos.get("value", 0)
            sector = pos.get("sector", "crypto")
            pct = (value / max(portfolio_value, 1)) * 100

            exposures.append({
                "token": token,
                "value": value,
                "pct_of_portfolio": round(pct, 2),
                "sector": sector,
                "over_limit": pct > max_single_pct,
            })

            by_sector[sector] = by_sector.get(sector, 0) + pct

            if pct > max_single_pct:
                excess = pct - max_single_pct
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Over-exposed: {token} ({pct:.1f}% > {max_single_pct}%)",
                    description=f"Reduce by ~{excess:.1f}% ({int(value * excess / pct)} value)",
                    params={"token": token, "exposure_pct": pct, "limit": max_single_pct},
                    confidence=0.88,
                    urgency="high",
                ))

        # Correlated sector check
        for sector, total_pct in by_sector.items():
            if total_pct > max_correlated_pct:
                actions.append(AgentAction(
                    action_type=ActionType.ALERT,
                    title=f"Sector concentration: {sector} ({total_pct:.1f}%)",
                    description=f"Exceeds {max_correlated_pct}% correlated limit — diversify",
                    params={"sector": sector, "total_pct": total_pct},
                    confidence=0.82,
                    urgency="high",
                ))

        return {
            "status": "completed",
            "portfolio_value": portfolio_value,
            "exposures": exposures,
            "by_sector": {k: round(v, 2) for k, v in by_sector.items()},
            "violations": sum(1 for e in exposures if e["over_limit"]),
            "actions": actions,
        }

    def _default_positions(self) -> List[Dict]:
        return [
            {"token": "HBAR", "value": 45_000, "sector": "l1"},
            {"token": "SAUCE", "value": 22_000, "sector": "defi"},
            {"token": "USDC", "value": 18_000, "sector": "stablecoin"},
            {"token": "DOVU", "value": 10_000, "sector": "carbon"},
            {"token": "ETH", "value": 5_000, "sector": "l1"},
        ]


class DrawdownProtectorAgent(WorkflowAgent):
    """
    Real-time drawdown tracking, auto-reduces exposure at configurable thresholds.
    """

    def __init__(self):
        super().__init__("risk_drawdown_001", "Drawdown Protector", AgentDomain.RISK)

    def run(self, context: Dict[str, Any] = None) -> Dict[str, Any]:
        context = context or {}
        peak_value = context.get("peak_portfolio_value", 120_000)
        current_value = context.get("current_portfolio_value", 105_000)
        warn_threshold = context.get("drawdown_warn_pct", 10.0)
        critical_threshold = context.get("drawdown_critical_pct", 20.0)
        halt_threshold = context.get("drawdown_halt_pct", 30.0)
        actions: List[AgentAction] = []

        drawdown_pct = ((peak_value - current_value) / max(peak_value, 1)) * 100
        recovery_needed = ((peak_value / max(current_value, 1)) - 1) * 100

        status = "normal"
        if drawdown_pct >= halt_threshold:
            status = "halt"
        elif drawdown_pct >= critical_threshold:
            status = "critical"
        elif drawdown_pct >= warn_threshold:
            status = "warning"

        if status == "halt":
            actions.append(AgentAction(
                action_type=ActionType.EXECUTE,
                title=f"DRAWDOWN HALT: {drawdown_pct:.1f}% — exit all positions",
                description=(
                    f"Portfolio down {drawdown_pct:.1f}% from peak. "
                    f"Need +{recovery_needed:.1f}% to recover. Closing all risk."
                ),
                params={"drawdown_pct": drawdown_pct, "action": "close_all"},
                confidence=0.95,
                urgency="critical",
            ))
        elif status == "critical":
            actions.append(AgentAction(
                action_type=ActionType.EXECUTE,
                title=f"Reduce exposure: drawdown {drawdown_pct:.1f}%",
                description=f"Reduce all positions by 50%. Recovery requires +{recovery_needed:.1f}%.",
                params={"drawdown_pct": drawdown_pct, "action": "reduce_50pct"},
                confidence=0.90,
                urgency="critical",
            ))
        elif status == "warning":
            actions.append(AgentAction(
                action_type=ActionType.ALERT,
                title=f"Drawdown warning: {drawdown_pct:.1f}%",
                description=f"Approaching critical threshold ({critical_threshold}%). Monitor closely.",
                params={"drawdown_pct": drawdown_pct},
                confidence=0.80,
                urgency="high",
            ))

        return {
            "status": "completed",
            "drawdown_status": status,
            "peak_value": peak_value,
            "current_value": current_value,
            "drawdown_pct": round(drawdown_pct, 2),
            "recovery_needed_pct": round(recovery_needed, 2),
            "thresholds": {
                "warn": warn_threshold,
                "critical": critical_threshold,
                "halt": halt_threshold,
            },
            "actions": actions,
        }


def create_risk_orchestrator() -> WorkflowOrchestrator:
    """Create the Risk Management orchestrator with all 5 agents."""
    return WorkflowOrchestrator(
        domain=AgentDomain.RISK,
        agents=[
            PositionSizerAgent(),
            PortfolioRebalancerAgent(),
            StopLossAutomationAgent(),
            ExposureMonitorAgent(),
            DrawdownProtectorAgent(),
        ],
    )
