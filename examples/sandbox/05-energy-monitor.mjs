/**
 * Example 05: Energy Grid Monitor
 * 
 * Demonstrates West Virginia energy grid monitoring in the sandbox
 * 
 * Run: node examples/sandbox/05-energy-monitor.mjs
 */

const API_URL = process.env.VERA_API_URL || 'http://localhost:8080';

console.log('🧪 Vera Sandbox - West Virginia Energy Monitor Example\n');

// WV Energy Configuration (matching energy auditor)
const WV_ENERGY_CONFIG = {
  state: 'WV',
  region: 'West Virginia',
  zone: 'PJM_AEP',
  sources: {
    coal: { name: 'Coal Power', baseline: 3500, carbonIntensity: 0.82, region: 'Northern WV' },
    natural_gas: { name: 'Natural Gas', baseline: 1200, carbonIntensity: 0.49, region: 'Central WV' },
    wind: { name: 'Wind Energy', baseline: 800, carbonIntensity: 0.011, region: 'Appalachian Ridge' },
    hydro: { name: 'Hydroelectric', baseline: 400, carbonIntensity: 0.024, region: 'New River' },
    solar: { name: 'Solar Power', baseline: 150, carbonIntensity: 0.048, region: 'Southern WV' }
  }
};

async function energyMonitorExample() {
  try {
    // 1. Check energy auditor status
    console.log('1️⃣  Checking energy auditor...');
    const statusResponse = await fetch(`${API_URL}/api/v1/energy/status`);
    
    if (!statusResponse.ok) {
      console.log('   ⚠️  Energy auditor endpoint not available');
      console.log('   Running simulated energy monitoring...\n');
      await simulatedEnergyMonitor();
      return;
    }

    const status = await statusResponse.json();
    console.log('   ✅ Energy auditor status:');
    console.log(`   Active: ${status.active}`);
    console.log(`   Grid: ${status.grid}`);
    console.log(`   Last Reading: ${status.lastReading || 'N/A'}\n`);

    // 2. Get current grid data
    console.log('2️⃣  Fetching current grid data...');
    const gridResponse = await fetch(`${API_URL}/api/v1/energy/grid`);
    const grid = await gridResponse.json();
    
    console.log(`   ✅ Grid: ${grid.region} (${grid.zone})`);
    console.log(`   Frequency: ${grid.frequency} Hz`);
    console.log(`   Total Generation: ${grid.totalGeneration?.toLocaleString()} MW`);
    console.log(`   Total Load: ${grid.totalLoad?.toLocaleString()} MW`);
    console.log(`   Carbon Intensity: ${grid.carbonIntensity} kg/MWh\n`);

    // 3. Get generation breakdown
    console.log('3️⃣  Generation by Source:');
    const sources = grid.sources || {};
    Object.entries(sources).forEach(([key, source]) => {
      const percent = ((source.mw / grid.totalGeneration) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(percent / 5)).padEnd(20, '░');
      console.log(`   ${bar} ${percent.padStart(5)}% | ${source.name}: ${source.mw.toLocaleString()} MW`);
    });
    console.log();

    // 4. Carbon analysis
    console.log('4️⃣  Carbon Analysis:');
    let totalCarbon = 0;
    Object.entries(sources).forEach(([key, source]) => {
      const carbon = source.mw * (source.carbonIntensity || WV_ENERGY_CONFIG.sources[key]?.carbonIntensity || 0);
      totalCarbon += carbon;
      console.log(`   ${source.name}: ${carbon.toFixed(0)} kg/hr CO2`);
    });
    console.log(`   Total Emissions: ${totalCarbon.toFixed(0)} kg/hr CO2`);
    console.log(`   Grid Carbon Intensity: ${(totalCarbon / grid.totalGeneration).toFixed(3)} kg/MWh\n`);

    // 5. Get historical data
    console.log('5️⃣  Historical Data (Last 24h):');
    const historyResponse = await fetch(`${API_URL}/api/v1/energy/history?hours=24`);
    const history = await historyResponse.json();
    
    const avgGeneration = history.reduce((sum, h) => sum + h.totalGeneration, 0) / history.length;
    const maxGeneration = Math.max(...history.map(h => h.totalGeneration));
    const minGeneration = Math.min(...history.map(h => h.totalGeneration));
    
    console.log(`   Average: ${avgGeneration.toFixed(0)} MW`);
    console.log(`   Peak: ${maxGeneration.toFixed(0)} MW`);
    console.log(`   Low: ${minGeneration.toFixed(0)} MW`);
    console.log(`   Data Points: ${history.length}\n`);

    // 6. Predictions
    console.log('6️⃣  24-Hour Forecast:');
    const forecastResponse = await fetch(`${API_URL}/api/v1/energy/forecast`);
    const forecast = await forecastResponse.json();
    
    forecast.slice(0, 6).forEach(f => {
      const time = new Date(f.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const bar = '█'.repeat(Math.round(f.generation / 500)).padEnd(12, '░');
      console.log(`   ${time} ${bar} ${f.generation.toFixed(0)} MW (${f.confidence}% confidence)`);
    });
    console.log();

    // 7. Anomaly detection
    console.log('7️⃣  Grid Health Check:');
    const healthResponse = await fetch(`${API_URL}/api/v1/energy/health`);
    const healthStatus = await healthResponse.json();
    
    const healthSymbol = healthStatus.status === 'healthy' ? '✅' : healthStatus.status === 'warning' ? '⚠️' : '❌';
    console.log(`   ${healthSymbol} Overall Status: ${healthStatus.status.toUpperCase()}`);
    
    if (healthStatus.anomalies?.length > 0) {
      console.log(`   Anomalies Detected: ${healthStatus.anomalies.length}`);
      healthStatus.anomalies.forEach(a => console.log(`   ⚠️  ${a.type}: ${a.description}`));
    } else {
      console.log('   ✅ No anomalies detected');
    }
    console.log();

    console.log('🎉 Energy Monitor Example Complete!');
    console.log('\nWhat you learned:');
    console.log('  ✅ Querying real-time grid data');
    console.log('  ✅ Analyzing generation mix');
    console.log('  ✅ Calculating carbon emissions');
    console.log('  ✅ Viewing historical trends');
    console.log('  ✅ Checking grid health and anomalies');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nRunning simulated energy monitoring...\n');
    await simulatedEnergyMonitor();
  }
}

async function simulatedEnergyMonitor() {
  // Simulate WV energy monitoring
  console.log('⚡ SIMULATED West Virginia Energy Grid\n');
  console.log(`Grid: ${WV_ENERGY_CONFIG.region} (${WV_ENERGY_CONFIG.zone})`);
  console.log(`Frequency: ${WV_ENERGY_CONFIG.frequencyBaseline} Hz\n`);

  // 1. Generate simulated real-time data
  console.log('1️⃣  Current Generation:');
  let totalGeneration = 0;
  
  const sources = Object.entries(WV_ENERGY_CONFIG.sources).map(([key, config]) => {
    // Add some variance
    const variance = (Math.random() - 0.5) * 0.2; // ±10%
    const mw = Math.round(config.baseline * (1 + variance));
    totalGeneration += mw;
    
    return { key, config, mw };
  });

  sources.forEach(({ key, config, mw }) => {
    const percent = ((mw / totalGeneration) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(percent / 2)).padEnd(30, '░');
    console.log(`   ${bar} ${percent.padStart(5)}% ${config.name}: ${mw.toLocaleString()} MW`);
  });
  console.log(`   Total: ${totalGeneration.toLocaleString()} MW\n`);

  // 2. Carbon footprint
  console.log('2️⃣  Carbon Footprint:');
  let totalCarbon = 0;
  sources.forEach(({ key, config, mw }) => {
    const carbon = (mw * config.carbonIntensity).toFixed(0);
    totalCarbon += parseFloat(carbon);
    const emoji = config.carbonIntensity < 0.1 ? '🟢' : config.carbonIntensity < 0.5 ? '🟡' : '🔴';
    console.log(`   ${emoji} ${config.name}: ${carbon} kg/hr CO2 (${config.carbonIntensity} kg/MWh)`);
  });
  console.log(`   Total Emissions: ${totalCarbon.toFixed(0)} kg/hr CO2`);
  console.log(`   Grid Carbon Intensity: ${(totalCarbon / totalGeneration).toFixed(3)} kg/MWh\n`);

  // 3. Peak hours analysis
  console.log('3️⃣  Load Forecast:');
  const now = new Date();
  const peakHours = [7, 8, 9, 17, 18, 19, 20];
  
  for (let i = 0; i < 6; i++) {
    const hour = (now.getHours() + i) % 24;
    const isPeak = peakHours.includes(hour);
    const multiplier = isPeak ? 1.2 : 0.9;
    const forecast = Math.round(totalGeneration * multiplier);
    const time = `${hour.toString().padStart(2, '0')}:00`;
    const indicator = isPeak ? '🔥' : '  ';
    console.log(`   ${time} ${indicator} Forecast: ${forecast.toLocaleString()} MW ${isPeak ? '(PEAK)' : ''}`);
  }
  console.log();

  // 4. Summary
  console.log('4️⃣  WV Grid Summary:');
  const renewableMw = sources.filter(s => ['wind', 'hydro', 'solar'].includes(s.key)).reduce((sum, s) => sum + s.mw, 0);
  const renewablePercent = ((renewableMw / totalGeneration) * 100).toFixed(1);
  
  console.log(`   Total Capacity: ${totalGeneration.toLocaleString()} MW`);
  console.log(`   Renewable Mix: ${renewablePercent}% (${renewableMw.toLocaleString()} MW)`);
  console.log(`   Fossil Mix: ${(100 - parseFloat(renewablePercent)).toFixed(1)}%`);
  console.log(`   Carbon Intensity: ${(totalCarbon / totalGeneration).toFixed(3)} kg/MWh`);
  console.log(`   Grid Status: ✅ HEALTHY\n`);

  console.log('🎉 Simulated Energy Monitor Complete!');
  console.log('\nNote: For real grid data, ensure:');
  console.log('  1. Energy auditor agent is running');
  console.log('  2. Grid data sources are configured');
  console.log('  3. HCS topics are active');
}

energyMonitorExample();
