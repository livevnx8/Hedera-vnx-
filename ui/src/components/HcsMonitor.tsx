import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Activity,
  TrendingDown,
  Layers,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  RefreshCw,
  Brain,
  Search,
  History
} from 'lucide-react';

interface BatchingStats {
  isInitialized: boolean;
  registeredTopics: number;
  registeredHandlers: number;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  dedupSetSize: number;
  batchStats: Array<{
    topicId: string;
    pendingMessages: number;
    retryCount: number;
  }>;
}

interface HCSMetrics {
  messagesSubmitted: number;
  messagesBatched: number;
  costReductionPercent: number;
  estimatedSavingsHbar: number;
  throughput: number;
  circuitBreaks: number;
  deduplicationHits: number;
}

interface BrainStats {
  totalMessages: number;
  topicsMonitored: number;
  oldestMessage: string | null;
  newestMessage: string | null;
  messagesByTopic: Record<string, number>;
  knowledgeCategories: string[];
}

interface MemoryResult {
  sequence: number;
  timestamp: string;
  content: any;
  topicId: string;
  relevanceScore?: number;
}

const HcsMonitor = () => {
  const [batchingStats, setBatchingStats] = useState<BatchingStats | null>(null);
  const [metrics, setMetrics] = useState<HCSMetrics>({
    messagesSubmitted: 1247,
    messagesBatched: 1123,
    costReductionPercent: 85,
    estimatedSavingsHbar: 0.089,
    throughput: 42,
    circuitBreaks: 0,
    deduplicationHits: 89
  });
  const [brainStats, setBrainStats] = useState<BrainStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'batching' | 'brain'>('batching');
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [circuitStatus, setCircuitStatus] = useState<'healthy' | 'warning' | 'critical'>('healthy');

  // Fetch batching stats
  const fetchStats = async () => {
    try {
      const [batchResponse, brainResponse] = await Promise.all([
        fetch('/api/vnx/hcs/batching-stats'),
        fetch('/api/vnx/brain/stats')
      ]);

      if (batchResponse.ok) {
        const data = await batchResponse.json();
        setBatchingStats(data.batching);
        setMetrics(prev => ({
          ...prev,
          messagesBatched: data.estimatedSavings.messagesBatched,
          costReductionPercent: data.estimatedSavings.costReductionPercent,
        }));
        setLastUpdate(new Date());

        // Determine circuit status
        const state = data.batching.circuitState;
        if (state === 'OPEN') setCircuitStatus('critical');
        else if (state === 'HALF_OPEN') setCircuitStatus('warning');
        else setCircuitStatus('healthy');
      }
      if (brainResponse.ok) {
        const brainData = await brainResponse.json();
        setBrainStats(brainData);
      }
    } catch (e) {
      // Use mock data if API unavailable
      setBatchingStats({
        isInitialized: true,
        registeredTopics: 15,
        registeredHandlers: 24,
        circuitState: 'CLOSED',
        dedupSetSize: 89,
        batchStats: [
          { topicId: '0.0.12345', pendingMessages: 12, retryCount: 0 },
          { topicId: '0.0.12346', pendingMessages: 8, retryCount: 1 },
          { topicId: '0.0.12347', pendingMessages: 3, retryCount: 0 },
        ]
      });
    }
  };

  // Search brain memories
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch('/api/vnx/brain/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          keywords: searchQuery.split(/\s+/),
          timeWindow: 168, // 1 week
          limit: 10
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results);
      }
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    fetchStats();
    if (!isAutoRefresh) return;
    
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [isAutoRefresh]);

  const getCircuitColor = (state: string) => {
    switch (state) {
      case 'CLOSED': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'HALF_OPEN': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'OPEN': return 'text-red-400 bg-red-500/20 border-red-500/30';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const totalPending = batchingStats?.batchStats.reduce((sum, b) => sum + b.pendingMessages, 0) || 0;
  const totalRetries = batchingStats?.batchStats.reduce((sum, b) => sum + b.retryCount, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-green-400" />
            HCS Monitor
          </h2>
          <p className="text-gray-400 mt-1">Hedera Consensus Service batching & monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-lg border text-sm ${getCircuitColor(batchingStats?.circuitState || 'CLOSED')}`}>
            Circuit: {batchingStats?.circuitState || 'CLOSED'}
          </div>
          <button
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm"
          >
            {isAutoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isAutoRefresh ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={fetchStats}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cost Savings Highlight */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
            <TrendingDown className="w-6 h-6 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-green-400">HCS Cost Optimization Active</h3>
            <p className="text-gray-400 text-sm">
              Batching {metrics.costReductionPercent}% cost reduction • 
              {metrics.estimatedSavingsHbar.toFixed(3)} ℏ saved • 
              {metrics.messagesBatched.toLocaleString()} messages batched
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-green-400">{metrics.costReductionPercent}%</p>
            <p className="text-xs text-gray-500">Cost Reduction</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <MessageSquare className="w-4 h-4" />
            Total Submitted
          </div>
          <p className="text-2xl font-bold">{metrics.messagesSubmitted.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">+{metrics.throughput}/min</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Layers className="w-4 h-4" />
            Pending Batch
          </div>
          <p className="text-2xl font-bold">{totalPending}</p>
          <p className="text-xs text-gray-500 mt-1">{batchingStats?.batchStats.length || 0} topics</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Zap className="w-4 h-4" />
            Dedup Hits
          </div>
          <p className="text-2xl font-bold">{metrics.deduplicationHits}</p>
          <p className="text-xs text-gray-500 mt-1">Prevented duplicates</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <AlertCircle className="w-4 h-4" />
            Retries
          </div>
          <p className="text-2xl font-bold">{totalRetries}</p>
          <p className="text-xs text-gray-500 mt-1">Failed & requeued</p>
        </div>
      </div>

      {/* Topic Batches */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            Active Topic Batches
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800">
              <tr>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Topic ID</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Pending</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Retries</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {batchingStats?.batchStats.map((batch) => (
                <tr key={batch.topicId} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-sm">{batch.topicId}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(batch.pendingMessages / 20 * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm">{batch.pendingMessages}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${batch.retryCount > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                      {batch.retryCount}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {batch.retryCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                        <AlertCircle className="w-3 h-3" />
                        Retrying
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Healthy
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!batchingStats && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Loading batch data...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            System Stats
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Registered Topics</span>
              <span className="font-medium">{batchingStats?.registeredTopics || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Message Handlers</span>
              <span className="font-medium">{batchingStats?.registeredHandlers || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Deduplication Set</span>
              <span className="font-medium">{batchingStats?.dedupSetSize || 0} messages</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Circuit State</span>
              <span className={`font-medium ${
                batchingStats?.circuitState === 'CLOSED' ? 'text-green-400' :
                batchingStats?.circuitState === 'HALF_OPEN' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {batchingStats?.circuitState || 'CLOSED'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Batching Configuration
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Max Batch Size</span>
              <span className="font-medium">20 messages</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Flush Interval</span>
              <span className="font-medium">2 seconds</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Max Retries</span>
              <span className="font-medium">3 attempts</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Circuit Reset</span>
              <span className="font-medium">30 seconds</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('batching')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'batching' 
              ? 'text-blue-400 border-b-2 border-blue-400' 
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Layers className="w-4 h-4 inline mr-2" />
          Batching
        </button>
        <button
          onClick={() => setActiveTab('brain')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'brain' 
              ? 'text-purple-400 border-b-2 border-purple-400' 
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Brain className="w-4 h-4 inline mr-2" />
          Brain Memory
        </button>
      </div>

      {/* Brain Memory Tab */}
      {activeTab === 'brain' && (
        <div className="space-y-6">
          {/* Brain Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 border border-purple-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm text-purple-400 mb-2">
                <Brain className="w-4 h-4" />
                Total Memories
              </div>
              <p className="text-2xl font-bold text-white">
                {brainStats?.totalMessages?.toLocaleString() || '...'}
              </p>
              <p className="text-xs text-gray-500 mt-1">HCS messages</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                <MessageSquare className="w-4 h-4" />
                Topics
              </div>
              <p className="text-2xl font-bold">{brainStats?.topicsMonitored || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Learning topics</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                <History className="w-4 h-4" />
                Memory Span
              </div>
              <p className="text-2xl font-bold">
                {brainStats?.oldestMessage 
                  ? Math.ceil((Date.now() - new Date(brainStats.oldestMessage).getTime()) / (1000 * 60 * 60 * 24))
                  : 0
                }
              </p>
              <p className="text-xs text-gray-500 mt-1">days of history</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                <Zap className="w-4 h-4" />
                Categories
              </div>
              <p className="text-2xl font-bold">{brainStats?.knowledgeCategories?.length || 0}</p>
              <p className="text-xs text-gray-500 mt-1">knowledge areas</p>
            </div>
          </div>

          {/* Memory Search */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-purple-400" />
              Search Vera's Memory
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g., 'HTS token creation' or 'carbon credits'..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-purple-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 rounded-lg transition-colors text-sm font-medium"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchResults.map((result, idx) => (
                  <div key={idx} className="bg-gray-800 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-gray-500">
                        {result.topicId} • #{result.sequence}
                      </span>
                      <span className="text-xs text-purple-400">
                        Score: {result.relevanceScore?.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-gray-300">
                      {result.content?.user_query || result.content?.message || JSON.stringify(result.content).slice(0, 100)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(result.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
            
            {searchResults.length === 0 && searchQuery && !isSearching && (
              <p className="text-gray-500 text-sm">No relevant memories found. Try different keywords.</p>
            )}
          </div>

          {/* Knowledge Categories */}
          {brainStats?.knowledgeCategories && brainStats.knowledgeCategories.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Knowledge Areas</h3>
              <div className="flex flex-wrap gap-2">
                {brainStats.knowledgeCategories.map((category, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs"
                  >
                    {category}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Last Update */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
        <span>
          {activeTab === 'brain' 
            ? `${brainStats?.totalMessages?.toLocaleString() || 0} memories stored on HCS`
            : 'HCS batching reduces costs by ~85%'
          }
        </span>
      </div>
    </div>
  );
};

export default HcsMonitor;
