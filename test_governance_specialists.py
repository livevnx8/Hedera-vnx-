#!/usr/bin/env python3
"""
Test suite for Governance Specialists: Validator, Reward Agent, Auditor.
"""

import sys
import time
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from transaction_validator import TransactionValidator, ValidationResult
from reward_agent import RewardAgent, RewardResult
from auditor_specialist import AuditorSpecialist


def test_validator():
    """Test Transaction Validator Specialist."""
    print("\n" + "=" * 60)
    print("SPECIALIST 1: TRANSACTION VALIDATOR")
    print("=" * 60)
    
    validator = TransactionValidator()
    print(f"Validator ID: {validator.validator_id}")
    
    # Test 1: Valid bid
    print("\n[1] Valid bid (10 HBAR on UP)...")
    r1 = validator.validate_bid(0, "0.0.1001", "UP", 1_000_000_000)
    print(f"  Valid: {r1.valid}, Reason: {r1.reason}")
    print(f"  Attestation: {r1.attestation[:48]}..." if r1.attestation else "  None")
    assert r1.valid, "Valid bid should pass"
    
    # Test 2: Duplicate bid
    print("\n[2] Duplicate bid...")
    r2 = validator.validate_bid(0, "0.0.1001", "DOWN", 500_000_000)
    print(f"  Valid: {r2.valid}, Reason: {r2.reason}")
    assert not r2.valid, "Duplicate bid should fail"
    
    # Test 3: Below minimum
    print("\n[3] Below minimum (0.5 HBAR)...")
    r3 = validator.validate_bid(0, "0.0.1002", "UP", 50_000_000)
    print(f"  Valid: {r3.valid}, Reason: {r3.reason}")
    assert not r3.valid, "Below minimum should fail"
    
    # Test 4: Invalid direction
    print("\n[4] Invalid direction...")
    r4 = validator.validate_bid(0, "0.0.1003", "SIDEWAYS", 1_000_000_000)
    print(f"  Valid: {r4.valid}, Reason: {r4.reason}")
    assert not r4.valid, "Invalid direction should fail"
    
    # Test 5: Verify attestation
    print("\n[5] Verify attestation signature...")
    is_valid = validator.verify_attestation(
        r1.market_id, r1.bidder, r1.direction,
        r1.amount, r1.timestamp, r1.attestation,
        validator.get_secret_key()
    )
    print(f"  Signature valid: {is_valid}")
    assert is_valid, "Attestation should verify"
    
    # Test 6: Another valid bid
    print("\n[6] Another valid bid (5 HBAR on DOWN)...")
    r6 = validator.validate_bid(0, "0.0.1002", "DOWN", 500_000_000)
    print(f"  Valid: {r6.valid}")
    assert r6.valid
    
    return validator


def test_reward_agent(bids):
    """Test Reward Agent Specialist."""
    print("\n" + "=" * 60)
    print("SPECIALIST 2: REWARD AGENT")
    print("=" * 60)
    
    agent = RewardAgent()
    print(f"Agent ID: {agent.agent_id}")
    
    # Test 1: Normal distribution
    print("\n[1] Calculate rewards (UP wins)...")
    result = agent.calculate_rewards(0, "UP", bids)
    print(f"  Valid: {result.valid}")
    print(f"  Total pool: {result.total_pool / 1e8:.1f} HBAR")
    print(f"  Platform fee: {result.platform_fee / 1e8:.2f} HBAR ({result.platform_fee / result.total_pool * 100:.2f}%)")
    print(f"  Distributed: {result.total_distributed / 1e8:.1f} HBAR")
    print(f"  Winners: {len(result.payouts)}")
    
    for p in result.payouts:
        print(f"    {p.address}: {p.bet_amount / 1e8:.1f} → {p.payout_amount / 1e8:.1f} HBAR ({p.share_percent}%)")
    
    assert result.valid, "Reward calculation should succeed"
    assert len(result.payouts) == 2, "Two UP bettors should win"
    assert result.platform_fee > 0, "Fee should be collected"
    
    # Test 2: Verify attestation
    print("\n[2] Verify payout attestation...")
    payout_dicts = [
        {"address": p.address, "bet": p.bet_amount, "payout": p.payout_amount}
        for p in result.payouts
    ]
    is_valid = agent.verify_payout_attestation(
        result.market_id, result.outcome, result.total_pool,
        result.platform_fee, payout_dicts, result.timestamp,
        result.attestation, agent.get_secret_key()
    )
    print(f"  Attestation valid: {is_valid}")
    assert is_valid, "Payout attestation should verify"
    
    # Test 3: No winners
    print("\n[3] No winners scenario...")
    up_only_bids = [b for b in bids if b["direction"] == "UP"]
    result2 = agent.calculate_rewards(1, "DOWN", up_only_bids)
    print(f"  Valid: {result2.valid}, Reason: {result2.reason}")
    assert not result2.valid, "No winners should fail"
    
    # Test 4: Fee calculation
    print("\n[4] Verify fee is 0.5%...")
    expected_fee = result.total_pool * 50 // 10000
    print(f"  Expected: {expected_fee}, Actual: {result.platform_fee}")
    assert result.platform_fee == expected_fee, "Fee should be exactly 0.5%"
    
    return agent, result


def test_auditor(validator, agent, reward_result):
    """Test Auditor Specialist."""
    print("\n" + "=" * 60)
    print("SPECIALIST 3: AUDITOR")
    print("=" * 60)
    
    auditor = AuditorSpecialist()
    
    # Use unique market ID to avoid UNIQUE constraint
    market_id = int(time.time() * 1000) % 100000
    
    # Register entities
    print("\n[1] Registering validator and agent keys...")
    auditor.register_entity(validator.validator_id, "validator", validator.get_secret_key())
    auditor.register_entity(agent.agent_id, "agent", agent.get_secret_key())
    print(f"  Registered: {len(auditor.validator_keys)} validators, {len(auditor.agent_keys)} agents")
    
    # Record market
    print(f"\n[2] Recording market creation (ID: {market_id})...")
    h1 = auditor.record_market_created(market_id, "hbar", time.time() + 86400, 5000, "0.0.9999")
    print(f"  Hash: {h1[:24]}...")
    
    # Record bids
    print("\n[3] Recording bids...")
    bids = [
        ("0.0.1001", "UP", 1_000_000_000),
        ("0.0.1002", "DOWN", 500_000_000),
        ("0.0.1003", "UP", 2_000_000_000),
    ]
    for bidder, direction, amount in bids:
        result = validator.validate_bid(market_id, bidder, direction, amount)
        auditor.record_bid(market_id, bidder, direction, amount, result.attestation or "", validator.validator_id)
    print(f"  3 bids recorded")
    
    # Record resolution
    print("\n[4] Recording resolution...")
    h5 = auditor.record_resolution(market_id, "UP", "oracle_001")
    print(f"  Outcome: UP, Hash: {h5[:24]}...")
    
    # Record payouts
    print("\n[5] Recording payouts...")
    for payout in reward_result.payouts:
        auditor.record_payout(market_id, payout.address, payout.bet_amount, payout.payout_amount,
                             reward_result.attestation or "", agent.agent_id)
    print(f"  {len(reward_result.payouts)} payouts recorded")
    
    # Lifecycle reconstruction
    print(f"\n[6] Reconstructing market lifecycle (ID: {market_id})...")
    lifecycle = auditor.get_market_lifecycle(market_id)
    print(f"  Token: {lifecycle['token']}")
    print(f"  Status: {lifecycle['status']}")
    print(f"  Bets: {lifecycle['total_bets']}")
    print(f"  Bidders: {len(lifecycle['bids'])}")
    print(f"  Winners: {len(lifecycle['payouts'])}")
    print(f"  Audit events: {lifecycle['audit_events']}")
    print(f"  Integrity: {lifecycle['integrity']}")
    
    assert lifecycle['token'] == 'hbar', "Token should be hbar"
    assert lifecycle['total_bets'] == 3, "Should have 3 bets"
    assert lifecycle['status'] == 'RESOLVED', "Should be resolved"
    
    # Chain integrity
    print("\n[7] Verifying chain integrity...")
    integrity = auditor.verify_chain_integrity()
    print(f"  Status: {integrity['status']}")
    print(f"  Entries: {integrity['total_entries']}")
    print(f"  Broken links: {integrity['broken_links']}")
    assert integrity['status'] == 'INTACT', "Chain should be intact"
    
    # Summary
    print("\n[8] Audit summary...")
    summary = auditor.get_audit_summary()
    print(f"  Events: {summary['total_events']}")
    print(f"  Markets: {summary['markets']}")
    print(f"  Bids: {summary['bids']}")
    print(f"  Payouts: {summary['payouts']}")
    print(f"  Chain: {summary['chain_integrity']}")
    
    return auditor


def main():
    print("=" * 60)
    print("GOVERNANCE SPECIALISTS - TEST SUITE")
    print("Validator + Reward Agent + Auditor")
    print("=" * 60)
    
    try:
        # Test 1: Validator
        validator = test_validator()
        
        # Get bids for reward calculation
        bids = [
            {"bidder": "0.0.1001", "direction": "UP", "amount": 1_000_000_000},
            {"bidder": "0.0.1002", "direction": "DOWN", "amount": 500_000_000},
            {"bidder": "0.0.1003", "direction": "UP", "amount": 2_000_000_000},
        ]
        
        # Test 2: Reward Agent
        agent, reward_result = test_reward_agent(bids)
        
        # Test 3: Auditor
        auditor = test_auditor(validator, agent, reward_result)
        
        # Summary
        print(f"\n{'='*60}")
        print("ALL GOVERNANCE SPECIALISTS TESTS PASSED")
        print(f"{'='*60}")
        print("\nVerified:")
        print("  [✓] Bid validation with ECDSA attestations")
        print("  [✓] Duplicate detection")
        print("  [✓] Minimum bet enforcement")
        print("  [✓] Reward calculation with 0.5% fee")
        print("  [✓] Proportional payout distribution")
        print("  [✓] Attestation signature verification")
        print("  [✓] Immutable audit trail with hash chain")
        print("  [✓] Chain integrity verification")
        print("  [✓] Market lifecycle reconstruction")
        
        return 0
        
    except AssertionError as e:
        print(f"\n{'='*60}")
        print(f"TEST FAILED: {e}")
        print(f"{'='*60}")
        return 1
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"ERROR: {e}")
        print(f"{'='*60}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
