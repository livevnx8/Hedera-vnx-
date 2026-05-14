#!/usr/bin/env python3
"""
Test suite for Feature Infrastructure Specialist.
Tests importance monitoring, auto-engineering, and drift detection.
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from feature_infrastructure import FeatureImportanceMonitor, AutoFeatureEngineer, FeatureDriftDetector


def test_importance_monitor():
    """Test feature importance monitoring."""
    print("\n" + "=" * 60)
    print("SPECIALIST 1: FEATURE IMPORTANCE MONITOR")
    print("=" * 60)
    
    monitor = FeatureImportanceMonitor()
    
    for token in ["hbar", "sauce"]:
        print(f"\n[{token.upper()}]")
        
        result = monitor.get_feature_importance(token)
        if "error" in result:
            print(f"  ERROR: {result['error']}")
            continue
        
        print(f"  Window: {result['window_size']} predictions")
        print(f"  Top feature: {result['top_feature']} (importance: {result['feature_importance'][0]['importance']:.4f})")
        print(f"  Stale features: {len(result['stale_features'])}")
        
        if result['stale_features']:
            for sf in result['stale_features']:
                print(f"    - {sf['feature']}: {sf['reason']}")
        
        # Test trend tracking for top feature
        top_feature = result['top_feature']
        trend = monitor.get_importance_trend(token, top_feature)
        if "error" not in trend:
            print(f"  Trend ({top_feature}): {trend['trend']} (change: {trend['change']:+.4f})")
    
    return True


def test_auto_engineer():
    """Test auto feature engineering."""
    print("\n" + "=" * 60)
    print("SPECIALIST 2: AUTO FEATURE ENGINEER")
    print("=" * 60)
    
    engineer = AutoFeatureEngineer()
    
    for token in ["hbar", "sauce"]:
        print(f"\n[{token.upper()}]")
        
        # Discover candidates
        discovered = engineer.discover_features(token)
        if "error" in discovered:
            print(f"  ERROR: {discovered['error']}")
            continue
        
        print(f"  Base features: {discovered['base_features']}")
        print(f"  Candidates generated: {discovered['candidates_generated']}")
        print(f"  Top candidates:")
        for c in discovered['top_candidates'][:5]:
            print(f"    {c['feature']}: score={c['potential_score']:.4f}")
        
        # Evaluate a specific feature
        eval_result = engineer.evaluate_feature(token, "rsi_14")
        if "error" not in eval_result:
            print(f"  rsi_14 evaluation:")
            print(f"    Correlation: {eval_result['correlation']:.4f}")
            print(f"    Accuracy: {eval_result['accuracy']:.1%}")
            print(f"    Significant: {eval_result['significant']}")
            print(f"    Recommendation: {eval_result['recommendation']}")
    
    return True


def test_drift_detector():
    """Test feature drift detection."""
    print("\n" + "=" * 60)
    print("SPECIALIST 3: FEATURE DRIFT DETECTOR")
    print("=" * 60)
    
    detector = FeatureDriftDetector()
    
    for token in ["hbar", "sauce"]:
        print(f"\n[{token.upper()}]")
        
        # Overall drift
        drift = detector.detect_all_drift(token)
        if "error" in drift:
            print(f"  ERROR: {drift['error']}")
            continue
        
        print(f"  Features checked: {drift['features_checked']}")
        print(f"  Critical: {drift['critical']}, High: {drift['high']}")
        print(f"  Overall status: {drift['overall_status']}")
        print(f"  Recommendation: {drift['recommendation']}")
        
        # Show any drifting features
        drifting = [d for d in drift['drift_details'] if d['drift_detected']]
        if drifting:
            print(f"  Drifting features:")
            for d in drifting[:3]:
                print(f"    {d['feature']}: {d['severity']} (shift={d['mean_shift_std']:+.2f})")
        
        # Regime shift
        regime = detector.get_regime_shift(token)
        if "error" not in regime:
            print(f"  Regime: {regime['volatility_regime_shift']}")
            print(f"  Vol change: {regime['change_percent']:+.1f}%")
    
    return True


def main():
    print("=" * 60)
    print("FEATURE INFRASTRUCTURE SPECIALIST - TEST SUITE")
    print("=" * 60)
    
    results = []
    
    try:
        results.append(("Feature Importance", test_importance_monitor()))
    except Exception as e:
        print(f"\nFAILED: {e}")
        results.append(("Feature Importance", False))
    
    try:
        results.append(("Auto Feature Engineer", test_auto_engineer()))
    except Exception as e:
        print(f"\nFAILED: {e}")
        results.append(("Auto Feature Engineer", False))
    
    try:
        results.append(("Drift Detector", test_drift_detector()))
    except Exception as e:
        print(f"\nFAILED: {e}")
        results.append(("Drift Detector", False))
    
    # Summary
    print(f"\n{'='*60}")
    print("TEST SUMMARY")
    print(f"{'='*60}")
    
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {name:25s}: {status}")
    
    all_passed = all(p for _, p in results)
    print(f"\nOverall: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
