#!/usr/bin/env node
/**
 * TrendCorrelation - Cross-domain pattern analysis
 * Phase 4 Implementation
 * Finds correlations between energy, DeFi, carbon, and security trends
 */

export class TrendCorrelation {
  constructor() {
    this.correlations = new Map();
    this.threshold = 0.5; // Minimum correlation coefficient
  }
  
  /**
   * Analyze correlation between two time series
   * @param {string} seriesA - First series ID
   * @param {Array<number>} dataA - First series data
   * @param {string} seriesB - Second series ID
   * @param {Array<number>} dataB - Second series data
   */
  analyze(seriesA, dataA, seriesB, dataB) {
    if (dataA.length !== dataB.length || dataA.length < 5) {
      return { success: false, error: 'Need equal length arrays with 5+ points' };
    }
    
    // Pearson correlation coefficient
    const n = dataA.length;
    const sumA = dataA.reduce((a, b) => a + b, 0);
    const sumB = dataB.reduce((a, b) => a + b, 0);
    const sumAB = dataA.reduce((sum, a, i) => sum + a * dataB[i], 0);
    const sumAA = dataA.reduce((sum, a) => sum + a * a, 0);
    const sumBB = dataB.reduce((sum, b) => sum + b * b, 0);
    
    const numerator = (n * sumAB) - (sumA * sumB);
    const denominator = Math.sqrt(
      ((n * sumAA) - (sumA * sumA)) * ((n * sumBB) - (sumB * sumB))
    );
    
    const correlation = denominator === 0 ? 0 : numerator / denominator;
    
    // Determine relationship type
    const strength = Math.abs(correlation);
    const direction = correlation > 0 ? 'POSITIVE' : 'NEGATIVE';
    const type = strength > 0.7 ? 'STRONG' : strength > 0.4 ? 'MODERATE' : 'WEAK';
    
    // Store correlation
    const key = [seriesA, seriesB].sort().join(':');
    this.correlations.set(key, {
      seriesA,
      seriesB,
      coefficient: Math.round(correlation * 100) / 100,
      strength,
      direction,
      type,
      timestamp: Date.now()
    });
    
    return {
      success: true,
      correlation: Math.round(correlation * 100) / 100,
      strength,
      direction,
      type,
      significant: strength > this.threshold,
      interpretation: this._interpret(seriesA, seriesB, correlation)
    };
  }
  
  /**
   * Find leading indicators
   * @param {string} target - Series to predict
   * @param {Object} candidates - Map of candidate leading series
   */
  findLeadingIndicators(target, candidates) {
    const results = [];
    
    Object.entries(candidates).forEach(([name, data]) => {
      // Try different lags
      for (let lag = 1; lag <= 3; lag++) {
        if (data.length <= lag) continue;
        
        const laggedData = data.slice(0, -lag);
        const targetAligned = data.slice(lag);
        
        if (laggedData.length < 5) continue;
        
        const corr = this._quickCorrelation(laggedData, targetAligned);
        
        if (Math.abs(corr) > this.threshold) {
          results.push({
            indicator: name,
            lag,
            correlation: Math.round(corr * 100) / 100,
            strength: Math.abs(corr) > 0.7 ? 'STRONG' : 'MODERATE'
          });
        }
      }
    });
    
    return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }
  
  /**
   * Detect cross-domain anomalies
   * @param {Object} domainData - Data from multiple domains
   */
  detectCrossDomainAnomalies(domainData) {
    const anomalies = [];
    
    // Check for simultaneous unusual activity
    const timestamps = Object.values(domainData)[0]?.map(d => d.timestamp) || [];
    
    timestamps.forEach((ts, idx) => {
      const values = {};
      Object.entries(domainData).forEach(([domain, data]) => {
        values[domain] = data[idx]?.value || 0;
      });
      
      // Calculate z-scores for each domain
      const zScores = {};
      Object.entries(values).forEach(([domain, value]) => {
        const series = domainData[domain].map(d => d.value);
        const mean = series.reduce((a, b) => a + b) / series.length;
        const std = Math.sqrt(series.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / series.length);
        zScores[domain] = Math.abs((value - mean) / std);
      });
      
      // Detect if multiple domains show anomalies simultaneously
      const anomalousDomains = Object.entries(zScores)
        .filter(([_, z]) => z > 2)
        .map(([domain, _]) => domain);
      
      if (anomalousDomains.length >= 2) {
        anomalies.push({
          timestamp: ts,
          domains: anomalousDomains,
          severity: anomalousDomains.length > 2 ? 'CRITICAL' : 'HIGH',
          zScores,
          type: 'CROSS_DOMAIN_ANOMALY'
        });
      }
    });
    
    return anomalies;
  }
  
  /**
   * Generate cross-domain insights
   */
  generateInsights() {
    const insights = [];
    
    this.correlations.forEach((corr, key) => {
      if (corr.strength > 0.6) {
        insights.push({
          type: 'CORRELATION',
          series: [corr.seriesA, corr.seriesB],
          strength: corr.type,
          direction: corr.direction,
          actionable: this._getActionableInsight(corr)
        });
      }
    });
    
    // Add general insights
    const domains = ['energy', 'defi', 'carbon', 'security'];
    domains.forEach(domain => {
      const domainCorrs = Array.from(this.correlations.values())
        .filter(c => c.seriesA.includes(domain) || c.seriesB.includes(domain));
      
      if (domainCorrs.length > 2) {
        insights.push({
          type: 'HUB_DOMAIN',
          domain,
          connections: domainCorrs.length,
          insight: `${domain.toUpperCase()} shows strong cross-domain influence`
        });
      }
    });
    
    return insights;
  }
  
  // Internal methods
  _interpret(seriesA, seriesB, correlation) {
    const interpretations = {
      'energy:defi': corr => corr > 0 
          ? 'High energy demand correlates with DeFi activity' 
          : 'Energy and DeFi move inversely - diversification opportunity',
      'energy:carbon': corr => corr > 0 
          ? 'Energy usage drives carbon credits demand' 
          : 'Renewable energy reduces carbon credit needs',
      'security:defi': corr => corr > 0 
          ? 'DeFi volatility increases security threats' 
          : 'Security events may stabilize DeFi markets',
      'default': corr => corr > 0 
          ? 'Positive correlation detected' 
          : 'Inverse relationship detected'
    };
    
    const key = [seriesA, seriesB].sort().join(':');
    const fn = interpretations[key] || interpretations['default'];
    return fn(correlation);
  }
  
  _getActionableInsight(corr) {
    if (corr.strength < 0.5) return 'Monitor for pattern development';
    
    if (corr.seriesA.includes('energy') && corr.seriesB.includes('defi')) {
      return corr.direction === 'POSITIVE' 
        ? 'Use energy load as DeFi activity predictor'
        : 'Energy-DeFi hedge opportunity';
    }
    
    if (corr.seriesA.includes('security')) {
      return 'Implement predictive security monitoring';
    }
    
    return 'Consider cross-domain trading strategy';
  }
  
  _quickCorrelation(a, b) {
    const n = Math.min(a.length, b.length);
    const sumA = a.slice(0, n).reduce((x, y) => x + y, 0);
    const sumB = b.slice(0, n).reduce((x, y) => x + y, 0);
    const sumAB = a.slice(0, n).reduce((sum, x, i) => sum + x * b[i], 0);
    const sumAA = a.slice(0, n).reduce((sum, x) => sum + x * x, 0);
    const sumBB = b.slice(0, n).reduce((sum, x) => sum + x * x, 0);
    
    const num = (n * sumAB) - (sumA * sumB);
    const den = Math.sqrt(((n * sumAA) - (sumA * sumA)) * ((n * sumBB) - (sumB * sumB)));
    
    return den === 0 ? 0 : num / den;
  }
  
  getAllCorrelations() {
    return Array.from(this.correlations.values());
  }
  
  getStrongestCorrelations(limit = 5) {
    return Array.from(this.correlations.values())
      .sort((a, b) => b.strength - a.strength)
      .slice(0, limit);
  }
}

// Domain correlation matrix
export class CorrelationMatrix {
  constructor(domains) {
    this.domains = domains;
    this.matrix = {};
    domains.forEach(d1 => {
      this.matrix[d1] = {};
      domains.forEach(d2 => {
        this.matrix[d1][d2] = d1 === d2 ? 1 : 0;
      });
    });
  }
  
  update(domainA, domainB, correlation) {
    this.matrix[domainA][domainB] = correlation;
    this.matrix[domainB][domainA] = correlation;
  }
  
  getCluster() {
    // Find most correlated domain pair
    let maxCorr = 0;
    let pair = null;
    
    this.domains.forEach(d1 => {
      this.domains.forEach(d2 => {
        if (d1 !== d2 && this.matrix[d1][d2] > maxCorr) {
          maxCorr = this.matrix[d1][d2];
          pair = [d1, d2];
        }
      });
    });
    
    return { pair, correlation: maxCorr };
  }
  
  toArray() {
    return this.domains.map(d1 => 
      this.domains.map(d2 => this.matrix[d1][d2])
    );
  }
}

export default TrendCorrelation;
