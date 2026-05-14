#!/usr/bin/env python3
"""
Test all three v3 specialists: Market Analytics, Per-Token Analytics, Graph Data.
"""

import sys
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api/src')
sys.path.insert(0, '/home/vera-live-0-1/hedera-llm-api')

from analytics_engine import AnalyticsEngine
from graph_data_engine import GraphDataEngine


def test_market_analytics():
    """Test market-wide analytics specialist."""
    print("\n" + "=" * 60)
    print("SPECIALIST 1: MARKET ANALYTICS")
    print("=" * 60)
    
    engine = AnalyticsEngine()
    
    # Correlation matrix
    corr = engine.get_correlation_matrix()
    print("\n[1] Correlation Matrix:")
    for t1, others in corr.items():
        for t2, val in others.items():
            if t1 != t2:
                print(f"  {t1.upper()} vs {t2.upper()}: {val:.3f}")
    
    # Volatility
    vol = engine.get_market_volatility()
    print(f"\n[2] Volatility Regime:")
    print(f"  Regime: {vol.get('regime', 'N/A')}")
    print(f"  Avg: {vol.get('average_volatility_annualized', 0):.1f}%")
    print(f"  Max: {vol.get('max_volatility', 0):.1f}%")
    
    # Sentiment
    sent = engine.get_market_sentiment()
    print(f"\n[3] Market Sentiment:")
    print(f"  Overall: {sent.get('sentiment', 'N/A')}")
    print(f"  Bullish: {sent.get('bullish_percentage', 0):.1f}%")
    print(f"  Bearish: {sent.get('bearish_percentage', 0):.1f}%")
    print(f"  Avg Momentum: {sent.get('average_momentum_percent', 0):.2f}%")
    
    # Ranking
    rank = engine.get_hot_cold_ranking()
    print(f"\n[4] Hot/Cold Ranking:")
    print("  HOT:")
    for t in rank.get("hot", [])[:3]:
        print(f"    {t['token']}: +{t['change_24h_percent']:.2f}% (score: {t['score']:.2f})")
    print("  COLD:")
    for t in rank.get("cold", [])[:3]:
        print(f"    {t['token']}: {t['change_24h_percent']:.2f}% (score: {t['score']:.2f})")
    
    return True


def test_per_token_analytics():
    """Test per-token deep analytics specialist."""
    print("\n" + "=" * 60)
    print("SPECIALIST 2: PER-TOKEN ANALYTICS")
    print("=" * 60)
    
    engine = AnalyticsEngine()
    
    for token in ["hbar", "sauce", "dovu"]:
        print(f"\n[{token.upper()}]")
        
        result = engine.get_token_analytics(token)
        if "error" in result:
            print(f"  ERROR: {result['error']}")
            continue
        
        # Trend
        trend = result.get("trend_strength", {})
        print(f"  Trend: {trend.get('direction', 'N/A')} (strength: {trend.get('score', 0):.1f})")
        
        # Support/Resistance
        sr = result.get("support_resistance", {})
        print(f"  Support: ${sr.get('support', 0):.6f}")
        print(f"  Resistance: ${sr.get('resistance', 0):.6f}")
        print(f"  Breakout potential: {sr.get('breakout_potential', 'N/A')}")
        
        # Divergence
        div = result.get("divergence", {})
        if div.get("detected"):
            print(f"  Divergence: {div['type']} ({div['confidence']} confidence)")
        else:
            print(f"  Divergence: None detected")
        
        # Volume
        vol = result.get("volume_anomaly", {})
        if vol.get("detected"):
            print(f"  Volume anomaly: {vol['severity']} ({vol['ratio']:.1f}x average)")
        else:
            print(f"  Volume anomaly: None")
        
        # Momentum
        mom = result.get("momentum", {})
        print(f"  Momentum: {mom.get('interpretation', 'N/A')} (score: {mom.get('composite', 0):.1f})")
    
    return True


def test_graph_data():
    """Test graph data generation specialist."""
    print("\n" + "=" * 60)
    print("SPECIALIST 3: GRAPH DATA")
    print("=" * 60)
    
    engine = GraphDataEngine()
    
    for token in ["hbar", "sauce"]:
        print(f"\n[{token.upper()}]")
        
        # Probability time-series
        prob = engine.get_probability_time_series(token)
        if "error" in prob:
            print(f"  Probability: {prob['error']}")
        else:
            print(f"  Probability series: {prob['points']} data points")
            if prob.get("prediction_probability"):
                first = prob["prediction_probability"][0]
                last = prob["prediction_probability"][-1]
                print(f"    First: {first['y']:.1f}% at {first['x']}")
                print(f"    Last: {last['y']:.1f}% at {last['x']}")
        
        # Accuracy
        acc = engine.get_accuracy_over_time(token)
        if "error" in acc:
            print(f"  Accuracy: {acc['error']}")
        else:
            print(f"  Accuracy series: {acc['points']} points")
            print(f"    Current rolling accuracy: {acc.get('current_accuracy', 0):.1f}%")
        
        # Feature importance
        feat = engine.get_feature_importance(token)
        if "error" in feat:
            print(f"  Features: {feat['error']}")
        else:
            print(f"  Top feature: {feat.get('most_important', 'N/A')}")
            for f in feat.get("feature_importance", [])[:3]:
                print(f"    {f['feature']}: {f['importance']:.4f}")
        
        # Dashboard
        dash = engine.get_dashboard_data(token)
        print(f"  Dashboard: {len(dash)} sections")
    
    return True


def main():
    print("=" * 60)
    print("HEDERA PREDICTION MARKET v3 - SPECIALIST TEST SUITE")
    print("=" * 60)
    
    results = []
    
    try:
        results.append(("Market Analytics", test_market_analytics()))
    except Exception as e:
        print(f"\nFAILED: {e}")
        results.append(("Market Analytics", False))
    
    try:
        results.append(("Per-Token Analytics", test_per_token_analytics()))
    except Exception as e:
        print(f"\nFAILED: {e}")
        results.append(("Per-Token Analytics", False))
    
    try:
        results.append(("Graph Data", test_graph_data()))
    except Exception as e:
        print(f"\nFAILED: {e}")
        results.append(("Graph Data", False))
    
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
