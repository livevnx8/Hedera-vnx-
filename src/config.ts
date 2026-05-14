import dotenv from 'dotenv';
import { z } from 'zod';
import { secureConfig } from './config/secureConfig.js';

dotenv.config();

// Legacy config for backward compatibility
// New code should use secureConfig instead
const env = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v])
);

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_PATH: z.string().default('./data.sqlite'),
  AI_NAME: z.string().default('VNX'),

  CREDIT_USD_PER_HBAR: z.coerce.number().positive().default(0.05),
  PRICE_SOURCE: z.enum(['static', 'coingecko']).default('static'),
  SAUCERSWAP_API_KEY: z.string().optional(),

  MIRROR_NODE_BASE_URL: z.string().url().default('https://mainnet-public.mirrornode.hedera.com'),
  TREASURY_ACCOUNT_ID: z.string().optional(),

  HEDERA_NETWORK: z.enum(['mainnet', 'testnet']).default('mainnet'),
  HEDERA_OPERATOR_ACCOUNT_ID: z.string().optional(),
  HEDERA_OPERATOR_PRIVATE_KEY: z.string().optional(),
  HCS_TOPIC_ID: z.string().optional(),
  VERA_WALLET_ACCOUNT_ID: z.string().optional(),
  VERA_WALLET_PRIVATE_KEY: z.string().optional(),

  // Vera payment orchestration topics
  VERA_REGISTRY_TOPIC_ID: z.string().optional(),
  VERA_TASK_TOPIC_ID: z.string().optional(),
  VERA_RESULT_TOPIC_ID: z.string().optional(),
  VERA_AUDIT_TOPIC_ID: z.string().optional(),
  VERA_BEACON_TOPIC_ID: z.string().optional(),
  VERA_HOT_TOPICS_TOPIC_ID: z.string().optional(),

  // VNX BitLattice proof topic (falls back to VERA_PROOF_TOPIC_ID)
  VNX_PROOF_TOPIC_ID: z.string().optional(),
  VERA_PROOF_TOPIC_ID: z.string().optional(),

  // Swarm Coordination topics (NEW)
  VERA_SWARM_STATE_TOPIC_ID: z.string().optional(),
  VERA_SWARM_CONSENSUS_TOPIC_ID: z.string().optional(),
  VERA_SWARM_MEET_TOPIC_ID: z.string().optional(),
  VERA_SWARM_JOIN_TOPIC_ID: z.string().optional(),
  VERA_SWARM_ROUTING_TOPIC_ID: z.string().optional(),
  
  // vLLM Configuration (NEW)
  USE_VLLM: z.enum(['true', 'false']).default('false'),
  VLLM_URL: z.string().default('http://localhost:8000'),
  VLLM_MODEL: z.string().default('llama3.1:8b'),

  // NVIDIA local inference acceleration
  USE_NIM: z.enum(['true', 'false']).default('false'),
  NIM_URL: z.string().default('http://localhost:8000'),
  NIM_MODEL: z.string().default('meta/llama3-8b-instruct'),
  NIM_API_KEY: z.string().optional(),
  NIM_MAX_TOKENS: z.coerce.number().int().positive().default(2048),
  NIM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  NEMOTRON_URL: z.string().default('http://localhost:8000'),
  NEMOTRON_MODEL: z.string().default('nemotron-nano'),
  NEMOTRON_PROVIDER: z.enum(['nim', 'ollama', 'triton']).default('nim'),
  NEMOTRON_API_KEY: z.string().optional(),
  
  // Cross-Swarm Federation topics (NEW)
  VERA_FEDERATION_HANDSHAKE_TOPIC_ID: z.string().optional(),
  VERA_FEDERATION_CONSENSUS_TOPIC_ID: z.string().optional(),
  VERA_FEDERATION_TASK_TOPIC_ID: z.string().optional(),
  VERA_FEDERATION_HEARTBEAT_TOPIC_ID: z.string().optional(),
  
  // Domain-Specific topics (NEW)
  VERA_DEFI_INTELLIGENCE_TOPIC_ID: z.string().optional(),
  VERA_CARBON_VERIFICATION_TOPIC_ID: z.string().optional(),
  VERA_COMPLIANCE_AUDIT_TOPIC_ID: z.string().optional(),
  VERA_AGENT_LEARNING_TOPIC_ID: z.string().optional(),
  VERA_PAYMENT_STREAM_TOPIC_ID: z.string().optional(),

  RECEIPT_SIGNING_SECRET_KEY_BASE64: z.string().optional(),

  // x402 micropayment integration
  X402_BASE_URL: z.string().optional(),
  X402_API_KEY: z.string().optional(),
  X402_FACILITATOR_ACCOUNT: z.string().optional(),

  MODEL_PROVIDER: z.enum(['ollama', 'openai', 'custom', 'native', 'qvx-direct', 'google']).default('ollama'),
  QVX_INFER_URL: z.string().default('http://localhost:5100'),
  QVX_INFER_API_KEY: z.string().optional(),
  QVX_INFER_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  MODEL_PATH: z.string().optional(),
  NATIVE_CONTEXT_SIZE: z.coerce.number().int().positive().default(4096),
  NATIVE_GPU_LAYERS: z.coerce.number().int().default(35),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  GOOGLE_AI_STUDIO_API_KEY: z.string().optional(),
  DEFAULT_CHAT_MODEL: z.string().default('llama3.1:8b'),
  DEFAULT_CODE_MODEL: z.string().default('qwen2.5-coder:7b'),

  // Sovereign Enhancement Models
  CONVERSATION_MODEL: z.string().optional(),
  HEDERA_MODEL: z.string().optional(),
  ENHANCED_MODEL_ROUTING: z.enum(['disabled', 'intelligent', 'category-based']).default('disabled'),

  IMAGE_PROVIDER: z.enum(['disabled', 'automatic1111', 'replicate', 'stability', 'local']).default('disabled'),
  IMAGE_PROVIDER_URL: z.string().default('http://localhost:7860'),
  REPLICATE_API_KEY: z.string().optional(),
  STABILITY_API_KEY: z.string().optional(),

  VIDEO_PROVIDER: z.enum(['disabled', 'replicate']).default('disabled'),
  REPLICATE_VIDEO_MODEL: z.string().default('minimax/video-01'),

  QVX_NODE_URL: z.string().optional(),
  QVX_NODE_API_KEY: z.string().optional(),
  
  // Regional HCS Topics for Multi-Region Deployment (Phase 2)
  VERA_REGION: z.string().default('us-east'),
  VERA_US_EAST_TOPIC_ID: z.string().optional(),
  VERA_EU_WEST_TOPIC_ID: z.string().optional(),
  VERA_APAC_TOPIC_ID: z.string().optional(),
  
  // New Agent Topics (Phase 3)
  VERA_ORACLE_TOPIC_ID: z.string().optional(),
  VERA_BRIDGE_TOPIC_ID: z.string().optional(),
  
  VERA_GEO_ROUTING_ENABLED: z.enum(['true', 'false']).default('false'),
  VERA_SKIP_ORCHESTRATOR_START: z.enum(['true', 'false']).default('false'),
  // Sovereign LLM endpoints
  LOCAL_LLM_ENDPOINT: z.string().default('http://localhost:8081/v1'),
  AKASH_LLM_ENDPOINT: z.string().optional(),

  // Sovereign compute (Akash)
  AKASH_CERTIFICATE_PATH: z.string().optional(),
  AKASH_KEYRING_PATH: z.string().optional(),
  AKASH_PROVIDER_ENDPOINT: z.string().optional(),

  // Sovereign LLM Routing (Hybrid Local + API Fallback)
  SOVEREIGN_LOCAL_MODEL: z.string().optional(),
  SOVEREIGN_FALLBACK_PROVIDER: z.enum(['google', 'openai', 'none']).default('none'),
  SOVEREIGN_FALLBACK_MODEL: z.string().default('gemini-1.5-flash-8b'),
  SOVEREIGN_COMPLEXITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  SOVEREIGN_FALLBACK_FOR_AGENT_TOOLS: z.enum(['true', 'false']).default('false'),

  // Vera learning lane for agent upgrades and ecosystem development.
  // Keep this separate from normal chat so experimental/pro reasoning models
  // can distill lessons without changing production request handling.
  VERA_LEARNING_ENABLED: z.enum(['true', 'false']).default('false'),
  VERA_LEARNING_PROVIDER: z.enum([
    'openai-compatible',
    'deepseek',
    'local',
    'qvx',
    'nvidia-nemotron',
    'nvidia-nim',
    'vllm',
    'none',
  ]).default('none'),
  VERA_LEARNING_BASE_URL: z.string().url().optional(),
  VERA_LEARNING_API_KEY: z.string().optional(),
  VERA_LEARNING_MODEL: z.string().optional(),
  VERA_LEARNING_MIN_QUALITY_SCORE: z.coerce.number().min(0).max(1).default(0.82),
  VERA_LEARNING_RECEIPTS_REQUIRED: z.enum(['true', 'false']).default('true'),
  VERA_LEARNING_ALLOW_BLOCK_STREAM: z.enum(['true', 'false']).default('true'),
  VERA_GIT_LATTICE_ENABLED: z.enum(['true', 'false']).default('false'),
  VERA_GIT_LATTICE_MODE: z.enum(['private', 'public']).default('private'),
  VERA_GIT_LATTICE_ROOT: z.string().default('./'),
  VERA_GIT_LATTICE_INCLUDE_PRIVATE: z.enum(['true', 'false']).default('false'),
  VERA_GIT_LATTICE_MAX_FILE_KB: z.coerce.number().int().positive().default(256),
  VERA_GIT_LATTICE_SECRET_SCAN_REQUIRED: z.enum(['true', 'false']).default('true'),

  // VERA Token (HTS)
  VERA_TOKEN_ID: z.string().optional(),
  VERA_TOKEN_TREASURY_ACCOUNT: z.string().optional(),
  VERA_TOKEN_TREASURY_KEY: z.string().optional(),

  // Vera marketplace agent creation fee
  VERA_AGENT_CREATION_FEE_TARGET_USD: z.coerce.number().positive().default(7.5),
  VERA_AGENT_CREATION_FEE_HBAR: z.coerce.number().positive().default(10),
  VERA_AGENT_CREATION_FEE_TOKEN_AMOUNT: z.coerce.number().positive().default(100),
  VERA_AGENT_CREATION_FEE_TOKEN_ID: z.string().default('0.0.9356476'),
  VERA_AGENT_CREATION_FEE_TOKEN_SYMBOL: z.string().default('hbar.h'),
  VERA_AGENT_CREATION_FEE_TOKEN_USD_FALLBACK: z.coerce.number().positive().default(0.0005),
  VERA_AGENT_CREATION_FEE_PRICE_TOLERANCE: z.coerce.number().min(0).max(0.25).default(0.03),
  VERA_AGENT_CREATION_FEE_TREASURY_ACCOUNT: z.string().default('0.0.10294360'),

  // Agent Factory
  AGENT_FACTORY_CONTRACT_ID: z.string().optional(),
  
  // IPFS
  IPFS_API_URL: z.string().default('http://localhost:5001'),
  IPFS_PINNING_SERVICE: z.string().optional(),
  
  VERA_AUTO_FAILOVER: z.enum(['true', 'false']).default('true'),
  VERA_REQUIRE_AGENT_SIGNATURE: z.enum(['true', 'false']).default('true'),

  // Qdrant Vector Store (Pinecone alternative)
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default('vera-lattice'),
  QDRANT_VECTOR_SIZE: z.coerce.number().int().positive().default(384),
  QDRANT_DISTANCE: z.enum(['Cosine', 'Euclid', 'Dot']).default('Cosine'),

  // ClickHouse Metrics
  CLICKHOUSE_URL: z.string().default('http://localhost:8123'),
  CLICKHOUSE_DATABASE: z.string().default('vera_metrics'),
  CLICKHOUSE_USER: z.string().default('default'),
  CLICKHOUSE_PASSWORD: z.string().optional(),

  // Oracle / Price Feeds
  CHAINLINK_HBAR_USD_FEED: z.string().optional(),
  PYTH_HBAR_PRICE_ID: z.string().optional(),
  HEDERA_EVM_RPC: z.string().default('https://mainnet.hashio.io/api'),

  // Confidential Compute
  VERA_ALLOWED_MRTDS: z.string().optional(),
  VERA_MIN_TCB_VERSION: z.string().optional(),
  VERA_ATTESTATION_TOPIC_ID: z.string().optional(),

  // Rig Topology (GPU-aware scheduling)
  RIG_GPU_COUNT: z.coerce.number().int().min(0).default(1),
  RIG_TOPOLOGY: z.string().optional(), // JSON: [{"id":0,"model":"llama3.1:8b","url":"http://localhost:11434","maxLayers":35,"tier":"fast"}]
  RIG_DEFAULT_TIER: z.enum(['instant', 'fast', 'standard', 'deep']).default('standard'),

  // HIP-1056 Block Stream (Sovereign ingestion)
  USE_BLOCK_STREAM: z.enum(['true', 'false']).default('false'),
  BLOCK_STREAM_ENDPOINT: z.string().default('localhost:8085'),

  // Meridian — BitNet ternary research model (CPU-optimized local inference)
  ENABLE_MERIDIAN_BITNET: z.enum(['true', 'false']).default('false'),
  MERIDIAN_URL: z.string().default('http://localhost:8123'),
  MERIDIAN_BACKEND: z.enum(['pytorch', 'bitnetcpp']).default('pytorch'),
  MERIDIAN_BITNETCPP_MODEL: z.string().default('models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf'),
  MERIDIAN_BITNETCPP_DIR: z.string().default('vendor/BitNet'),
  MERIDIAN_BITNETCPP_THREADS: z.coerce.number().int().positive().default(4),
  MERIDIAN_BITNETCPP_CTX_SIZE: z.coerce.number().int().positive().default(2048),
  MERIDIAN_BITNETCPP_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

  // Notifications — Slack webhook for alerts
  SLACK_WEBHOOK_URL: z.string().optional(),

  // Multi-Meridian Shadow Council Configuration
  MERIDIAN_URLS: z.string().default(''), // Comma-separated list of Meridian endpoints
  MERIDIAN_ENSEMBLE_SIZE: z.coerce.number().int().min(1).max(5).default(3),
  MERIDIAN_TIER_TINY_URL: z.string().optional(),
  MERIDIAN_TIER_MEDIUM_URL: z.string().optional(),
  MERIDIAN_TIER_COMPACT_URL: z.string().default('http://localhost:8123'),
  MERIDIAN_TIER_PLUS_URL: z.string().optional(),
  MERIDIAN_TIER_EXTERNAL_API_KEY: z.string().optional(),

  // Multi-Region Meridian Mesh (Phase 1: Foundation)
  MERIDIAN_URLS_US_EAST: z.string().optional(),
  MERIDIAN_URLS_US_WEST: z.string().optional(),
  MERIDIAN_URLS_EU_WEST: z.string().optional(),
  MERIDIAN_URLS_APAC: z.string().optional(),
  MERIDIAN_URLS_LATAC: z.string().optional(),
  MERIDIAN_MESH_LOCAL_REGION: z.enum(['us-east', 'us-west', 'eu-west', 'apac-singapore', 'latac-brazil']).default('us-east'),
  MERIDIAN_MESH_SYNC_TOPIC_ID: z.string().optional(), // HCS topic for cross-region reputation sync
  MERIDIAN_MESH_HEALTH_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  MERIDIAN_MESH_REPUTATION_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60000),

  // Checkpoint monitoring
  MERIDIAN_AUTO_MONITOR: z.enum(['true', 'false']).default('true'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const config: AppConfig = ConfigSchema.parse(env);
