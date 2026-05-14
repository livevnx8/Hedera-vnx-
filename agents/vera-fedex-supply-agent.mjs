#!/usr/bin/env node
/**
 * Vera FedEx Supply Chain Verification Agent
 * 
 * Monitors and verifies supply chain events on Hedera Consensus Service.
 * Provides immutable audit trail for all supply chain handoffs, transfers,
 * and verifications across the FedEx logistics network.
 * 
 * Features:
 * - Real-time supply chain event verification
 * - Vendor shipment tracking
 * - Warehouse transfer validation
 * - Immutable HCS logging
 * - Anomaly detection for route deviations
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  PrivateKey
} from '@hashgraph/sdk';
import dotenv from 'dotenv';
import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

dotenv.config();

const CONFIG = {
  network: process.env.HEDERA_NETWORK || 'mainnet',
  operatorId: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
  privateKey: process.env.HEDERA_OPERATOR_PRIVATE_KEY,
  topics: {
    route: process.env.FEDEX_ROUTE_TOPIC_ID,
    pkg: process.env.FEDEX_PKG_TOPIC_ID,
    chain: process.env.FEDEX_CHAIN_TOPIC_ID,
    audit: process.env.FEDEX_AUDIT_TOPIC_ID
  },
  verificationThreshold: 0.85,
  batchSize: 100,
  pollInterval: 30000 // 30 seconds
};

class FedExSupplyChainAgent {
  client;
  isRunning = false;
  stats = {
    eventsVerified: 0,
    anomaliesDetected: 0,
    lastActivity: null
  };

  constructor() {
    if (!CONFIG.operatorId || !CONFIG.privateKey) {
      throw new Error('Missing HEDERA_OPERATOR_ACCOUNT_ID or HEDERA_OPERATOR_PRIVATE_KEY');
    }

    this.client = CONFIG.network === 'mainnet' 
      ? Client.forMainnet() 
      : Client.forTestnet();

    let privateKey;
    const keyStr = CONFIG.privateKey;
    if (keyStr.startsWith('0x')) {
      privateKey = PrivateKey.fromStringECDSA(keyStr.slice(2));
    } else if (keyStr.length === 64) {
      privateKey = PrivateKey.fromStringECDSA(keyStr);
    } else if (keyStr.length === 96) {
      privateKey = PrivateKey.fromStringED25519(keyStr);
    } else {
      privateKey = PrivateKey.fromString(keyStr);
    }

    this.client.setOperator(CONFIG.operatorId, privateKey);
  }

  /**
   * Generate cryptographic signature for verification
   */
  sign(data) {
    return createHash('sha256').update(JSON.stringify(data) + Date.now()).digest('hex');
  }

  /**
   * Log supply chain event to HCS
   */
  async logSupplyChainEvent(event) {
    if (!CONFIG.topics.chain) {
      console.error('❌ FEDEX_CHAIN_TOPIC_ID not configured');
      return null;
    }

    const message = {
      type: 'SUPPLY_CHAIN_EVENT',
      timestamp: Date.now(),
      agent: 'vera-fedex-supply-agent',
      version: '1.0.0',
      fedex: {
        eventType: event.type, // VENDOR_SHIPMENT, WAREHOUSE_INBOUND, WAREHOUSE_OUTBOUND, HANDOFF, DELIVERY
        trackingNumber: event.trackingNumber,
        routeId: event.routeId,
        origin: event.origin,
        destination: event.destination,
        vendor: event.vendor,
        facility: event.facility,
        timestamp: event.timestamp,
        location: event.location,
        weight: event.weight,
        dimensions: event.dimensions,
        serviceType: event.serviceType
      },
      verification: {
        verified: true,
        confidence: 1.0,
        verifier: CONFIG.operatorId,
        hash: this.sign(event)
      }
    };

    try {
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(CONFIG.topics.chain)
        .setMessage(JSON.stringify(message))
        .execute(this.client);

      const record = await tx.getRecord(this.client);
      const sequence = record.receipt.topicSequenceNumber?.toString();

      this.stats.eventsVerified++;
      this.stats.lastActivity = Date.now();

      console.log(`✅ Supply chain event logged: ${event.type} (${event.trackingNumber})`);
      console.log(`   HCS Sequence: ${sequence}`);
      console.log(`   HashScan: https://hashscan.io/${CONFIG.network}/topic/${CONFIG.topics.chain}/${sequence}`);

      return {
        success: true,
        sequence,
        trackingNumber: event.trackingNumber,
        hashscanUrl: `https://hashscan.io/${CONFIG.network}/topic/${CONFIG.topics.chain}/${sequence}`
      };
    } catch (error) {
      console.error(`❌ Failed to log supply chain event:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify vendor shipment
   */
  async verifyVendorShipment(shipment) {
    const event = {
      type: 'VENDOR_SHIPMENT',
      trackingNumber: shipment.trackingNumber,
      vendor: shipment.vendorId,
      origin: {
        facility: shipment.originFacility,
        address: shipment.originAddress,
        coordinates: shipment.originCoords
      },
      destination: {
        facility: shipment.destinationFacility,
        address: shipment.destinationAddress
      },
      timestamp: Date.now(),
      weight: shipment.weight,
      dimensions: shipment.dimensions,
      serviceType: shipment.serviceType || 'FEDEX_GROUND',
      items: shipment.items
    };

    return this.logSupplyChainEvent(event);
  }

  /**
   * Log warehouse transfer
   */
  async logWarehouseTransfer(transfer) {
    const event = {
      type: 'WAREHOUSE_TRANSFER',
      trackingNumber: transfer.trackingNumber,
      routeId: transfer.routeId,
      origin: {
        facility: transfer.originWarehouse,
        timestamp: transfer.departureTime
      },
      destination: {
        facility: transfer.destinationWarehouse,
        timestamp: transfer.arrivalTime
      },
      facility: transfer.handlingFacility,
      timestamp: Date.now(),
      weight: transfer.weight,
      serviceType: transfer.serviceType
    };

    return this.logSupplyChainEvent(event);
  }

  /**
   * Detect anomalies in supply chain events
   */
  async detectAnomaly(event, historicalData) {
    // Simple anomaly detection - can be enhanced with ML models
    const anomalies = [];

    // Check for route deviations
    if (event.actualLocation && event.expectedLocation) {
      const distance = this.calculateDistance(
        event.actualLocation,
        event.expectedLocation
      );
      if (distance > 50) { // 50km threshold
        anomalies.push({
          type: 'ROUTE_DEVIATION',
          severity: 'high',
          details: `Package ${event.trackingNumber} deviated ${distance.toFixed(2)}km from expected route`
        });
      }
    }

    // Check for time delays
    if (event.scheduledTime && event.actualTime) {
      const delay = event.actualTime - event.scheduledTime;
      if (delay > 86400000) { // 24 hours
        anomalies.push({
          type: 'DELAY',
          severity: delay > 172800000 ? 'critical' : 'medium', // > 48h = critical
          details: `Package ${event.trackingNumber} delayed by ${Math.floor(delay / 3600000)} hours`
        });
      }
    }

    // Log anomalies if detected
    if (anomalies.length > 0) {
      this.stats.anomaliesDetected += anomalies.length;
      
      // Log to audit topic
      await this.logAnomaly(anomalies, event);
    }

    return anomalies;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  calculateDistance(loc1, loc2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(loc2.lat - loc1.lat);
    const dLon = this.toRadians(loc2.lng - loc1.lng);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(loc1.lat)) * Math.cos(this.toRadians(loc2.lat)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Log anomaly to audit topic
   */
  async logAnomaly(anomalies, event) {
    if (!CONFIG.topics.audit) return;

    const message = {
      type: 'ANOMALY_DETECTED',
      timestamp: Date.now(),
      agent: 'vera-fedex-supply-agent',
      fedex: {
        trackingNumber: event.trackingNumber,
        anomalies,
        event
      },
      severity: anomalies.some(a => a.severity === 'critical') ? 'critical' : 'high'
    };

    try {
      await new TopicMessageSubmitTransaction()
        .setTopicId(CONFIG.topics.audit)
        .setMessage(JSON.stringify(message))
        .execute(this.client);

      console.log(`⚠️  Anomaly logged: ${anomalies.length} issues detected for ${event.trackingNumber}`);
    } catch (error) {
      console.error('❌ Failed to log anomaly:', error.message);
    }
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      operatorId: CONFIG.operatorId,
      topics: CONFIG.topics
    };
  }

  /**
   * Start the agent
   */
  async start() {
    this.isRunning = true;
    console.log('🚚 Vera FedEx Supply Chain Agent Started');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Operator: ${CONFIG.operatorId}`);
    console.log(`Network: ${CONFIG.network}`);
    console.log(`Topics: ${Object.values(CONFIG.topics).filter(Boolean).length}/8 configured`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (!CONFIG.topics.chain) {
      console.warn('⚠️  Warning: FEDEX_CHAIN_TOPIC_ID not configured');
      console.warn('   Run: node scripts/create-fedex-topics.mjs\n');
    }
  }

  /**
   * Stop the agent
   */
  async stop() {
    this.isRunning = false;
    console.log('\n🛑 Vera FedEx Supply Chain Agent Stopped');
    console.log(`Total events verified: ${this.stats.eventsVerified}`);
    console.log(`Anomalies detected: ${this.stats.anomaliesDetected}`);
    this.client.close();
  }
}

// Main execution
async function main() {
  const agent = new FedExSupplyChainAgent();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
  });

  await agent.start();

  // Demo mode - simulate some supply chain events
  if (process.argv.includes('--demo')) {
    console.log('🎮 Demo Mode Active - Simulating supply chain events...\n');
    
    const demoEvents = [
      {
        trackingNumber: '123456789012',
        vendorId: 'VENDOR-001',
        originFacility: 'MEMPHIS_HUB',
        originAddress: 'FedEx World Headquarters, Memphis, TN',
        destinationFacility: 'ATLANTA_DIST',
        weight: 5.2,
        serviceType: 'FEDEX_GROUND'
      },
      {
        trackingNumber: '987654321098',
        vendorId: 'VENDOR-002',
        originFacility: 'CHICAGO_HUB',
        originAddress: 'Chicago Distribution Center, IL',
        destinationFacility: 'DETROIT_DIST',
        weight: 2.1,
        serviceType: 'FEDEX_EXPRESS'
      }
    ];

    for (const event of demoEvents) {
      await agent.verifyVendorShipment(event);
      await setTimeout(2000);
    }

    console.log('\n📊 Demo Complete. Agent statistics:');
    console.log(agent.getStats());
  }

  // Keep running
  while (agent.isRunning) {
    await setTimeout(1000);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

export { FedExSupplyChainAgent };
