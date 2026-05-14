#!/usr/bin/env node
// Minimal test for Energy Auditor logic

import { DomainQuality } from './blueprints/data-quality.mjs';

console.log('Testing DomainQuality.energy...');

try {
  const testData = {
    source: 'Coal Power',
    sourceId: 'coal',
    value: 3500,
    unit: 'MW',
    carbonIntensity: 0.82,
    region: 'Northern WV',
    isPeakPeriod: true,
    timestamp: Date.now(),
    dataOrigin: 'EIA_WV_LIVE',
    expectedRange: { min: 1750, max: 5250 }
  };
  
  console.log('Input:', testData);
  const quality = DomainQuality.energy(testData);
  console.log('Output:', quality);
  console.log('✅ DomainQuality.energy works!');
} catch (e) {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
}
