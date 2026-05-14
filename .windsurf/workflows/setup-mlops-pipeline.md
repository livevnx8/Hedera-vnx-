---
description: Setup MLOps pipeline for automated model training and deployment
---

# Setup MLOps Pipeline

Automated ML pipeline for Vera AI models.

## Quick Setup

```bash
// turbo
# Install Kubeflow
export PIPELINE_VERSION=2.0.0
kubectl apply -k "github.com/kubeflow/pipelines/manifests/kustomize/cluster-scoped-resources?ref=$PIPELINE_VERSION"
kubectl apply -k "github.com/kubeflow/pipelines/manifests/kustomize/env/dev?ref=$PIPELINE_VERSION"

# Port forward
kubectl port-forward -n kubeflow svc/ml-pipeline-ui 8080:80
```

## Pipeline Definition

```bash
// turbo
cat > vera-ml-pipeline.py << 'EOF'
import kfp
from kfp import dsl

@dsl.component
    base_image='python:3.9'
)
def fetch_data(
    dataset_name: str,
    output_path: dsl.Output[dsl.Dataset]
):
    import requests
    # Fetch training data
    
@dsl.component(
    base_image='pytorch/pytorch:2.0.0-cuda11.8-cudnn8-runtime'
)
def train_model(
    dataset: dsl.Input[dsl.Dataset],
    model_output: dsl.Output[dsl.Model],
    epochs: int = 3
):
    import torch
    # Training logic
    
@dsl.component
    base_image='python:3.9'
)
def evaluate_model(
    model: dsl.Input[dsl.Model],
    metrics_output: dsl.Output[dsl.Metrics]
):
    # Evaluation logic
    
@dsl.component
    base_image='python:3.9'
)
def deploy_model(
    model: dsl.Input[dsl.Model],
    version: str
):
    # Deployment logic

@dsl.pipeline(
    name='Vera Model Pipeline',
    description='End-to-end model training pipeline'
)
def vera_pipeline(
    dataset_name: str = 'vera-chat-v1',
    epochs: int = 3
):
    fetch_task = fetch_data(dataset_name=dataset_name)
    train_task = train_model(
        dataset=fetch_task.outputs['output_path'],
        epochs=epochs
    )
    eval_task = evaluate_model(model=train_task.outputs['model_output'])
    deploy_task = deploy_model(
        model=train_task.outputs['model_output'],
        version='v1.0.0'
    ).after(eval_task)

if __name__ == '__main__':
    kfp.compiler.Compiler().compile(vera_pipeline, 'vera-pipeline.yaml')
EOF

python vera-ml-pipeline.py
```

## Automated Retraining

```bash
// turbo
# Trigger on data drift
cat > retrain-trigger.yaml << 'EOF'
apiVersion: eventing.knative.dev/v1
kind: Trigger
metadata:
  name: model-retrain-trigger
spec:
  broker: default
  filter:
    attributes:
      type: drift.detected
  subscriber:
    ref:
      apiVersion: argoproj.io/v1alpha1
      kind: Workflow
      name: vera-retrain-pipeline
EOF
```

## Model Registry

```bash
// turbo
# MLflow setup
helm install mlflow stable/mlflow \
  --set backendStore.postgres.enabled=true \
  --set artifactStore.s3.enabled=true

# Register model
node -e "
import { modelRegistry } from './src/mlops/modelRegistry.js';
await modelRegistry.register({
  name: 'vera-base',
  version: 'v2.1.0',
  path: 's3://vera-models/base/v2.1.0',
  metrics: { accuracy: 0.94, latency: 120 }
});
"
```

## Feature Store

```bash
// turbo
# Feast setup
pip install feast
feast init vera-features
cd vera-features

# Define features
cat > features.py << 'EOF'
from feast import Entity, Feature, FeatureView, ValueType
from feast.types import Float32

user = Entity(name="user_id", value_type=ValueType.STRING)

user_features = FeatureView(
    name="user_features",
    entities=["user_id"],
    ttl=timedelta(hours=24),
    features=[
        Feature(name="query_count_24h", dtype=Float32),
        Feature(name="avg_response_time", dtype=Float32),
    ],
)
EOF
```

## A/B Testing

```bash
// turbo
# Configure experiment
curl -X POST http://localhost:8088/api/mlops/experiments \
  -d '{
    "name": "model-v2-test",
    "variants": [
      {"model": "vera-v1", "traffic": 80},
      {"model": "vera-v2", "traffic": 20}
    ],
    "metrics": ["accuracy", "latency", "cost"],
    "duration": "7d"
  }'

# Monitor experiment
curl http://localhost:8088/api/mlops/experiments/model-v2-test/results | jq .
```

## Model Monitoring

```bash
// turbo
# Data drift detection
node -e "
import { driftDetector } from './src/mlops/driftDetector.js';
await driftDetector.configure({
  metrics: ['prediction_distribution', 'feature_drift'],
  threshold: 0.05,
  alertChannel: 'slack'
});
"

# Performance degradation alerts
curl -X POST http://localhost:8088/api/mlops/monitoring \
  -d '{
    "model": "vera-base",
    "metrics": ["accuracy", "latency"],
    "thresholds": {"accuracy": 0.90, "latency": 200}
  }'
```
