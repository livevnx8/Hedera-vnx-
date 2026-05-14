#!/usr/bin/env python3
"""
Test suite for Hedera VNX Micro-Specialists.

Tests:
1. All 6 specialist types instantiate correctly
2. SwarmOrchestrator runs all specialists
3. Alert detection works
4. Health reporting is accurate
5. Integration with prediction server v3
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from hedera_vnx_specialists import (
    SwarmOrchestrator,
    HCSConsensusSpecialist,
    HTSTokenSpecialist,
    NetworkHealthSpecialist,
    StakingMonitorSpecialist,
    ContractMonitorSpecialist,
    TransactionVolumeSpecialist,
)


def test_specialist_types():
    """Test that all 6 specialist types can be instantiated."""
    print("\n[1] Testing specialist instantiation...")
    
    specialists = [
        HCSConsensusSpecialist(),
        HTSTokenSpecialist(),
        NetworkHealthSpecialist(),
        StakingMonitorSpecialist(),
        ContractMonitorSpecialist(),
        TransactionVolumeSpecialist(),
    ]
    
    assert len(specialists) == 6, "Should have 6 specialist types"
    
    for spec in specialists:
        assert spec.specialist_id != "", "Should have specialist_id"
        assert spec.specialization != "", "Should have specialization"
        assert spec.status == "IDLE", "Should start IDLE"
        print(f"  {spec.specialist_id}: {spec.specialization}")
    
    print("  [PASS] All 6 specialists instantiated")


def test_individual_execution():
    """Test each specialist can execute independently."""
    print("\n[2] Testing individual specialist execution...")
    
    specialists = [
        HCSConsensusSpecialist(),
        HTSTokenSpecialist(),
        NetworkHealthSpecialist(),
        StakingMonitorSpecialist(),
        ContractMonitorSpecialist(),
        TransactionVolumeSpecialist(),
    ]
    
    for spec in specialists:
        result = spec.run()
        
        assert "specialist_id" in result, f"{spec.specialist_id} should return specialist_id"
        assert "specialization" in result, f"{spec.specialist_id} should return specialization"
        assert "status" in result, f"{spec.specialist_id} should return status"
        assert result["status"] == "COMPLETE", f"{spec.specialist_id} should complete"
        assert "latency_ms" in result, f"{spec.specialist_id} should return latency"
        assert result["latency_ms"] > 0, f"{spec.specialist_id} should have positive latency"
        
        print(f"  {spec.specialist_id}: {result['status']} "
              f"(conf={result['confidence']:.2f}, "
              f"alerts={result.get('alert_count', 0)}, "
              f"{result['latency_ms']:.1f}ms)")
    
    print("  [PASS] All specialists executed successfully")


def test_swarm_orchestrator():
    """Test SwarmOrchestrator coordinates all specialists."""
    print("\n[3] Testing SwarmOrchestrator...")
    
    orchestrator = SwarmOrchestrator()
    
    # Check specialist list
    types = orchestrator.get_specialist_types()
    assert len(types) == 6, "Should have 6 specialist types"
    
    # Run swarm
    result = orchestrator.run_all()
    
    assert "status" in result, "Should return status"
    assert result["status"] in ["HEALTHY", "WARNING", "CRITICAL"], "Status should be valid"
    assert "specialists_total" in result, "Should return total count"
    assert result["specialists_total"] == 6, "Should have 6 specialists"
    assert "specialists_active" in result, "Should return active count"
    assert result["specialists_active"] == 6, "All should be active"
    assert "avg_confidence" in result, "Should return avg confidence"
    assert 0 <= result["avg_confidence"] <= 1, "Confidence should be in [0,1]"
    assert "total_alerts" in result, "Should return alert count"
    assert "latency_ms" in result, "Should return latency"
    assert result["latency_ms"] > 0, "Should have positive latency"
    
    print(f"  Status: {result['status']}")
    print(f"  Specialists: {result['specialists_active']}/{result['specialists_total']}")
    print(f"  Avg Confidence: {result['avg_confidence']:.2f}")
    print(f"  Alerts: {result['total_alerts']}")
    print(f"  Latency: {result['latency_ms']:.1f}ms")
    
    print("  [PASS] Swarm orchestrator works correctly")


def test_alert_system():
    """Test alert detection and classification."""
    print("\n[4] Testing alert system...")
    
    orchestrator = SwarmOrchestrator()
    result = orchestrator.run_all()
    
    alerts = result.get("alerts", [])
    
    # Check alert structure
    for alert in alerts:
        assert "type" in alert, "Alert should have type"
        assert "severity" in alert, "Alert should have severity"
        assert alert["severity"] in ["INFO", "WARNING", "CRITICAL"], "Severity should be valid"
    
    print(f"  Total alerts: {len(alerts)}")
    for alert in alerts[:3]:
        print(f"    [{alert['severity']}] {alert['type']}")
    
    print("  [PASS] Alert system works")


def test_multiple_runs():
    """Test that multiple swarm runs increment correctly."""
    print("\n[5] Testing multiple swarm runs...")
    
    orchestrator = SwarmOrchestrator()
    
    # First run
    r1 = orchestrator.run_all()
    assert orchestrator.swarm_runs == 1, "Should be 1 after first run"
    
    # Second run
    r2 = orchestrator.run_all()
    assert orchestrator.swarm_runs == 2, "Should be 2 after second run"
    
    print(f"  Run 1: {r1['status']}")
    print(f"  Run 2: {r2['status']}")
    print(f"  Total runs: {orchestrator.swarm_runs}")
    
    print("  [PASS] Multiple runs tracked correctly")


def test_server_integration():
    """Test that server can import and use Hedera swarm."""
    print("\n[6] Testing server integration...")
    
    try:
        from prediction_server_v3 import hedera_swarm
        
        # Verify it's the right type
        assert hasattr(hedera_swarm, 'run_all'), "Should have run_all method"
        assert hasattr(hedera_swarm, 'get_specialist_types'), "Should have get_specialist_types"
        
        # Quick run
        result = hedera_swarm.run_all()
        assert result["specialists_total"] > 0, "Should have specialists"
        
        print(f"  Server integration: OK")
        print(f"  Specialists: {result['specialists_total']}")
        print(f"  Status: {result['status']}")
        
        print("  [PASS] Server integration works")
        
    except Exception as e:
        print(f"  [FAIL] Server integration failed: {e}")
        raise


def main():
    print("=" * 60)
    print("HEDERA VNX MICRO-SPECIALISTS - TEST SUITE")
    print("=" * 60)
    
    try:
        test_specialist_types()
        test_individual_execution()
        test_swarm_orchestrator()
        test_alert_system()
        test_multiple_runs()
        test_server_integration()
        
        print("\n" + "=" * 60)
        print("ALL HEDERA VNX TESTS PASSED")
        print("=" * 60)
        print("\nVerified:")
        print("  [✓] 6 specialist types instantiate correctly")
        print("  [✓] All specialists execute independently")
        print("  [✓] SwarmOrchestrator coordinates 6 specialists")
        print("  [✓] Alert detection and classification")
        print("  [✓] Multiple run tracking")
        print("  [✓] Server integration")
        return 0
        
    except AssertionError as e:
        print(f"\n[FAIL] {e}")
        import traceback
        traceback.print_exc()
        return 1
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
