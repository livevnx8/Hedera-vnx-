---
description: Setup data pipeline for ETL and stream processing
---

# Setup Data Pipeline

ETL and stream processing for Vera lattice data.

## Quick Setup

```bash
// turbo
# Start Apache Kafka
docker-compose -f kafka-docker-compose.yml up -d

# Or use managed service
aws kafka create-cluster --cluster-name vera-kafka ...
```

## Batch Processing

### 1. Apache Airflow

```bash
// turbo
# Install Airflow
pip install apache-airflow
airflow db init
airflow webserver -p 8080

# Create DAG
cat > dags/vera_etl.py << 'EOF'
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

def extract_hcs_data():
    # Extract from HCS topics
    pass

def transform_data():
    # Transform to analytics format
    pass

def load_to_warehouse():
    # Load to data warehouse
    pass

with DAG(
    'vera_etl',
    start_date=datetime(2024, 1, 1),
    schedule_interval='@hourly',
    catchup=False
) as dag:
    extract = PythonOperator(task_id='extract', python_callable=extract_hcs_data)
    transform = PythonOperator(task_id='transform', python_callable=transform_data)
    load = PythonOperator(task_id='load', python_callable=load_to_warehouse)
    
    extract >> transform >> load
EOF
```

### 2. dbt for Transformations

```bash
// turbo
# Setup dbt
dbt init vera_analytics

# Create models
cat > models/stg_hcs_messages.sql << 'EOF'
WITH source AS (
  SELECT * FROM {{ source('raw', 'hcs_messages') }}
)
SELECT
  message_id,
  topic_id,
  parsed_message->>'type' as message_type,
  parsed_message->>'agentId' as agent_id,
  timestamp
FROM source
EOF

dbt run
dbt test
```

## Stream Processing

### 1. Kafka Streams

```bash
// turbo
cat > vera-stream-processor.js << 'EOF'
const { KafkaStreams } = require('kafka-streams');

const config = {
  kafkaHost: 'localhost:9092',
  groupId: 'vera-processor',
  clientName: 'vera-streams'
};

const streams = new KafkaStreams(config);

const stream = streams.createKStream();

stream
  .from('vera-hcs-messages')
  .mapJSONConvenience()
  .filter(message => message.value.type === 'agent_beacon')
  .tap(message => console.log('Agent beacon:', message))
  .to('vera-processed-beacons');

streams.start();
EOF
```

### 2. Apache Flink

```bash
// turbo
cat > VeraHCSJob.java << 'EOF'
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

public class VeraHCSJob {
    public static void main(String[] args) {
        StreamExecutionEnvironment env = 
            StreamExecutionEnvironment.getExecutionEnvironment();
        
        env.addSource(new HCSKafkaSource("vera-hcs-messages"))
           .map(new ParseJSON())
           .keyBy(message -> message.agentId)
           .window(TumblingProcessingTimeWindows.of(Time.minutes(5)))
           .aggregate(new BeaconAggregator())
           .addSink(new AnalyticsSink());
        
        env.execute("Vera HCS Analytics");
    }
}
EOF
```

## Data Warehouse

```bash
// turbo
# Setup BigQuery (or Snowflake/Redshift)
bq mk vera_analytics
bq mk --table vera_analytics.agent_metrics \
  schema/agent_metrics.json

# Load data
bq load --source_format=NEWLINE_DELIMITED_JSON \
  vera_analytics.agent_metrics \
  gs://vera-data/agent-metrics-*.jsonl
```

## Real-time Analytics

```bash
// turbo
# Materialize for real-time SQL
materialized --workers 4 --processes 4

# Create materialized view
cat > views/agent_health.sql << 'EOF'
CREATE MATERIALIZED VIEW agent_health AS
SELECT
  agent_id,
  COUNT(*) as message_count,
  MAX(timestamp) as last_seen
FROM vera_hcs_messages
GROUP BY agent_id;
EOF
```

## Data Quality

```bash
// turbo
# Great Expectations
pip install great-expectations
great_expectations init

cat > expectations/vera_expectations.json << 'EOF'
{
  "expectation_suite_name": "vera_hcs_suite",
  "expectations": [
    {
      "expectation_type": "expect_column_values_to_not_be_null",
      "kwargs": {"column": "message_id"}
    },
    {
      "expectation_type": "expect_column_values_to_be_between",
      "kwargs": {
        "column": "timestamp",
        "min_value": "2024-01-01",
        "max_value": "2025-12-31"
      }
    }
  ]
}
EOF

great_expectations checkpoint run vera_checkpoint
```
