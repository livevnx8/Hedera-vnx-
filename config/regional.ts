/**
 * Regional Configuration for Multi-Region Deployment
 * 3-Region Setup: US-East, EU-West, Asia-Pacific
 */

export interface RegionDefinition {
  name: string;
  endpoint: string;
  hcsTopicId: string;
  priority: number; // Lower = higher priority
  geoLocation: {
    lat: number;
    lon: number;
  };
  capacity: {
    maxAgents: number;
    maxHcsPerSecond: number;
  };
}

// Regional Definitions
export const REGIONS: Record<string, RegionDefinition> = {
  'us-east': {
    name: 'us-east',
    endpoint: 'https://us-east.veralattice.com',
    hcsTopicId: process.env.VERA_US_EAST_TOPIC_ID || '0.0.10409351',
    priority: 1,
    geoLocation: { lat: 39.0, lon: -77.0 }, // Virginia
    capacity: {
      maxAgents: 5000,
      maxHcsPerSecond: 500,
    },
  },
  'eu-west': {
    name: 'eu-west',
    endpoint: 'https://eu-west.veralattice.com',
    hcsTopicId: process.env.VERA_EU_WEST_TOPIC_ID || '0.0.10409352',
    priority: 2,
    geoLocation: { lat: 53.0, lon: -8.0 }, // Ireland
    capacity: {
      maxAgents: 3000,
      maxHcsPerSecond: 300,
    },
  },
  'apac': {
    name: 'apac',
    endpoint: 'https://apac.veralattice.com',
    hcsTopicId: process.env.VERA_APAC_TOPIC_ID || '0.0.10409353',
    priority: 3,
    geoLocation: { lat: 1.3, lon: 103.8 }, // Singapore
    capacity: {
      maxAgents: 2000,
      maxHcsPerSecond: 200,
    },
  },
};

// Current region from environment
export const CURRENT_REGION = process.env.VERA_REGION || 'us-east';

// Primary region configuration
export const PRIMARY_REGION = 'us-east';
export const BACKUP_REGIONS = ['eu-west', 'apac'];

// Health check settings
export const HEALTH_CHECK_CONFIG = {
  intervalMs: 10000, // 10 seconds
  timeoutMs: 5000,
  retries: 3,
};

// State sync settings
export const SYNC_CONFIG = {
  intervalMs: 30000, // 30 seconds
  batchSize: 100,
  maxConflictRetries: 3,
};

// Failover settings
export const FAILOVER_CONFIG = {
  autoFailover: true,
  failoverDelayMs: 5000,
  requireHealthyBackups: 1,
};

/**
 * Get region by user location (for Geo-DNS)
 */
export function getRegionByLocation(lat: number, lon: number): string {
  let closest = 'us-east';
  let minDistance = Infinity;

  for (const [name, region] of Object.entries(REGIONS)) {
    const distance = Math.sqrt(
      Math.pow(region.geoLocation.lat - lat, 2) +
      Math.pow(region.geoLocation.lon - lon, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closest = name;
    }
  }

  return closest;
}

/**
 * Get all region endpoints
 */
export function getAllRegionEndpoints(): string[] {
  return Object.values(REGIONS).map(r => r.endpoint);
}

/**
 * Check if current region is primary
 */
export function isPrimaryRegion(): boolean {
  return CURRENT_REGION === PRIMARY_REGION;
}
