/**
 * Carbon Tracking Module Usage Example
 * 
 * This shows how to use the real data-ready carbon tracking system.
 */

import {
  getCarbonDataSources,
  getCarbonValidationWorkflow,
  getCarbonCalculator
} from '../src/carbon/index.js';

// 1. Configure with real API keys (set these in your .env file)
const carbonData = getCarbonDataSources({
  apiKeys: {
    electricityMap: process.env.ELECTRICITY_MAP_API_KEY,
    watttime: process.env.WATTTIME_TOKEN,
    guardian: process.env.HEDERA_GUARDIAN_KEY
  },
  refreshIntervalMinutes: 15
});

// 2. Register your facility's energy source
async function setupFacility() {
  const facility = await carbonData.registerSource({
    sourceId: 'data-center-facility-01',
    name: 'Primary Data Center',
    type: 'grid',
    location: {
      region: 'US-CA',  // California - low carbon grid
      country: 'US',
      gridFactor: 0.280  // kg CO2/kWh (2024 avg)
    },
    meterId: 'smart-meter-12345',
    metadata: {
      facilityType: 'data_center',
      capacityMW: 10,
      pue: 1.2
    }
  });
  console.log('Facility registered:', facility.sourceId);
}

// 3. Fetch real energy readings
async function collectData() {
  const reading = await carbonData.fetchReading('data-center-facility-01');
  console.log(`Energy: ${reading.energyKWh.toFixed(2)} kWh`);
  console.log(`Carbon intensity: ${reading.carbonIntensity} kg CO2/kWh`);
  
  // Calculate real-time emissions
  const emissions = reading.energyKWh * reading.carbonIntensity;
  console.log(`Real-time emissions: ${emissions.toFixed(2)} kg CO2`);
}

// 4. Set up validation workflow (Hedera Guardian style)
async function setupValidation() {
  const validator = getCarbonValidationWorkflow({
    requiredValidators: 2,
    hederaTopicId: process.env.HEDERA_CARBON_TOPIC_ID,
    autoAnchor: true
  });
  
  // Register validators (DIDs or accounts)
  validator.registerValidator('did:hedera:validator-1');
  validator.registerValidator('did:hedera:validator-2');
  validator.registerValidator('did:hedera:validator-3');
}

// 5. Calculate monthly emissions report
async function generateMonthlyReport() {
  const calculator = getCarbonCalculator({
    reportingStandard: 'GHG Protocol',
    marketBasedScope2: true
  });
  
  const now = Date.now();
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  
  // Get validated readings for the period
  const readings = carbonData.getReadings('data-center-facility-01', monthAgo);
  
  // Calculate Scope 2 emissions
  const facility = carbonData.getSource('data-center-facility-01')!;
  const scope2 = await calculator.calculateScope2(facility, readings, {
    locationBased: false,  // Use market-based (we buy renewable energy)
    marketBasedFactor: 0.0  // 100% renewable = 0 emissions
  });
  
  console.log('Scope 2 emissions:', scope2.carbonEmitted, 'kg CO2');
  
  // Generate full GHG report
  const report = await calculator.generateReport(
    'org-vera-labs',
    { start: monthAgo, end: now },
    {
      scope1: { stationary: 0, mobile: 500, fugitive: 0 },  // Company vehicles
      scope2: { locationBased: 28000, marketBased: 0 },  // 100% renewable
      scope3: {
        upstream: 15000,    // Supply chain
        downstream: 8000    // Product usage
      },
      energyMix: {
        renewable: 95,  // %
        grid: 5,
        onsite: 0
      },
      offsets: {
        purchased: 10000,  // tonnes
        retired: 5000
      }
    }
  );
  
  console.log('Net emissions:', report.offsets.netEmissions, 'kg CO2');
  console.log('Report ID:', report.reportId);
}

// 6. Automated data refresh
async function startMonitoring() {
  // Refresh every 15 minutes (configured interval)
  setInterval(async () => {
    const result = await carbonData.refreshAll();
    console.log(`Updated ${result.sourcesUpdated} sources, ${result.readingsAdded} readings`);
    
    // Push to Hedera Guardian if configured
    if (result.readingsAdded > 0) {
      // Anchor to HCS for audit trail
    }
  }, 15 * 60 * 1000);
}

// Run example
async function main() {
  await setupFacility();
  await setupValidation();
  await collectData();
  await generateMonthlyReport();
  await startMonitoring();
}

main().catch(console.error);
