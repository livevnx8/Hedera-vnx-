#!/usr/bin/env node
/**
 * Phase 4 Demo - Predictive Analytics Engine
 * Demonstrates ML pattern recognition, forecasting, and trend correlation
 */

import { PredictiveAnalytics, DomainAnalytics } from './blueprints/predictive-analytics.mjs';
import { TimeSeriesForecast, Forecasters } from './blueprints/time-series-forecast.mjs';
import { TrendCorrelation } from './blueprints/trend-correlation.mjs';

console.clear();
console.log('\n╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🔮 PHASE 4: PREDICTIVE ANALYTICS ENGINE                              ║');
console.log('║  ML Pattern Recognition + Forecasting + Cross-Domain Correlation     ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

async function runDemo() {
  
  // Demo 1: Energy Load Prediction
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣ ENERGY LOAD PREDICTION\n');
  
  const energyData = [];
  let baseLoad = 5000;
  for (let i = 0; i < 48; i++) {
    // Simulate daily pattern + trend
    const hour = i % 24;
    const isPeak = [7,8,9,17,18,19,20].includes(hour);
    const peakFactor = isPeak ? 1.3 : 0.85;
    const noise = (Math.random() - 0.5) * 200;
    
    baseLoad += 10; // Upward trend
    energyData.push(baseLoad * peakFactor + noise);
  }
  
  const energyModel = DomainAnalytics.energy;
  const trainResult = energyModel.trainModel('wv-grid-load', energyData);
  
  console.log(`   📊 Model trained on ${trainResult.model.dataPoints} data points`);
  console.log(`   📈 Trend: ${trainResult.model.trend.direction} (${trainResult.model.trend.rSquared} R²)`);
  console.log(`   🎯 Accuracy: ${Math.round(trainResult.model.accuracy * 100)}%`);
  console.log(`   🔍 Patterns found: ${trainResult.patternsFound}\n`);
  
  // Predict next 6 hours
  const prediction = energyModel.predict('wv-grid-load', 6);
  console.log('   ⏭️ Next 6 Hours Forecast:');
  prediction.predictions.forEach(p => {
    console.log(`      Hour ${p.step}: ${p.value} MW (±${Math.round((p.upperBound - p.value))}) [${Math.round(p.confidence * 100)}% confidence]`);
  });
  console.log();
  
  // Demo 2: Anomaly Detection
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣ REAL-TIME ANOMALY DETECTION\n');
  
  const testValues = [5200, 5300, 4800, 5100, 7500, 5200]; // 7500 is anomalous
  console.log('   Testing values against trained model:');
  
  testValues.forEach(val => {
    const result = energyModel.detectAnomaly('wv-grid-load', val);
    const icon = result.isAnomaly ? '🚨' : '✅';
    console.log(`   ${icon} ${val} MW: ${result.isAnomaly ? result.severity : 'Normal'} (z=${result.zScore})`);
  });
  console.log();
  
  // Demo 3: DeFi Price Forecasting
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣ DeFi PRICE FORECASTING\n');
  
  const defiData = [];
  let price = 100;
  const now = Date.now();
  
  for (let i = 0; i < 24; i++) {
    // Volatile price movement
    const change = (Math.random() - 0.48) * 5; // Slight upward bias
    price *= (1 + change / 100);
    defiData.push({
      timestamp: now - (24 - i) * 3600000,
      value: price
    });
  }
  
  const defiForecaster = Forecasters.defiPrice;
  const trainDefi = defiForecaster.train('hbar-price', defiData);
  
  console.log(`   📈 Model trained: ${trainDefi.model.trend} trend`);
  console.log(`   🔄 Seasonality: ${trainDefi.model.seasonalityDetected ? 'Detected' : 'None'}`);
  console.log(`   🎯 Confidence: ${Math.round(trainDefi.model.confidence * 100)}%\n`);
  
  const defiForecast = defiForecaster.forecast('hbar-price', 6);
  console.log('   ⏭️ Next 6 Hours Price Forecast:');
  defiForecast.forecasts.forEach(f => {
    const trend = f.value > defiForecast.lastValue ? '📈' : '📉';
    console.log(`      ${trend} $${f.value.toFixed(2)} [${f.lower.toFixed(2)} - ${f.upper.toFixed(2)}]`);
  });
  console.log(`   📊 Reliability: ${defiForecast.reliability}\n`);
  
  // Demo 4: Trend Correlation
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4️⃣ CROSS-DOMAIN TREND CORRELATION\n');
  
  const correlator = new TrendCorrelation();
  
  // Energy and DeFi often correlate (high energy = high compute = high DeFi activity)
  const energyShort = energyData.slice(-24);
  const defiShort = defiData.map(d => d.value * 50); // Scale for comparison
  
  const correlation = correlator.analyze('energy-load', energyShort, 'defi-activity', defiShort);
  
  console.log(`   🔗 Energy ↔ DeFi Correlation:`);
  console.log(`      Coefficient: ${correlation.correlation}`);
  console.log(`      Strength: ${correlation.type}`);
  console.log(`      Direction: ${correlation.direction}`);
  console.log(`      Significant: ${correlation.significant ? 'Yes' : 'No'}`);
  console.log(`      💡 ${correlation.interpretation}\n`);
  
  // Demo 5: Cross-Domain Anomaly Detection
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('5️⃣ CROSS-DOMAIN ANOMALY DETECTION\n');
  
  // Simulate simultaneous anomalies
  const domainData = {
    energy: [
      { timestamp: now - 3600000, value: 5000 },
      { timestamp: now, value: 5000 },
      { timestamp: now + 3600000, value: 8200 } // Anomaly
    ],
    defi: [
      { timestamp: now - 3600000, value: 100 },
      { timestamp: now, value: 100 },
      { timestamp: now + 3600000, value: 180 } // Anomaly
    ],
    security: [
      { timestamp: now - 3600000, value: 5 },
      { timestamp: now, value: 5 },
      { timestamp: now + 3600000, value: 45 } // Anomaly
    ]
  };
  
  const crossAnomalies = correlator.detectCrossDomainAnomalies(domainData);
  
  if (crossAnomalies.length > 0) {
    console.log('   🚨 Cross-Domain Anomalies Detected:');
    crossAnomalies.forEach(a => {
      console.log(`      Time: ${new Date(a.timestamp).toLocaleTimeString()}`);
      console.log(`      Domains: ${a.domains.join(', ')}`);
      console.log(`      Severity: ${a.severity}`);
      console.log(`      Z-Scores: ${JSON.stringify(a.zScores)}`);
    });
  } else {
    console.log('   ✅ No cross-domain anomalies detected');
  }
  console.log();
  
  // Demo 6: Insights Generation
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('6️⃣ AUTOMATED INSIGHTS\n');
  
  // Add more correlations
  const carbonData = energyShort.map(v => v * 0.4 + (Math.random() - 0.5) * 100);
  correlator.analyze('energy-load', energyShort, 'carbon-emissions', carbonData);
  
  const insights = correlator.generateInsights();
  
  console.log('   💡 Generated Insights:');
  insights.forEach((insight, i) => {
    console.log(`      ${i + 1}. ${insight.type}: ${insight.actionable || insight.insight}`);
    if (insight.series) {
      console.log(`         Between: ${insight.series.join(' ↔ ')} (${insight.strength})`);
    }
  });
  console.log();
  
  // Demo 7: Leading Indicators
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('7️⃣ LEADING INDICATOR ANALYSIS\n');
  
  const candidates = {
    'energy-price': energyData.slice(-20),
    'network-load': energyData.slice(-20).map(v => v * 0.8 + Math.random() * 100),
    'trading-volume': defiShort.slice(-20).map(v => v * 2 + Math.random() * 50)
  };
  
  const indicators = correlator.findLeadingIndicators('defi-activity', candidates);
  
  if (indicators.length > 0) {
    console.log('   🔮 Leading Indicators for DeFi Activity:');
    indicators.slice(0, 3).forEach(ind => {
      console.log(`      • ${ind.indicator} (lag: ${ind.lag}h, correlation: ${ind.correlation})`);
    });
  } else {
    console.log('   ⏳ No strong leading indicators found (need more data)');
  }
  console.log();
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ PHASE 4 DEMO COMPLETE\n');
  
  console.log('🎯 Capabilities Demonstrated:');
  console.log('   • ML model training on time-series data');
  console.log('   • Multi-horizon forecasting with confidence intervals');
  console.log('   • Real-time anomaly detection (z-score based)');
  console.log('   • Cross-domain correlation analysis');
  console.log('   • Leading indicator discovery');
  console.log('   • Automated insight generation');
  
  console.log('\n📊 Stats:');
  console.log(`   • Models trained: 2`);
  console.log(`   • Forecast horizons: 6-24 hours`);
  console.log(`   • Correlations analyzed: ${correlator.getAllCorrelations().length}`);
  console.log(`   • Insights generated: ${insights.length}`);
  
  console.log('\n🚀 Integration Ready:');
  console.log('   • DomainAnalytics.energy - Energy predictions');
  console.log('   • Forecasters.defiPrice - DeFi forecasting');
  console.log('   • TrendCorrelation - Cross-domain analysis');
  console.log('   • Integrate with v2 agents for predictive monitoring\n');
}

runDemo().catch(console.error);
