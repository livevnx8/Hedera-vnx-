import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  Cpu,
  MemoryStick,
  Wifi
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'busy' | 'offline';
  taskCount: number;
  lastActive: string;
  cpu: number;
  memory: number;
  specialization: string[];
}

const AgentMonitor = () => {
  const [agents, setAgents] = useState<Agent[]>([
    {
      id: 'agent-001',
      name: 'Carbon Validator',
      type: 'carbon',
      status: 'busy',
      taskCount: 3,
      lastActive: new Date(Date.now() - 120000).toISOString(),
      cpu: 45,
      memory: 128,
      specialization: ['carbon', 'validation', 'monitoring']
    },
    {
      id: 'agent-002',
      name: 'DeFi Analyst',
      type: 'defi',
      status: 'idle',
      taskCount: 0,
      lastActive: new Date(Date.now() - 300000).toISOString(),
      cpu: 12,
      memory: 64,
      specialization: ['defi', 'analysis', 'pricing']
    },
    {
      id: 'agent-003',
      name: 'Bridge Operator',
      type: 'bridge',
      status: 'busy',
      taskCount: 1,
      lastActive: new Date(Date.now() - 60000).toISOString(),
      cpu: 78,
      memory: 256,
      specialization: ['bridge', 'cross-chain', 'settlement']
    },
    {
      id: 'agent-004',
      name: 'Health Monitor',
      type: 'healthcare',
      status: 'idle',
      taskCount: 0,
      lastActive: new Date(Date.now() - 600000).toISOString(),
      cpu: 8,
      memory: 32,
      specialization: ['healthcare', 'compliance', 'audit']
    },
    {
      id: 'agent-005',
      name: 'Supply Chain Tracker',
      type: 'supply',
      status: 'offline',
      taskCount: 0,
      lastActive: new Date(Date.now() - 3600000).toISOString(),
      cpu: 0,
      memory: 0,
      specialization: ['supply', 'tracking', 'verification']
    }
  ]);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'busy':
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      case 'offline':
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'idle':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'busy':
        return <Activity className="w-4 h-4 animate-pulse" />;
      case 'offline':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.status !== 'offline').length,
    busy: agents.filter(a => a.status === 'busy').length,
    idle: agents.filter(a => a.status === 'idle').length,
    offline: agents.filter(a => a.status === 'offline').length,
    totalTasks: agents.reduce((sum, a) => sum + a.taskCount, 0)
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-7 h-7 text-blue-400" />
            Agent Monitor
          </h2>
          <p className="text-gray-400 mt-1">Manage and monitor Vera agents</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Spawn Agent
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Bot className="w-4 h-4" />
            Total Agents
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Wifi className="w-4 h-4 text-green-400" />
            Active
          </div>
          <p className="text-2xl font-bold text-green-400">{stats.active}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Busy
          </div>
          <p className="text-2xl font-bold text-blue-400">{stats.busy}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Activity className="w-4 h-4" />
            Active Tasks
          </div>
          <p className="text-2xl font-bold">{stats.totalTasks}</p>
        </div>
      </div>

      {/* Agents List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Active Agents</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800">
              <tr>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Agent</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Tasks</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Resources</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Last Active</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {agents.map((agent) => (
                <tr 
                  key={agent.id} 
                  className="hover:bg-gray-800/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedAgent(agent)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <Bot className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{agent.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(agent.status)}`}>
                      {getStatusIcon(agent.status)}
                      <span className="capitalize">{agent.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm">{agent.taskCount} active</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-1">
                        <Cpu className="w-4 h-4 text-gray-500" />
                        <span>{agent.cpu}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MemoryStick className="w-4 h-4 text-gray-500" />
                        <span>{agent.memory}MB</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {new Date(agent.lastActive).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button 
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Toggle agent status
                        }}
                      >
                        {agent.status === 'offline' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      </button>
                      <button 
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Agent Details */}
      {selectedAgent && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Agent Details: {selectedAgent.name}</h3>
            <button 
              onClick={() => setSelectedAgent(null)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Type</p>
              <p className="font-medium capitalize">{selectedAgent.type}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Status</p>
              <p className="font-medium capitalize">{selectedAgent.status}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Active Tasks</p>
              <p className="font-medium">{selectedAgent.taskCount}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">CPU Usage</p>
              <p className="font-medium">{selectedAgent.cpu}%</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-400 mb-2">Specializations</p>
            <div className="flex flex-wrap gap-2">
              {selectedAgent.specialization.map((spec) => (
                <span 
                  key={spec}
                  className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs"
                >
                  {spec}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentMonitor;
