/**
 * Carbon & Energy Tracking Types
 * 
 * Real-world carbon footprint validation with Hedera Guardian integration
 * and energy consumption monitoring.
 */

export interface CarbonSource {
  sourceId: string;
  name: string;
  type: 'renewable' | 'grid' | 'onsite_generation' | 'purchased';
  location: {
    region: string;
    country: string;
    gridFactor: number; // kg CO2/kWh
  };
  meterId: string;
  metadata: Record<string, unknown>;
}

export interface EnergyReading {
  readingId: string;
  sourceId: string;
  timestamp: number;
  energyKWh: number;
  voltage?: number;
  current?: number;
  powerFactor?: number;
  carbonIntensity: number; // kg CO2/kWh at time of reading
  validated: boolean;
  validator?: string;
}

export interface CarbonEmission {
  emissionId: string;
  sourceId: string;
  period: {
    start: number;
    end: number;
  };
  energyConsumed: number; // kWh
  carbonEmitted: number; // kg CO2e
  methodology: string;
  standard: 'GHG Protocol' | 'ISO 14064' | 'PAS 2050' | 'GLEC';
  verified: boolean;
  verificationProof?: string;
  guardianTokenId?: string; // Hedera token for carbon credits
}

export interface CarbonOffset {
  offsetId: string;
  projectName: string;
  projectType: 'forestry' | 'renewable' | 'methane_capture' | 'direct_air_capture';
  vintage: number;
  tonnesCO2: number;
  standard: 'VCS' | 'Gold Standard' | 'CDM' | 'CAR';
  serialNumber: string;
  retired: boolean;
  retirementTx?: string; // Hedera transaction hash
  metadata: {
    location: string;
    verificationBody: string;
    issuanceDate: number;
  };
}

export interface CarbonReport {
  reportId: string;
  organizationId: string;
  reportingPeriod: {
    start: number;
    end: number;
  };
  scope1: {
    stationary: number;
    mobile: number;
    fugitive: number;
    total: number;
  };
  scope2: {
    locationBased: number;
    marketBased: number;
    total: number;
  };
  scope3: {
    upstream: number;
    downstream: number;
    total: number;
  };
  offsets: {
    purchased: number;
    retired: number;
    netEmissions: number;
  };
  energyMix: {
    renewable: number;
    grid: number;
    onsite: number;
  };
  verified: boolean;
  verification: {
    body: string;
    date: number;
    assuranceLevel: 'limited' | 'reasonable' | 'full';
  };
}

export interface EnergyForecast {
  forecastId: string;
  sourceId: string;
  generatedAt: number;
  horizon: {
    start: number;
    end: number;
  };
  predictions: Array<{
    timestamp: number;
    predictedKWh: number;
    confidence: number;
    carbonIntensity: number;
  }>;
  methodology: string;
  accuracy?: number; // Actual vs predicted (updated after period)
}

export interface ValidationWorkflow {
  workflowId: string;
  type: 'meter_reading' | 'emission_calculation' | 'offset_retirement';
  status: 'pending' | 'in_progress' | 'validated' | 'rejected';
  data: unknown;
  validators: string[];
  signatures: Array<{
    validator: string;
    signature: string;
    timestamp: number;
  }>;
  hederaAnchor?: string; // HCS topic sequence number
  createdAt: number;
  updatedAt: number;
}

export interface GuardianPolicy {
  policyId: string;
  name: string;
  version: string;
  description: string;
  roles: string[];
  schemas: string[];
  hederaTopicId: string;
}
