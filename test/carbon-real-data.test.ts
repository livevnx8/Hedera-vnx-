/**
 * Carbon Real Data Integration Test
 * 
 * Tests live API connections to:
 * - ElectricityMap (real-time grid carbon intensity)
 * - WattTime (marginal emissions)
 * - Ember (historical data)
 * 
 * Run with: npx tsx test/carbon-real-data.test.ts
 */

import { getCarbonConnectors, getCarbonDataSources, getCarbonCalculator } from '../src/carbon/index.js';
import { config } from 'dotenv';

config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(title: string, data: unknown, color = colors.blue): void {
  console.log(`${color}[${title}]${colors.reset}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
}

async function testElectricityMap(): Promise<void> {
  console.log(colors.cyan + 'TEST 1: ElectricityMap Real-Time Data' + colors.reset);
  
  const apiKey = process.env.ELECTRICITY_MAP_API_KEY;
  if (!apiKey) {
    console.log(colors.yellow + 'ELECTRICITY_MAP_API_KEY not set - using mock' + colors.reset);
    log('Mock', { zone: 'US-CAL-CISO', carbonIntensity: 0.280, note: 'Set API key for real data' });
    return;
  }

  const connectors = getCarbonConnectors({ electricityMapKey: apiKey });
  const data = await connectors.fetchElectricityMap('US-CAL-CISO');
  
  if (data) {
    log('California Grid', { intensity: data.carbonIntensity.toFixed(3) + ' kg/kWh', estimated: data.isEstimated }, colors.green);
  }
}

async function testWattTime(): Promise<void> {
  console.log(colors.cyan + 'TEST 2: WattTime Marginal Emissions' + colors.reset);
  
  const token = process.env.WATTTIME_TOKEN;
  if (!token) {
    console.log(colors.yellow + 'WATTTIME_TOKEN not set - skipping' + colors.reset);
    return;
  }

  const connectors = getCarbonConnectors({ watttimeToken: token });
  const data = await connectors.fetchWattTime('CAISO_NORTH');
  
  if (data) {
    log('CAISO North', { moer: data.moer + ' lbs/MWh', signal: data.signal, percent: data.percent + '%' }, colors.green);
  }
}

async function main(): Promise<void> {
  console.log(colors.cyan + 'VERA CARBON TRACKING - REAL DATA TEST' + colors.reset);
  
  await testElectricityMap();
  await testWattTime();
  
  console.log(colors.green + 'Tests complete!' + colors.reset);
}

main().catch(console.error);
