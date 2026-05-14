/**
 * Vera Agent Template Registry
 * 
 * Defines reusable agent templates for rapid vertical deployment.
 * Templates include configuration, capabilities, topics, and lifecycle settings.
 */

export const AGENT_TEMPLATES = {
  // Healthcare Vertical
  'healthcare-supply': {
    name: 'Healthcare Supply Chain Agent',
    category: 'healthcare',
    capabilities: ['track_medical_supply', 'verify_hipaa', 'audit_logs', 'temperature_monitoring', 'expiration_tracking'],
    requiredTopics: ['HIPAA_AUDIT', 'SUPPLY_CHAIN', 'MEDICAL_TEMPERATURE'],
    defaultInterval: 300000, // 5 minutes
    config: {
      complianceLevel: 'HIPAA',
      auditRetentionDays: 2555, // 7 years
      alertThresholds: {
        temperature: { min: 2, max: 8 }, // Celsius for vaccines
        expirationWarningDays: 30
      }
    }
  },

  'healthcare-compliance': {
    name: 'HIPAA Compliance Auditor',
    category: 'healthcare',
    capabilities: ['audit_phi_access', 'verify_encryption', 'check_access_controls', 'log_integrity_check'],
    requiredTopics: ['HIPAA_AUDIT', 'PHI_ACCESS_LOG', 'SECURITY_COMPLIANCE'],
    defaultInterval: 600000, // 10 minutes
    config: {
      complianceLevel: 'HIPAA',
      auditStandard: 'HITECH',
      autoRemediation: false
    }
  },

  // Finance Vertical
  'finance-fraud-detection': {
    name: 'Real-time Fraud Detection Agent',
    category: 'finance',
    capabilities: ['detect_anomalies', 'monitor_transactions', 'score_risk', 'alert_suspicious', 'pattern_analysis'],
    requiredTopics: ['FRAUD_ALERTS', 'TRANSACTION_STREAM', 'RISK_SCORES'],
    defaultInterval: 60000, // 1 minute for real-time
    config: {
      detectionThreshold: 0.75,
      mlModel: 'fraud-v2',
      autoBlock: false,
      alertSeverity: ['critical', 'high']
    }
  },

  'finance-compliance': {
    name: 'Financial Compliance Monitor',
    category: 'finance',
    capabilities: ['monitor_kyc', 'check_aml', 'audit_transactions', 'regulatory_reporting'],
    requiredTopics: ['COMPLIANCE_LOG', 'KYC_CHECKS', 'AML_ALERTS', 'REGULATORY_REPORTS'],
    defaultInterval: 300000,
    config: {
      regulations: ['SOX', 'GDPR', 'PCI-DSS'],
      reportSchedule: 'daily',
      retentionPeriod: 2555
    }
  },

  // Logistics Vertical
  'logistics-tracker': {
    name: 'Multi-Carrier Shipment Tracker',
    category: 'logistics',
    capabilities: ['track_shipment', 'monitor_carrier', 'predict_delivery', 'alert_delays'],
    requiredTopics: ['SHIPMENT_STATUS', 'CARRIER_UPDATES', 'DELIVERY_PREDICTIONS'],
    defaultInterval: 120000, // 2 minutes
    config: {
      carriers: ['fedex', 'ups', 'dhl', 'usps'],
      predictionModel: 'delivery-ml-v1',
      alertOnDelay: 30 // minutes
    }
  },

  'logistics-optimizer': {
    name: 'Route Optimization Agent',
    category: 'logistics',
    capabilities: ['optimize_route', 'reduce_fuel', 'avoid_congestion', 'multi_stop_planning'],
    requiredTopics: ['ROUTE_OPTIMIZATION', 'TRAFFIC_DATA', 'FUEL_COSTS'],
    defaultInterval: 300000,
    config: {
      optimizationCriteria: ['time', 'fuel', 'emissions'],
      maxStops: 20,
      realTimeTraffic: true
    }
  },

  // Government Vertical
  'gov-procurement': {
    name: 'Government Procurement Auditor',
    category: 'government',
    capabilities: ['audit_spending', 'verify_vendors', 'check_contracts', 'transparency_reporting'],
    requiredTopics: ['PROCUREMENT_LOG', 'VENDOR_REGISTRY', 'CONTRACT_AUDITS'],
    defaultInterval: 600000,
    config: {
      transparencyLevel: 'public',
      auditDepth: 'comprehensive',
      reportPublicly: true
    }
  },

  // Retail Vertical
  'retail-inventory': {
    name: 'Smart Inventory Optimizer',
    category: 'retail',
    capabilities: ['track_inventory', 'predict_demand', 'optimize_stock', 'prevent_stockouts'],
    requiredTopics: ['INVENTORY_LEVELS', 'DEMAND_FORECASTS', 'STOCK_ALERTS'],
    defaultInterval: 300000,
    config: {
      forecastHorizon: '30d',
      safetyStockMultiplier: 1.5,
      autoReorder: false
    }
  },

  'retail-demand': {
    name: 'Demand Forecasting Agent',
    category: 'retail',
    capabilities: ['analyze_trends', 'predict_sales', 'seasonal_adjustment', 'promotion_impact'],
    requiredTopics: ['SALES_DATA', 'MARKET_TRENDS', 'WEATHER_DATA'],
    defaultInterval: 600000,
    config: {
      forecastModel: 'lstm-v2',
      confidenceThreshold: 0.85
    }
  },

  // Manufacturing Vertical
  'manufacturing-qa': {
    name: 'Quality Assurance Agent',
    category: 'manufacturing',
    capabilities: ['monitor_quality', 'detect_defects', 'track_metrics', 'compliance_check'],
    requiredTopics: ['QA_METRICS', 'DEFECT_LOGS', 'COMPLIANCE_CHECKS'],
    defaultInterval: 180000, // 3 minutes
    config: {
      inspectionFrequency: 'continuous',
      defectThreshold: 0.01, // 1%
      autoHalt: true
    }
  },

  // Base template for custom agents
  'custom': {
    name: 'Custom Agent',
    category: 'custom',
    capabilities: [],
    requiredTopics: ['CUSTOM_EVENTS'],
    defaultInterval: 300000,
    config: {
      custom: true
    }
  }
};

/**
 * Get template by ID
 */
export function getTemplate(templateId) {
  return AGENT_TEMPLATES[templateId] || AGENT_TEMPLATES['custom'];
}

/**
 * List all templates by category
 */
export function getTemplatesByCategory(category) {
  return Object.entries(AGENT_TEMPLATES)
    .filter(([id, template]) => template.category === category)
    .map(([id, template]) => ({ id, ...template }));
}

/**
 * List all available categories
 */
export function getCategories() {
  const categories = new Set();
  Object.values(AGENT_TEMPLATES).forEach(t => categories.add(t.category));
  return Array.from(categories);
}

/**
 * Validate agent configuration against template
 */
export function validateConfig(templateId, config) {
  const template = getTemplate(templateId);
  const errors = [];

  // Check required fields
  if (!config.id) errors.push('Missing agent ID');
  if (!config.credentials) errors.push('Missing Hedera credentials');
  
  // Check topic coverage
  const missingTopics = template.requiredTopics.filter(
    topic => !config.topics || !config.topics[topic]
  );
  if (missingTopics.length > 0) {
    errors.push(`Missing required topics: ${missingTopics.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: []
  };
}

/**
 * Create agent configuration from template
 */
export function createAgentConfig(templateId, overrides = {}) {
  const template = getTemplate(templateId);
  
  // Load credentials from environment with fallback
  const credentials = overrides.credentials || {
    accountId: process.env.HEDERA_ACCOUNT_ID || process.env.HEDERA_OPERATOR_ACCOUNT_ID,
    privateKey: process.env.HEDERA_PRIVATE_KEY || process.env.HEDERA_OPERATOR_PRIVATE_KEY
  };
  
  // Validate credentials
  if (!credentials.accountId || !credentials.privateKey) {
    console.warn(`⚠️  Missing Hedera credentials for ${templateId} agent:`);
    if (!credentials.accountId) console.warn('   - HEDERA_ACCOUNT_ID not set');
    if (!credentials.privateKey) console.warn('   - HEDERA_PRIVATE_KEY (or HEDERA_PRIVATE_KEY_DER) not set');
    console.warn('   Agent will fail to initialize. Set these env vars and restart.');
  }
  
  return {
    id: overrides.id || `${template.category}-${Date.now()}`,
    type: template.name,
    version: '1.0.0',
    cycleInterval: overrides.interval || template.defaultInterval,
    capabilities: template.capabilities,
    topics: template.requiredTopics.reduce((acc, topic) => {
      acc[topic] = overrides.topics?.[topic] || process.env[`TOPIC_${topic}`];
      return acc;
    }, {}),
    config: {
      ...template.config,
      ...overrides.config
    },
    credentials
  };
}

export default AGENT_TEMPLATES;
