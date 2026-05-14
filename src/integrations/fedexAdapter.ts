/**
 * FedEx API Integration Adapter
 * 
 * Provides integration between Vera and FedEx APIs for:
 * - Tracking API - real-time package tracking
 * - Ship API - shipment creation and management
 * - Rate & Transit Times API - pricing and delivery estimates
 * - Address Validation API - address verification
 * 
 * All API interactions are logged to Hedera Consensus Service for
 * immutable audit trail and verification.
 * 
 * Note: This is a framework implementation. Production deployment requires:
 * - FedEx API credentials (API Key, Secret, Account Number)
 * - FedEx Developer Portal registration
 * - Environment configuration (sandbox vs production)
 */

import {
  Client,
  TopicMessageSubmitTransaction,
  PrivateKey
} from '@hashgraph/sdk';
import dotenv from 'dotenv';
import { createHash } from 'crypto';

dotenv.config();

export interface FedExCredentials {
  apiKey: string;
  apiSecret: string;
  accountNumber: string;
  environment: 'sandbox' | 'production';
}

export interface FedExTrackingRequest {
  trackingNumber: string;
  includeDetailedScans?: boolean;
}

export interface FedExTrackingResponse {
  trackingNumber: string;
  status: string;
  estimatedDelivery?: string;
  events: Array<{
    timestamp: string;
    status: string;
    location: string;
    description: string;
  }>;
}

export interface FedExShipmentRequest {
  shipper: {
    contact: {
      personName: string;
      phoneNumber: string;
    };
    address: {
      streetLines: string[];
      city: string;
      stateOrProvinceCode: string;
      postalCode: string;
      countryCode: string;
    };
  };
  recipient: {
    contact: {
      personName: string;
      phoneNumber: string;
    };
    address: {
      streetLines: string[];
      city: string;
      stateOrProvinceCode: string;
      postalCode: string;
      countryCode: string;
    };
  };
  packages: Array<{
    weight: {
      units: 'LB' | 'KG';
      value: number;
    };
    dimensions?: {
      length: number;
      width: number;
      height: number;
      units: 'IN' | 'CM';
    };
  }>;
  serviceType: string;
}

export class FedExAdapter {
  private credentials: FedExCredentials;
  private hederaClient: Client;
  private hcsTopicId: string;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(credentials: FedExCredentials, hcsTopicId?: string) {
    this.credentials = credentials;
    this.baseUrl = credentials.environment === 'production'
      ? 'https://apis.fedex.com'
      : 'https://apis-sandbox.fedex.com';
    this.hcsTopicId = hcsTopicId || process.env.FEDEX_ROUTE_TOPIC_ID || '';

    // Initialize Hedera client for HCS logging
    const operatorId = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
    const privateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;

    if (operatorId && privateKeyStr) {
      let privateKey;
      if (privateKeyStr.length === 64 || privateKeyStr.startsWith('0x')) {
        privateKey = PrivateKey.fromStringECDSA(privateKeyStr);
      } else if (privateKeyStr.length === 96) {
        privateKey = PrivateKey.fromStringED25519(privateKeyStr);
      } else {
        privateKey = PrivateKey.fromString(privateKeyStr);
      }

      const network = process.env.HEDERA_NETWORK || 'mainnet';
      this.hederaClient = network === 'mainnet'
        ? Client.forMainnet()
        : Client.forTestnet();
      this.hederaClient.setOperator(operatorId, privateKey);
    } else {
      throw new Error('Hedera credentials required for HCS logging');
    }
  }

  /**
   * Generate OAuth 2.0 access token for FedEx API
   */
  private async getAccessToken(): Promise<string> {
    // Check if token is still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.credentials.apiKey,
          client_secret: this.credentials.apiSecret
        })
      });

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.status}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute buffer

      return this.accessToken;
    } catch (error) {
      console.error('Failed to get FedEx access token:', error);
      throw error;
    }
  }

  /**
   * Log API interaction to Hedera Consensus Service
   */
  private async logToHCS(type: string, data: any): Promise<void> {
    if (!this.hcsTopicId) {
      console.warn('HCS topic not configured, skipping log');
      return;
    }

    const message = {
      type: `FEDEX_API_${type}`,
      timestamp: Date.now(),
      agent: 'vera-fedex-adapter',
      fedex: {
        environment: this.credentials.environment,
        accountNumber: this.credentials.accountNumber,
        ...data
      },
      verification: {
        verifier: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
        hash: createHash('sha256').update(JSON.stringify(data) + Date.now()).digest('hex')
      }
    };

    try {
      await new TopicMessageSubmitTransaction()
        .setTopicId(this.hcsTopicId)
        .setMessage(JSON.stringify(message))
        .execute(this.hederaClient);

      console.log(`✅ FedEx API call logged to HCS: ${type}`);
    } catch (error) {
      console.error('Failed to log to HCS:', error);
      // Don't throw - logging failures shouldn't break API calls
    }
  }

  /**
   * Track a FedEx package
   */
  async trackPackage(request: FedExTrackingRequest): Promise<FedExTrackingResponse> {
    const token = await this.getAccessToken();

    try {
      const response = await fetch(`${this.baseUrl}/track/v1/trackingnumbers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        },
        body: JSON.stringify({
          trackingInfo: [{
            trackingNumberInfo: {
              trackingNumber: request.trackingNumber
            }
          }],
          includeDetailedScans: request.includeDetailedScans ?? true
        })
      });

      if (!response.ok) {
        throw new Error(`Tracking request failed: ${response.status}`);
      }

      const data = await response.json();

      // Log to HCS
      await this.logToHCS('TRACK', {
        trackingNumber: request.trackingNumber,
        status: data.output?.completeTrackResults?.[0]?.trackResults?.[0]?.latestStatusDetail?.description || 'Unknown',
        scanCount: data.output?.completeTrackResults?.[0]?.trackResults?.[0]?.scanEvents?.length || 0
      });

      // Transform response
      const trackResult = data.output?.completeTrackResults?.[0]?.trackResults?.[0];
      
      return {
        trackingNumber: request.trackingNumber,
        status: trackResult?.latestStatusDetail?.description || 'Unknown',
        estimatedDelivery: trackResult?.estimatedDeliveryTimeWindow?.ends,
        events: trackResult?.scanEvents?.map((event: any) => ({
          timestamp: event.date + 'T' + event.time,
          status: event.eventDescription,
          location: `${event.scanLocation?.city}, ${event.scanLocation?.stateOrProvinceCode}`,
          description: event.eventDescription
        })) || []
      };
    } catch (error) {
      console.error('FedEx tracking error:', error);
      throw error;
    }
  }

  /**
   * Create a FedEx shipment
   */
  async createShipment(request: FedExShipmentRequest): Promise<any> {
    const token = await this.getAccessToken();

    try {
      const response = await fetch(`${this.baseUrl}/ship/v1/shipments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        },
        body: JSON.stringify({
          requestedShipment: {
            shipper: request.shipper,
            recipient: request.recipient,
            pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
            serviceType: request.serviceType,
            packagingType: 'YOUR_PACKAGING',
            shippingChargesPayment: {
              paymentType: 'SENDER',
              payor: {
                responsibleParty: {
                  accountNumber: this.credentials.accountNumber
                }
              }
            },
            requestedPackageLineItems: request.packages.map((pkg, index) => ({
              weight: pkg.weight,
              dimensions: pkg.dimensions
            }))
          },
          accountNumber: {
            value: this.credentials.accountNumber
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Shipment creation failed: ${response.status}`);
      }
     
      const data = await response.json();

      // Log to HCS
      await this.logToHCS('SHIP', {
        trackingNumber: data.output?.transactionShipments?.[0]?.pieceResponses?.[0]?.trackingNumber,
        serviceType: request.serviceType,
        origin: request.shipper.address.city,
        destination: request.recipient.address.city,
        packageCount: request.packages.length
      });

      return data;
    } catch (error) {
      console.error('FedEx shipment creation error:', error);
      throw error;
    }
  }

  /**
   * Get shipping rates and transit times
   */
  async getRates(request: FedExShipmentRequest): Promise<any> {
    const token = await this.getAccessToken();

    try {
      const response = await fetch(`${this.baseUrl}/rate/v1/rates/quotes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        },
        body: JSON.stringify({
          requestedShipment: {
            shipper: request.shipper,
            recipient: request.recipient,
            pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
            requestedPackageLineItems: request.packages.map((pkg, index) => ({
              weight: pkg.weight,
              dimensions: pkg.dimensions
            }))
          },
          accountNumber: {
            value: this.credentials.accountNumber
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Rate request failed: ${response.status}`);
      }

      const data = await response.json();

      // Log to HCS
      await this.logToHCS('RATE', {
        origin: request.shipper.address.city,
        destination: request.recipient.address.city,
        serviceCount: data.output?.rateReplyDetails?.length || 0
      });

      return data;
    } catch (error) {
      console.error('FedEx rate request error:', error);
      throw error;
    }
  }

  /**
   * Validate an address
   */
  async validateAddress(address: FedExShipmentRequest['shipper']['address']): Promise<any> {
    const token = await this.getAccessToken();

    try {
      const response = await fetch(`${this.baseUrl}/address/v1/addresses/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        },
        body: JSON.stringify({
          addressesToValidate: [{
            address: {
              streetLines: address.streetLines,
              city: address.city,
              stateOrProvinceCode: address.stateOrProvinceCode,
              postalCode: address.postalCode,
              countryCode: address.countryCode
            }
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Address validation failed: ${response.status}`);
      }

      const data = await response.json();

      // Log to HCS
      await this.logToHCS('VALIDATE', {
        addressHash: createHash('sha256').update(JSON.stringify(address)).digest('hex').substring(0, 16),
        resolved: data.output?.resolvedAddresses?.length > 0
      });

      return data;
    } catch (error) {
      console.error('FedEx address validation error:', error);
      throw error;
    }
  }

  /**
   * Get adapter status
   */
  getStatus(): {
    connected: boolean;
    environment: string;
    hcsEnabled: boolean;
    hcsTopicId: string;
  } {
    return {
      connected: !!this.accessToken && Date.now() < this.tokenExpiry,
      environment: this.credentials.environment,
      hcsEnabled: !!this.hcsTopicId,
      hcsTopicId: this.hcsTopicId
    };
  }

  /**
   * Close the adapter and clean up resources
   */
  close(): void {
    if (this.hederaClient) {
      this.hederaClient.close();
    }
  }
}

// Export factory function for easy instantiation
export function createFedExAdapter(
  credentials?: Partial<FedExCredentials>,
  hcsTopicId?: string
): FedExAdapter {
  // Use environment variables if credentials not provided
  const creds: FedExCredentials = {
    apiKey: credentials?.apiKey || process.env.FEDEX_API_KEY || '',
    apiSecret: credentials?.apiSecret || process.env.FEDEX_API_SECRET || '',
    accountNumber: credentials?.accountNumber || process.env.FEDEX_ACCOUNT_NUMBER || '',
    environment: credentials?.environment || (process.env.FEDEX_ENVIRONMENT as any) || 'sandbox'
  };

  if (!creds.apiKey || !creds.apiSecret || !creds.accountNumber) {
    throw new Error('FedEx credentials required. Set FEDEX_API_KEY, FEDEX_API_SECRET, and FEDEX_ACCOUNT_NUMBER in .env');
  }

  return new FedExAdapter(creds, hcsTopicId);
}

export default FedExAdapter;
