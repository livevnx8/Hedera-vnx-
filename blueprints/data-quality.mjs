/**
 * Vera Data Quality Module
 * Standardized quality calculation across all agents
 */

export const TIERS = {
  PLATINUM: { min: 0.95, label: 'PLATINUM', emoji: '🔷' },
  GOLD:     { min: 0.85, label: 'GOLD',     emoji: '🥇' },
  SILVER:   { min: 0.75, label: 'SILVER',   emoji: '🥈' },
  BRONZE:   { min: 0.00, label: 'BRONZE',   emoji: '🥉' }
};

/**
 * Calculate data quality score
 * @param {Object} data - The data to evaluate
 * @param {Object} checks - Map of check names to functions returning 0.0-1.0
 * @param {Object} weights - Map of check names to weights (default 0.25)
 * @returns {Object} Quality result with score, tier, and check breakdown
 */
export function calculateQuality(data, checks, weights = {}) {
  const scores = {};
  let totalScore = 0;
  let totalWeight = 0;

  for (const [key, checkFn] of Object.entries(checks)) {
    try {
      const score = Math.max(0, Math.min(1, checkFn(data)));
      scores[key] = score;
      const weight = weights[key] || (1 / Object.keys(checks).length);
      totalScore += score * weight;
      totalWeight += weight;
    } catch (error) {
      console.warn(`⚠️ Quality check '${key}' failed: ${error.message}`);
      scores[key] = 0;
    }
  }

  const quality = totalWeight > 0 ? totalScore / totalWeight : 0;
  
  // Determine tier
  let tier = TIERS.BRONZE;
  if (quality >= TIERS.PLATINUM.min) tier = TIERS.PLATINUM;
  else if (quality >= TIERS.GOLD.min) tier = TIERS.GOLD;
  else if (quality >= TIERS.SILVER.min) tier = TIERS.SILVER;

  return {
    score: Math.round(quality * 100) / 100,
    tier: tier.label,
    emoji: tier.emoji,
    checks: scores,
    isHighQuality: quality >= TIERS.GOLD.min
  };
}

/**
 * Common quality check functions
 */
export const CommonChecks = {
  // Range validation
  inRange: (value, min, max) => value >= min && value <= max ? 1.0 : 0.0,
  
  // Non-null check
  exists: (value) => value !== null && value !== undefined ? 1.0 : 0.0,
  
  // Recency check (timestamp within last X hours)
  recent: (timestamp, maxHours = 1) => {
    const age = (Date.now() - timestamp) / (1000 * 60 * 60);
    return age <= maxHours ? 1.0 - (age / maxHours) * 0.5 : 0.0;
  },
  
  // Source authority check
  sourceAuthority: (source, trustedSources) => 
    trustedSources.includes(source) ? 0.98 : 0.75,
  
  // Pattern match (for string validation)
  matchesPattern: (value, pattern) => pattern.test(value) ? 1.0 : 0.5
};

/**
 * Pre-configured quality calculators for specific domains
 */
export const DomainQuality = {
  // Energy generation data quality
  energy: (reading) => calculateQuality(reading, {
    sourceAuthority: (r) => CommonChecks.sourceAuthority(
      r.dataOrigin, 
      ['EIA_WV_LIVE', 'PJM_REALTIME', 'WV_GRID']
    ),
    temporalConsistency: (r) => CommonChecks.recent(r.timestamp, 0.5),
    rangeValidity: (r) => 
      r.value > 0 && r.value < 10000 && 
      CommonChecks.inRange(r.value, r.expectedRange?.min || 0, r.expectedRange?.max || 10000) 
        ? 1.0 : 0.5,
    gridAlignment: (r) => {
      const baseline = r.baseline || 1000;
      return Math.abs(r.value - baseline) < baseline * 2 ? 0.95 : 0.80;
    }
  }, {
    sourceAuthority: 0.3,
    temporalConsistency: 0.25,
    rangeValidity: 0.2,
    gridAlignment: 0.25
  }),

  // DeFi token data quality
  defi: (data) => calculateQuality(data, {
    sourceVerified: (d) => d.source === 'verified_dex' ? 0.95 : 0.70,
    priceValid: (d) => d.price > 0 && d.price < 1000000 ? 1.0 : 0.0,
    liquidityCheck: (d) => d.tvl > 100000 ? 0.95 : 0.60,
    recentUpdate: (d) => CommonChecks.recent(d.lastUpdate, 0.25)
  }, {
    sourceVerified: 0.3,
    priceValid: 0.3,
    liquidityCheck: 0.25,
    recentUpdate: 0.15
  }),

  // Carbon credit quality
  carbon: (credit) => calculateQuality(credit, {
    verifiedRegistry: (c) => 
      ['VERRA', 'GOLD_STANDARD', 'CARBON_TRUST'].includes(c.registry) ? 0.98 : 0.70,
    notRetired: (c) => !c.retired ? 1.0 : 0.0,
    validVintage: (c) => c.vintage >= 2020 ? 0.95 : 0.80,
    serialValid: (c) => c.serialNumber && c.serialNumber.length > 5 ? 1.0 : 0.5
  }, {
    verifiedRegistry: 0.4,
    notRetired: 0.3,
    validVintage: 0.15,
    serialValid: 0.15
  })
};

export default { calculateQuality, CommonChecks, DomainQuality, TIERS };
