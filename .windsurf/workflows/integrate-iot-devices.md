---
description: Integrate IoT devices with Vera lattice
---

# Integrate IoT Devices

Connect IoT devices to Vera's Flower of Life lattice.

## Quick Setup

```bash
// turbo
# MQTT broker for IoT
docker run -d -p 1883:1883 -p 9001:9001 eclipse-mosquitto

# Or use AWS IoT Core
aws iot create-thing --thing-name vera-sensor-001
```

## Device Onboarding

```bash
// turbo
# Register device
curl -X POST http://localhost:8088/api/iot/devices \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "deviceId": "sensor-001",
    "type": "environmental",
    "capabilities": ["temperature", "humidity", "co2"],
    "location": {"lat": 37.7749, "lon": -122.4194},
    "firmware": "v1.2.0"
  }'

# Generate device certificates
aws iot create-keys-and-certificate \
  --set-as-active \
  --certificate-pem-outfile cert.pem \
  --public-key-outfile public.key \
  --private-key-outfile private.key
```

## MQTT Integration

```bash
// turbo
# IoT connector
cat > src/iot/mqttConnector.ts << 'EOF'
import mqtt from 'mqtt';
import { EventEmitter } from 'events';

export class IoTConnector extends EventEmitter {
  private client: mqtt.MqttClient;

  constructor(brokerUrl: string, options?: mqtt.IClientOptions) {
    super();
    this.client = mqtt.connect(brokerUrl, options);
    
    this.client.on('connect', () => {
      console.log('Connected to MQTT broker');
      this.subscribe('vera/devices/+/data');
    });
    
    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });
  }

  subscribe(pattern: string): void {
    this.client.subscribe(pattern);
  }

  private handleMessage(topic: string, message: Buffer): void {
    const deviceId = topic.split('/')[2];
    const data = JSON.parse(message.toString());
    
    this.emit('device:data', { deviceId, data, timestamp: Date.now() });
  }

  sendCommand(deviceId: string, command: string, payload: unknown): void {
    const topic = `vera/devices/${deviceId}/commands`;
    this.client.publish(topic, JSON.stringify({ command, payload }));
  }
}

export const iotConnector = new IoTConnector('mqtt://localhost:1883');
EOF
```

## Device Shadow

```bash
// turbo
# Device state management
node -e "
import { deviceShadow } from './src/iot/deviceShadow.js';

// Update shadow
await deviceShadow.update('sensor-001', {
  reported: {
    temperature: 22.5,
    humidity: 45,
    battery: 87
  },
  desired: {
    samplingRate: 60
  }
});

// Get shadow
const shadow = await deviceShadow.get('sensor-001');
console.log('Device state:', shadow);
"
```

## Stream Processing

```bash
// turbo
# Process IoT data streams
node -e "
import { iotStreams } from './src/iot/iotStreams.js';

// Aggregate sensor data
iotStreams.process('temperature', {
  window: '5m',
  aggregation: 'avg',
  output: 'vera/analytics/temperature-avg'
});

// Anomaly detection
iotStreams.detectAnomalies({
  metric: 'co2',
  threshold: 1000,
  action: 'alert'
});
"
```

## Fleet Management

```bash
// turbo
# OTA updates
curl -X POST http://localhost:8088/api/iot/firmware/deploy \
  -d '{
    "version": "v1.3.0",
    "targetDevices": ["sensor-001", "sensor-002"],
    "rolloutStrategy": "gradual",
    "batchSize": 10
  }'

# Monitor rollout
curl http://localhost:8088/api/iot/firmware/v1.3.0/status | jq '.{
  total: .deviceCount,
  updated: .updatedCount,
  failed: .failedCount,
  progress: .percentage
}'
```

## Edge IoT Gateway

```bash
// turbo
# Deploy gateway at edge locations
cat > iot-gateway.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vera-iot-gateway
spec:
  replicas: 1
  selector:
    matchLabels:
      app: iot-gateway
  template:
    spec:
      containers:
        - name: gateway
          image: vera/iot-gateway:latest
          ports:
            - containerPort: 1883  # MQTT
            - containerPort: 5683  # CoAP
          env:
            - name: MQTT_BROKER
              value: "localhost:1883"
            - name: LATTICE_COORDINATOR
              value: "https://api.vera.network"
          resources:
            limits:
              cpu: "500m"
              memory: "512Mi"
EOF

kubectl apply -f iot-gateway.yaml
```

## IoT Security

```bash
// turbo
# Device authentication
node -e "
import { deviceAuth } from './src/iot/deviceAuth.js';

// Verify device certificate
const valid = await deviceAuth.verifyCertificate(deviceCert);

// Rotate device keys
await deviceAuth.rotateKeys('sensor-001');
"

# Enable mutual TLS
export IOT_MTLS_ENABLED=true
export IOT_CA_CERT=/etc/vera/iot-ca.crt
```

## IoT Analytics

```bash
// turbo
# Time-series database for IoT data
curl -X POST http://localhost:8086/api/v2/write?bucket=iot \
  -H "Authorization: Token $INFLUX_TOKEN" \
  --data-binary 'temperature,device=sensor-001 value=22.5'

# Query sensor data
curl http://localhost:8088/api/iot/analytics/query \
  -d '{
    "deviceId": "sensor-001",
    "metric": "temperature",
    "from": "24h",
    "aggregation": "1h"
  }'
```
