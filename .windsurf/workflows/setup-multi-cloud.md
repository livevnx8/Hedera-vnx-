---
description: Deploy Vera lattice across multiple cloud providers
---

# Setup Multi-Cloud

Deploy Vera across AWS, GCP, and Azure for maximum resilience.

## Quick Start

```bash
// turbo
# Initialize Terraform
terraform init

# Deploy to all clouds
terraform apply -var="environments={aws=true,gcp=true,azure=true}"
```

## AWS Deployment

```bash
// turbo
# EKS cluster
cat > aws-eks.tf << 'EOF'
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "vera-lattice-aws"
  cluster_version = "1.28"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    vera = {
      min_size     = 3
      max_size     = 20
      desired_size = 5

      instance_types = ["m6i.2xlarge"]
      capacity_type  = "ON_DEMAND"
    }
    
    vera-gpu = {
      min_size     = 1
      max_size     = 4
      desired_size = 2

      instance_types = ["p4d.24xlarge"]
      capacity_type  = "ON_DEMAND"
      
      labels = {
        workload = "ai-gpu"
      }
      
      taints = [{
        key    = "nvidia.com/gpu"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
    }
  }
}
EOF

terraform apply -target=module.eks
```

## GCP Deployment

```bash
// turbo
# GKE cluster
cat > gcp-gke.tf << 'EOF'
resource "google_container_cluster" "vera_gcp" {
  name     = "vera-lattice-gcp"
  location = "us-central1"

  initial_node_count = 3

  node_config {
    machine_type = "n2-standard-8"
    
    oauth_scopes = [
      "https://www.googleapis.com/auth/compute",
      "https://www.googleapis.com/auth/devstorage.read_only",
    ]
  }
}

# GPU node pool
resource "google_container_node_pool" "vera_gpu" {
  name       = "vera-gpu-pool"
  location   = "us-central1"
  cluster    = google_container_cluster.vera_gcp.name
  node_count = 2

  node_config {
    machine_type = "a2-highgpu-1g"
    guest_accelerator {
      type  = "nvidia-tesla-a100"
      count = 1
    }
  }
}
EOF
```

## Azure Deployment

```bash
// turbo
# AKS cluster
cat > azure-aks.tf << 'EOF'
resource "azurerm_kubernetes_cluster" "vera_azure" {
  name                = "vera-lattice-azure"
  location            = "East US"
  resource_group_name = azurerm_resource_group.vera.name
  dns_prefix          = "vera-lattice"

  default_node_pool {
    name       = "default"
    node_count = 3
    vm_size    = "Standard_D8s_v3"
  }

  identity {
    type = "SystemAssigned"
  }
}

# GPU node pool
resource "azurerm_kubernetes_cluster_node_pool" "vera_gpu" {
  name                  = "gpu"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.vera_azure.id
  vm_size               = "Standard_NC24s_v3"
  node_count            = 2
}
EOF
```

## Multi-Cloud Mesh

```bash
// turbo
# Link clusters with Istio
cat > multicluster-mesh.yaml << 'EOF'
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: east-west
spec:
  profile: minimal
  meshConfig:
    defaultConfig:
      proxyMetadata:
        ISTIO_META_DNS_CAPTURE: "true"
  values:
    global:
      multiCluster:
        clusterName: vera-aws
        network: network1
      meshID: mesh1
EOF

# Install on each cluster
istioctl install -f multicluster-mesh.yaml

# Expose services across clusters
kubectl apply -f - << 'EOF'
apiVersion: networking.istio.io/v1beta1
kind: ServiceEntry
metadata:
  name: vera-gcp
spec:
  hosts:
    - vera-gcp.vera.svc.cluster.local
  location: MESH_INTERNAL
  ports:
    - number: 8088
      name: http
      protocol: HTTP
  resolution: DNS
  endpoints:
    - address: 10.1.0.10
      network: network2
EOF
```

## Global Load Balancer

```bash
// turbo
# Cloudflare or AWS Global Accelerator
# Route users to nearest cluster

cat > dns-failover.tf << 'EOF'
resource "cloudflare_load_balancer" "vera_global" {
  zone_id          = var.cloudflare_zone_id
  name             = "api.vera.network"
  fallback_pool_id = cloudflare_load_balancer_pool.aws.id
  default_pool_ids = [
    cloudflare_load_balancer_pool.aws.id,
    cloudflare_load_balancer_pool.gcp.id,
    cloudflare_load_balancer_pool.azure.id
  ]
  
  steering_policy = "geo"
}
EOF
```

## Cost Optimization

```bash
// turbo
# Use spot/preemptible instances
export AWS_SPOT_ENABLED=true
export GCP_PREEMPTIBLE=true
export AZURE_SPOT=true

# Spot node pools for non-critical workloads
kubectl create -f - << 'EOF'
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: spot-workloads
spec:
  requirements:
    - key: karpenter.sh/capacity-type
      operator: In
      values: ["spot"]
  limits:
    resources:
      cpu: 1000
  ttlSecondsAfterEmpty: 30
EOF
```

## Disaster Recovery

```bash
// turbo
# Cross-region backup
aws s3 sync s3://vera-data-us-east s3://vera-data-us-west

# Automatic failover
curl -X POST http://localhost:8088/api/multi-cloud/failover \
  -d '{
    "primary": "aws-us-east",
    "standby": "gcp-us-central",
    "trigger": "automatic"
  }'

# Verify DR readiness
curl http://localhost:8088/api/disaster-recovery/status | jq '.{
  rto: .recoveryTimeObjective,
  rpo: .recoveryPointObjective,
  lastBackup: .lastSuccessfulBackup
}'
```
