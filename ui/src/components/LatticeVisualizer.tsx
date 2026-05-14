import React, { useState, useEffect } from 'react';
import { 
  Flower2, 
  Zap, 
  Activity,
  GitBranch,
  Target,
  Layers,
  Play,
  Pause,
  RefreshCw
} from 'lucide-react';

interface LatticeNode {
  id: string;
  x: number;
  y: number;
  layer: number;
  energy: number;
  role: string;
  state: 'active' | 'hibernating' | 'spawning';
  lastAccessed: number;
}

interface LatticeStats {
  totalNodes: number;
  totalEdges: number;
  totalPulses: number;
  centerEnergy: number;
  isRunning: boolean;
}

const LatticeVisualizer = () => {
  const [stats, setStats] = useState<LatticeStats>({
    totalNodes: 37,
    totalEdges: 108,
    totalPulses: 1247,
    centerEnergy: 0.95,
    isRunning: true
  });

  const [nodes, setNodes] = useState<LatticeNode[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const [isPulsing, setIsPulsing] = useState(false);

  // Fetch lattice data
  useEffect(() => {
    const fetchLatticeData = async () => {
      try {
        const [statsRes, stateRes] = await Promise.all([
        fetch('/api/vnx/lattice/stats'),
        fetch('/api/vnx/lattice/state')
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(prev => ({
            ...prev,
            totalNodes: statsData.totalNodes || 37,
            totalEdges: statsData.totalEdges || 108,
            totalPulses: statsData.totalPulses || 1247,
            centerEnergy: statsData.centerEnergy || 0.95,
            isRunning: statsData.isRunning ?? true
          }));
        }

        if (stateRes.ok) {
          const stateData = await stateRes.json();
          setNodes(stateData.nodes || []);
        }
      } catch (e) {
        // Use demo data if API unavailable
        setNodes([
          { id: 'center-0', x: 0, y: 0, layer: 0, energy: 0.95, role: 'consciousness', state: 'active', lastAccessed: Date.now() },
          { id: 'inner-1', x: 100, y: 0, layer: 1, energy: 0.87, role: 'task-management', state: 'active', lastAccessed: Date.now() },
          { id: 'inner-2', x: 50, y: 87, layer: 1, energy: 0.82, role: 'priority-routing', state: 'active', lastAccessed: Date.now() },
          { id: 'inner-3', x: -50, y: 87, layer: 1, energy: 0.78, role: 'scheduling', state: 'active', lastAccessed: Date.now() },
          { id: 'middle-1', x: 200, y: 0, layer: 2, energy: 0.65, role: 'carbon-validation', state: 'active', lastAccessed: Date.now() },
          { id: 'middle-2', x: 150, y: 87, layer: 2, energy: 0.71, role: 'defi-analysis', state: 'active', lastAccessed: Date.now() },
          { id: 'outer-1', x: 300, y: 0, layer: 3, energy: 0.45, role: 'agent-comms', state: 'hibernating', lastAccessed: Date.now() - 60000 },
        ]);
      }
    };

    fetchLatticeData();
    const interval = setInterval(fetchLatticeData, 5000);
    return () => clearInterval(interval);
  }, []);

  const triggerPulse = async () => {
    setIsPulsing(true);
    try {
      await fetch('/api/vnx/lattice/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'manual', data: { source: 'dashboard' } })
      });
      setStats(prev => ({ ...prev, totalPulses: prev.totalPulses + 1 }));
    } catch (e) {
      console.error('Failed to trigger pulse');
    }
    setTimeout(() => setIsPulsing(false), 500);
  };

  const toggleLattice = async () => {
    // API call to start/stop lattice
    setStats(prev => ({ ...prev, isRunning: !prev.isRunning }));
  };

  const getLayerColor = (layer: number) => {
    switch (layer) {
      case 0: return 'bg-purple-500';
      case 1: return 'bg-blue-500';
      case 2: return 'bg-green-500';
      case 3: return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getLayerName = (layer: number) => {
    switch (layer) {
      case 0: return 'Center (Consciousness)';
      case 1: return 'Layer 1 (Inner)';
      case 2: return 'Layer 2 (Middle)';
      case 3: return 'Layer 3 (Outer)';
      default: return `Layer ${layer}`;
    }
  };

  const layerCounts = [0, 1, 2, 3].map(layer => ({
    layer,
    count: nodes.filter(n => n.layer === layer).length,
    active: nodes.filter(n => n.layer === layer && n.state === 'active').length
  }));

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Flower2 className="w-7 h-7 text-purple-400" />
            Flower of Life Lattice
          </h2>
          <p className="text-gray-400 mt-1">Sacred geometry orchestration layer</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLattice}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              stats.isRunning 
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {stats.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {stats.isRunning ? 'Pause' : 'Start'}
          </button>
          <button
            onClick={triggerPulse}
            disabled={isPulsing || !stats.isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors disabled:opacity-50"
          >
            <Zap className={`w-4 h-4 ${isPulsing ? 'animate-pulse' : ''}`} />
            Pulse
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Target className="w-4 h-4" />
            Center Energy
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{Math.round(stats.centerEnergy * 100)}%</span>
            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                style={{ width: `${stats.centerEnergy * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Flower2 className="w-4 h-4" />
            Total Nodes
          </div>
          <p className="text-2xl font-bold">{stats.totalNodes}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <GitBranch className="w-4 h-4" />
            Active Edges
          </div>
          <p className="text-2xl font-bold">{stats.totalEdges}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Activity className="w-4 h-4" />
            Total Pulses
          </div>
          <p className="text-2xl font-bold">{stats.totalPulses.toLocaleString()}</p>
        </div>
      </div>

      {/* Layer Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Layer Status */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-400" />
            Layer Distribution
          </h3>
          <div className="space-y-4">
            {layerCounts.map(({ layer, count, active }) => (
              <div 
                key={layer}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedLayer === layer 
                    ? 'bg-gray-800 border-purple-500/50' 
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
                onClick={() => setSelectedLayer(selectedLayer === layer ? null : layer)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${getLayerColor(layer)}`} />
                    <span className="font-medium">{getLayerName(layer)}</span>
                  </div>
                  <span className="text-sm text-gray-400">
                    {active}/{count} active
                  </span>
                </div>
                <div className="flex gap-1 mt-2">
                  {Array.from({ length: Math.min(count, 12) }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full ${
                        i < active ? getLayerColor(layer) : 'bg-gray-700'
                      }`}
                    />
                  ))}
                  {count > 12 && (
                    <span className="text-xs text-gray-500 ml-1">+{count - 12}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Node Details */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">
            {selectedLayer !== null ? getLayerName(selectedLayer) : 'Recent Nodes'}
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {nodes
              .filter(n => selectedLayer === null || n.layer === selectedLayer)
              .slice(0, 10)
              .map(node => (
                <div 
                  key={node.id}
                  className="p-3 bg-gray-800 rounded-lg flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium font-mono">{node.id}</p>
                    <p className="text-xs text-gray-500">{node.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div 
                      className={`w-2 h-2 rounded-full ${
                        node.state === 'active' ? 'bg-green-500' : 
                        node.state === 'spawning' ? 'bg-yellow-500' : 'bg-gray-500'
                      }`} 
                    />
                    <span className="text-xs text-gray-400">
                      {Math.round(node.energy * 100)}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
          {nodes.length === 0 && (
            <p className="text-gray-500 text-center py-8">Loading node data...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LatticeVisualizer;
