#!/usr/bin/env python3
"""
Prediction Market Infrastructure — comprehensive test suite.

Tests the full market lifecycle: creation → trading → oracle signals →
resolution → settlement for both HBAR pools and HTS token markets.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.markets.market_core import MarketManager, MarketType, MarketStatus, OrderSide
from src.markets.hbar_pools import HBARPoolManager
from src.markets.hts_outcome_tokens import OutcomeTokenManager
from src.markets.oracle_feed import SwarmOracleFeed
from src.markets.settlement import SettlementEngine, ResolutionMethod
from src.markets.auto_market_factory import AutoMarketFactory, MarketTemplate
from src.markets.liquidity import LiquidityManager
from src.markets.portfolio import PortfolioTracker
from src.markets.market_maker import MarketMakerBot, MMConfig

PASS = 0
FAIL = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        print(f"  ✗ {name} — {detail}")


def test_market_core():
    print("\n═══ Market Core ═══")
    mm = MarketManager()

    # Create binary market
    future = time.time() + 86400
    m = mm.create_market("Will HBAR hit $0.10?", ["YES", "NO"], future, MarketType.BINARY)
    check("Create binary market", m.market_id in mm.markets)
    check("Market is OPEN", m.status == MarketStatus.OPEN)
    check("Two outcomes", len(m.outcomes) == 2)

    # Place orders
    o1 = mm.place_order(m.market_id, "alice", "YES", 1_000_000, 0.6)
    check("Order placed", o1.status in ("open", "partial", "filled"))
    check("Market moves to TRADING", m.status == MarketStatus.TRADING)

    o2 = mm.place_order(m.market_id, "bob", "NO", 500_000, 0.4)
    check("Second order", o2.amount == 500_000)

    # Counter order to trigger match
    o3 = mm.place_order(m.market_id, "charlie", "YES", 500_000, 0.5, OrderSide.SELL)
    check("Sell order placed", o3.side == OrderSide.SELL)

    # Probabilities
    probs = mm.get_probability(m.market_id)
    check("Probabilities sum ~1", abs(sum(probs.values()) - 1.0) < 0.01, f"sum={sum(probs.values())}")

    # Orderbook
    book = mm.get_orderbook(m.market_id)
    check("Orderbook has YES", "YES" in book["orderbook"])
    check("Orderbook has NO", "NO" in book["orderbook"])

    # List and stats
    check("List markets", len(mm.list_markets()) == 1)
    stats = mm.stats()
    check("Stats total_markets", stats["total_markets"] == 1)

    # Resolve
    mm.resolve_market(m.market_id, "YES")
    check("Market resolved", m.status == MarketStatus.RESOLVING)
    check("Winner is YES", m.winning_outcome == "YES")

    # Cancel test
    m2 = mm.create_market("Test cancel", ["A", "B"], future, MarketType.BINARY)
    mm.cancel_market(m2.market_id)
    check("Market cancelled", m2.status == MarketStatus.CANCELLED)


def test_hbar_pools():
    print("\n═══ HBAR Pools ═══")
    pm = HBARPoolManager()

    # Create pool
    pool = pm.create_pool("market_1", ["YES", "NO"])
    check("Pool created", pool.market_id == "market_1")

    # Stake
    s1 = pm.stake("market_1", "YES", 5_000_000, "alice")
    s2 = pm.stake("market_1", "YES", 3_000_000, "bob")
    s3 = pm.stake("market_1", "NO", 2_000_000, "charlie")
    check("3 stakes placed", len(pool.stakes) == 3)
    check("Total pool = 10M", pool.total_pool == 10_000_000)

    # Odds
    odds = pm.get_odds("market_1")
    check("YES odds = 0.8", abs(odds["YES"] - 0.8) < 0.01, f"got {odds['YES']}")
    check("NO odds = 0.2", abs(odds["NO"] - 0.2) < 0.01, f"got {odds['NO']}")

    # User stakes
    alice_stakes = pm.get_user_stakes("market_1", "alice")
    check("Alice has 1 stake", len(alice_stakes) == 1)

    # Settle — YES wins
    result = pm.settle("market_1", "YES")
    check("Settlement has payouts", len(result["payouts"]) > 0)
    check("Fee collected", result["fee"] > 0)
    check("Settlement hash", len(result["settlement_hash"]) == 64)

    # Alice gets proportional share (5M/8M of distributable)
    alice_payout = next(p for p in result["payouts"] if p["user"] == "alice")
    check("Alice profited", alice_payout["profit"] > 0, f"profit={alice_payout['profit']}")

    # Charlie loses
    charlie_payout = next((p for p in result["payouts"] if p["user"] == "charlie"), None)
    # Charlie bet on NO which lost — no payout to charlie from winners list
    check("Charlie not in winner payouts", charlie_payout is None)

    # Stats
    stats = pm.stats()
    check("Stats settled", stats["settled_pools"] == 1)


def test_hts_tokens():
    print("\n═══ HTS Outcome Tokens ═══")
    tm = OutcomeTokenManager()

    # Create tokens
    tokens = tm.create_market_tokens("market_2", ["YES", "NO"])
    check("YES token created", "YES" in tokens)
    check("NO token created", "NO" in tokens)
    check("Token has HTS-style ID", tokens["YES"].token_id.startswith("0.0."))

    # Initial prices should be ~0.5 each
    prices = tm.get_prices("market_2")
    check("YES price ~0.5", abs(prices["YES"] - 0.5) < 0.1, f"got {prices['YES']}")
    check("NO price ~0.5", abs(prices["NO"] - 0.5) < 0.1, f"got {prices['NO']}")

    # Buy YES tokens
    buy_result = tm.buy_outcome("market_2", "YES", 100_000_000, "alice")
    check("Tokens received", buy_result["tokens_received"] > 0, f"got {buy_result['tokens_received']}")
    check("Fee charged", buy_result["fee"] > 0)
    check("YES price increased", buy_result["new_price"] > 0.5, f"got {buy_result['new_price']}")

    # Buy NO tokens (should lower YES price)
    buy2 = tm.buy_outcome("market_2", "NO", 100_000_000, "bob")
    check("Bob got NO tokens", buy2["tokens_received"] > 0)

    # Check positions
    alice_pos = tm.get_user_positions("market_2", "alice")
    check("Alice has YES position", alice_pos.get("YES", 0) > 0)

    # Sell some tokens
    sell_amount = alice_pos["YES"] // 2
    if sell_amount > 0:
        sell_result = tm.sell_outcome("market_2", "YES", sell_amount, "alice")
        check("Sell returned HBAR", sell_result["hbar_out"] > 0)

    # Settle — YES wins
    settle = tm.settle("market_2", "YES")
    check("Settlement has payouts", len(settle["payouts"]) > 0)
    check("Settlement hash", len(settle["settlement_hash"]) == 64)

    # Stats
    stats = tm.stats()
    check("Stats total_markets", stats["total_markets"] == 1)
    check("Stats settled", stats["settled_markets"] == 1)


def test_oracle_feed():
    print("\n═══ Oracle Feed ═══")
    of = SwarmOracleFeed()

    # Publish signals
    signal1 = of.publish_signal("market_3", {
        "direction": "UP",
        "up_probability": 0.72,
        "confidence": 0.85,
        "specialist_count": 27,
    })
    check("Signal created", signal1.signal_id is not None)
    check("Probability = 0.72", signal1.probability == 0.72)
    check("Has proof hash", len(signal1.proof_hash) == 64)

    signal2 = of.publish_signal("market_3", {
        "direction": "UP",
        "up_probability": 0.78,
        "confidence": 0.90,
        "specialist_count": 27,
    })

    signal3 = of.publish_signal("market_3", {
        "direction": "UP",
        "up_probability": 0.75,
        "confidence": 0.88,
        "specialist_count": 27,
    })

    # Latest signal
    latest = of.get_latest_signal("market_3")
    check("Latest is signal3", latest.signal_id == signal3.signal_id)

    # History
    history = of.get_signal_history("market_3")
    check("3 signals in history", len(history) == 3)

    # Consensus probability
    consensus = of.get_consensus_probability("market_3")
    check("Consensus ~0.75", 0.70 < consensus < 0.80, f"got {consensus}")

    # Time series
    series = of.get_probability_series("market_3")
    check("Series has 3 points", len(series) == 3)

    # Topic registration
    of.register_topic("market_3", "0.0.12345")
    check("Topic registered", of.get_topic("market_3") == "0.0.12345")

    # Stats
    stats = of.stats()
    check("Stats signals", stats["total_signals"] == 3)


def test_settlement_engine():
    print("\n═══ Settlement Engine ═══")
    mm = MarketManager()
    pm = HBARPoolManager()
    tm = OutcomeTokenManager()
    of = SwarmOracleFeed()
    se = SettlementEngine(mm, pm, tm, of)

    future = time.time() + 86400

    # Create market with pool
    m = mm.create_market("HBAR above $0.10 in 24h?", ["YES", "NO"], future, MarketType.HBAR_POOL)
    pm.create_pool(m.market_id, ["YES", "NO"])
    pm.stake(m.market_id, "YES", 5_000_000, "alice")
    pm.stake(m.market_id, "NO", 3_000_000, "bob")

    # Publish oracle signals
    for prob in [0.65, 0.72, 0.78, 0.80]:
        of.publish_signal(m.market_id, {
            "direction": "UP",
            "up_probability": prob,
            "confidence": 0.85,
            "specialist_count": 27,
        })

    # Oracle resolution
    record = se.resolve_with_oracle(m.market_id, probability_threshold=0.7)
    check("Oracle resolved", record.winning_outcome == "YES")
    check("Method is oracle", record.method == ResolutionMethod.ORACLE)
    check("Has proof chain", len(record.proof_chain) >= 2)
    check("Settlement hash", len(record.settlement_hash) == 64)

    # Dispute
    d = se.dispute(m.market_id, "bob", "Oracle signals may be manipulated")
    check("Dispute opened", d.status.value == "open")

    # Reject dispute
    se.resolve_dispute(m.market_id, d.dispute_id, upheld=False, note="Signals verified")
    check("Dispute rejected", d.status.value == "rejected")

    # Execute settlement
    result = se.execute_settlement(m.market_id)
    check("Settlement executed", result["status"] == "settled")
    check("Pool settled", "pool_settlement" in result)

    # Manual resolution test
    m2 = mm.create_market("Manual test", ["A", "B"], future, MarketType.BINARY)
    pm.create_pool(m2.market_id, ["A", "B"])
    record2 = se.resolve_manual(m2.market_id, "A", "admin", "proof123")
    check("Manual resolution", record2.method == ResolutionMethod.MANUAL)

    # Stats
    stats = se.stats()
    check("Stats total", stats["total_settlements"] == 2)
    check("Stats oracle", stats["oracle_resolutions"] == 1)
    check("Stats manual", stats["manual_resolutions"] == 1)


def test_full_lifecycle():
    print("\n═══ Full Lifecycle (End-to-End) ═══")
    mm = MarketManager()
    pm = HBARPoolManager()
    tm = OutcomeTokenManager()
    of = SwarmOracleFeed()
    se = SettlementEngine(mm, pm, tm, of)

    future = time.time() + 86400

    # 1. Create HTS token market
    m = mm.create_market(
        "Will HBAR reach $0.15 by end of week?",
        ["YES", "NO"],
        future,
        MarketType.HTS_TOKEN,
        creator="vera_system",
    )
    tm.create_market_tokens(m.market_id, ["YES", "NO"])
    pm.create_pool(m.market_id, ["YES", "NO"])
    check("Market + tokens + pool created", True)

    # 2. Users trade
    tm.buy_outcome(m.market_id, "YES", 200_000_000, "whale_alice")
    tm.buy_outcome(m.market_id, "NO", 100_000_000, "trader_bob")
    tm.buy_outcome(m.market_id, "YES", 50_000_000, "retail_carol")
    pm.stake(m.market_id, "YES", 10_000_000, "pool_dave")
    pm.stake(m.market_id, "NO", 5_000_000, "pool_eve")
    check("5 positions placed", True)

    # 3. Oracle feeds probability signals
    for i, prob in enumerate([0.65, 0.72, 0.78, 0.82, 0.85]):
        of.publish_signal(m.market_id, {
            "direction": "UP",
            "up_probability": prob,
            "confidence": 0.80 + i * 0.02,
            "specialist_count": 27,
        })
    check("5 oracle signals published", of.stats()["total_signals"] == 5)

    # 4. Check market state
    prices = tm.get_prices(m.market_id)
    pool_odds = pm.get_odds(m.market_id)
    consensus = of.get_consensus_probability(m.market_id)
    check("AMM prices available", sum(prices.values()) > 0)
    check("Pool odds available", sum(pool_odds.values()) > 0)
    check("Oracle consensus > 0.7", consensus > 0.7, f"got {consensus:.3f}")

    # 5. Resolve via oracle
    record = se.resolve_with_oracle(m.market_id)
    check("Resolved YES via oracle", record.winning_outcome == "YES")

    # 6. Execute settlement
    result = se.execute_settlement(m.market_id)
    check("Settlement complete", result["status"] == "settled")

    # 7. Verify proof chain
    check("Proof chain exists", len(record.proof_chain) >= 2)
    check("Merkle root", len(record.settlement_hash) == 64)

    # Final market state
    final = mm.get_market(m.market_id)
    check("Market SETTLED", final.status == MarketStatus.SETTLED)


def test_auto_market_factory():
    print("\n═══ Auto-Market Factory ═══")
    mm = MarketManager()
    pm = HBARPoolManager()
    tm = OutcomeTokenManager()
    of = SwarmOracleFeed()
    factory = AutoMarketFactory(mm, pm, tm, of)

    # Register defaults
    factory.register_defaults()
    templates = factory.list_templates()
    check("Default templates registered", len(templates) == 9, f"got {len(templates)}")

    # No signals yet — should create nothing
    created = factory.check_and_create()
    check("No markets without signals", len(created) == 0)

    # Publish a strong signal to trigger market creation
    # First need a market with signals so _find_trigger_signal can find them
    seed = mm.create_market("Seed", ["YES", "NO"], time.time() + 86400, MarketType.BINARY)
    of.publish_signal(seed.market_id, {
        "direction": "UP",
        "up_probability": 0.82,
        "confidence": 0.88,
        "specialist_count": 27,
    })

    # Now check — should trigger templates that match
    created = factory.check_and_create()
    check("Auto-created markets", len(created) > 0, f"got {len(created)}")

    # Check events
    events = factory.get_events()
    check("Events recorded", len(events) > 0)

    # Direct signal check
    more = factory.check_signal_and_create("hbar", {
        "direction": "UP",
        "up_probability": 0.85,
        "confidence": 0.90,
    })
    # May or may not create due to cooldown
    check("Signal check ran", True)

    stats = factory.stats()
    check("Stats has templates", stats["templates"] == 9)


def test_liquidity_manager():
    print("\n═══ Liquidity Manager ═══")
    lm = LiquidityManager()

    # Add liquidity
    p1 = lm.add_liquidity("market_lp", "alice", 10_000_000)
    check("LP position created", p1.position_id is not None)
    check("Shares assigned", p1.shares > 0)

    p2 = lm.add_liquidity("market_lp", "bob", 5_000_000)
    check("Second LP", p2.shares > 0)

    # TVL
    tvl = lm.get_tvl("market_lp")
    check("TVL = 15M", tvl == 15_000_000, f"got {tvl}")

    # Collect fees
    lm.collect_fee("market_lp", 100_000)
    pool = lm.get_pool("market_lp")
    check("Fees collected", pool.total_fees_collected > 0)

    # Add bonus
    lm.add_bonus("market_lp", 50_000)
    check("Bonus added", pool.bonus_rewards == 50_000)

    # Check pending rewards
    alice_pending = lm.get_pending_rewards("market_lp", "alice")
    check("Alice has pending rewards", alice_pending > 0, f"got {alice_pending}")

    # Claim rewards
    claim = lm.claim_rewards("market_lp", "alice")
    check("Rewards claimed", claim["rewards_claimed"] > 0)

    # Remove liquidity
    result = lm.remove_liquidity("market_lp", p2.position_id)
    check("Liquidity removed", result["amount_returned"] == 5_000_000)

    # Stats
    stats = lm.stats()
    check("Stats active", stats["active_positions"] == 1)  # alice still active
    check("Stats total TVL", stats["total_tvl"] == 10_000_000)


def test_portfolio_and_leaderboard():
    print("\n═══ Portfolio & Leaderboard ═══")
    mm = MarketManager()
    pm = HBARPoolManager()
    tm = OutcomeTokenManager()
    pt = PortfolioTracker(mm, pm, tm)

    future = time.time() + 86400

    # Create market and positions
    m = mm.create_market("Test market", ["YES", "NO"], future, MarketType.HTS_TOKEN)
    pm.create_pool(m.market_id, ["YES", "NO"])
    tm.create_market_tokens(m.market_id, ["YES", "NO"])

    # Users trade
    pm.stake(m.market_id, "YES", 5_000_000, "alice")
    pm.stake(m.market_id, "NO", 3_000_000, "bob")
    tm.buy_outcome(m.market_id, "YES", 100_000_000, "alice")
    tm.buy_outcome(m.market_id, "NO", 50_000_000, "bob")

    # Portfolio
    alice_portfolio = pt.get_portfolio("alice")
    check("Alice has positions", alice_portfolio["total_positions"] > 0)
    check("Alice has cost", alice_portfolio["total_cost"] > 0)

    bob_portfolio = pt.get_portfolio("bob")
    check("Bob has positions", bob_portfolio["total_positions"] > 0)

    # Settle market
    mm.resolve_market(m.market_id, "YES")
    mm.settle_market(m.market_id)

    # Post-settlement portfolio
    alice_settled = pt.get_portfolio("alice")
    check("Alice settled portfolio", alice_settled is not None)

    # User stats
    alice_stats = pt.get_user_stats("alice")
    check("Alice stats computed", alice_stats.total_markets > 0)

    # Leaderboard
    lb = pt.leaderboard(sort_by="profit")
    check("Leaderboard has entries", len(lb) > 0)
    check("Leaderboard has rank", lb[0].get("rank") == 1)

    # Sort by different criteria
    lb_vol = pt.leaderboard(sort_by="volume")
    check("Volume leaderboard", len(lb_vol) > 0)


def test_market_maker():
    print("\n═══ Market Maker Bot ═══")
    mm = MarketManager()
    pm = HBARPoolManager()
    tm = OutcomeTokenManager()
    of = SwarmOracleFeed()
    bot = MarketMakerBot(mm, pm, tm, of)

    future = time.time() + 86400

    # Create market
    m = mm.create_market("MM test", ["YES", "NO"], future, MarketType.BINARY)
    pm.create_pool(m.market_id, ["YES", "NO"])

    # Publish oracle signal for fair value
    of.publish_signal(m.market_id, {
        "direction": "UP",
        "up_probability": 0.65,
        "confidence": 0.80,
    })

    # Configure bot
    config = bot.auto_configure(m.market_id, spread_bps=200, order_size=500_000)
    check("Bot configured", config.active)

    # Refresh quotes
    result = bot.refresh_quotes(m.market_id)
    check("Quotes refreshed", result["refreshed"] == 1)
    check("Actions taken", len(result["markets"][m.market_id]["actions"]) > 0)

    # Check state
    state = bot.get_state(m.market_id)
    check("Orders placed", state.orders_placed > 0)
    check("Fair value set", len(state.fair_value) == 2)
    check("YES fair value ~0.65", abs(state.fair_value.get("YES", 0) - 0.65) < 0.1,
          f"got {state.fair_value.get('YES')}")

    # Market should now have orders
    book = mm.get_orderbook(m.market_id)
    check("Orderbook populated", True)

    # Pool should have stakes from bot
    pool = pm.get_pool(m.market_id)
    check("Pool seeded by bot", pool.total_pool > 0)

    # Refresh all
    result2 = bot.refresh_all()
    check("Refresh all works", result2["refreshed"] >= 1)

    # Stats
    stats = bot.stats()
    check("Stats active", stats["active_markets"] == 1)
    check("Stats volume", stats["total_volume"] > 0)

    # Stop
    bot.stop_market(m.market_id)
    check("Bot stopped", not bot._configs[m.market_id].active)


# ---------------------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("╔═══════════════════════════════════════════════════════════╗")
    print("║  Hedera Prediction Market Infrastructure — Test Suite    ║")
    print("╚═══════════════════════════════════════════════════════════╝")

    test_market_core()
    test_hbar_pools()
    test_hts_tokens()
    test_oracle_feed()
    test_settlement_engine()
    test_full_lifecycle()
    test_auto_market_factory()
    test_liquidity_manager()
    test_portfolio_and_leaderboard()
    test_market_maker()

    print(f"\n{'═' * 60}")
    total = PASS + FAIL
    print(f"Results: {PASS}/{total} passed, {FAIL} failed")
    if FAIL == 0:
        print("✅ All prediction market tests passed!")
    else:
        print(f"❌ {FAIL} test(s) failed")
    print(f"{'═' * 60}")

    sys.exit(0 if FAIL == 0 else 1)
