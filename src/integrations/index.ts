/**
 * VeraLattice Integrations Index
 *
 * Central export point for all external service adapters.
 */

export {
  getLangChainTools,
  getLlamaIndexTools,
  getToolsByCategory,
  getToolsByLayer,
  findTool,
  invokeTool,
  type LangChainTool,
  type LlamaIndexTool,
} from './langchainBridge.js';

export {
  registerSubscription,
  unregisterSubscription,
  getSubscription,
  listSubscriptions,
  getWebhookStats,
  getDeliveryQueue,
  getDeadLetterQueue,
  replayDeadLetter,
  dispatchEvent,
  type WebhookSubscription,
  type WebhookDelivery,
} from './webhookEngine.js';

export {
  startLatticeEventBridge,
  startMarketplaceEventBridge,
} from './latticeEventBridge.js';

export {
  ensureCollection as ensureQdrantCollection,
  deleteCollection as deleteQdrantCollection,
  upsert as qdrantUpsert,
  search as qdrantSearch,
  deletePoints as qdrantDeletePoints,
  getPoint as qdrantGetPoint,
  scroll as qdrantScroll,
  collectionInfo as qdrantCollectionInfo,
  embedText,
  indexDocument,
  semanticSearch,
  type VectorPoint,
  type SearchResult,
} from './qdrantVectorStore.js';

export {
  ensureSchema as ensureClickHouseSchema,
  ingestAgentMetric,
  ingestLatticePulse,
  ingestPayment as ingestClickHousePayment,
  ingestCarbonEvent,
  getAgentPerformance,
  getLatticeEnergyFlow,
  getPaymentVolume,
} from './clickhouseMetrics.js';

export {
  fetchChainlinkPrice,
  fetchPythPrice,
  getConsensusPrice,
  publishAttestation,
  getOracleRoutes,
} from './oracleAdapters.js';
