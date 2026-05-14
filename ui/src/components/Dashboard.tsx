import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Bot, 
  MessageSquare, 
  CreditCard,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flower2,
  Zap,
  Gauge,
  RadioTower,
  Server
} from 'lucide-react';

interface SystemMetrics {
  totalAgents: number;
  activeTasks: number;
  hcsMessages: number;
  paymentsProcessed: number;
  latticeNodes: number;
  latticeEdges: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
  lastPulse: string;
}

interface HarmonicState {
  timestamp: number;
  status: 'aligned' | 'warm' | 'strained' | 'critical';
  signals: {
    orchestratorRunning: boolean;
    rigHealth: string | null;
    schedulerLoad: number;
    queueDepth: number;
    latticeCritical: number;
    latticeDegraded: number;
  };
  guidance: string[];
}

interface TaskRecord {
  intent: {
    taskId: string;
    serviceType: string;
    budget: number;
  };
  state: string;
  winnerId: string | null;
  hcsSequence?: number;
  updatedAt: number;
  createdAt: number;
}

interface WorkflowEvidenceSummary {
  total: number;
  open: number;
  proofing: number;
  closed: number;
  promoted: number;
  blocked: number;
  readyForLesson: number;
  readyForPromotion: number;
}

interface ReputationSummary {
  trackedAgents: number;
  totalOutcomes: number;
  averageReputation: number;
}

const Dashboard = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    totalAgents: 0,
    activeTasks: 0,
    hcsMessages: 0,
    paymentsProcessed: 0,
    latticeNodes: 0,
    latticeEdges: 0,
    systemHealth: 'healthy',
    lastPulse: new Date().toISOString()
  });

  const [harmonic, setHarmonic] = useState<HarmonicState | null>(null);
  const [harmonicError, setHarmonicError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [workflowSummary, setWorkflowSummary] = useState<WorkflowEvidenceSummary | null>(null);
  const [reputationSummary, setReputationSummary] = useState<ReputationSummary | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLiveState = async () => {
      try {
        const [tasksResponse, statsResponse, reputationResponse, evidenceResponse, harmonyResponse] = await Promise.all([
          fetch('/api/vnx/tasks'),
          fetch('/api/vnx/stats'),
          fetch('/api/vnx/reputation'),
          fetch('/api/vnx/workflows/evidence'),
          fetch('/api/vnx/harmony'),
        ]);

        if (!tasksResponse.ok) throw new Error(`Tasks endpoint returned ${tasksResponse.status}`);
        if (!statsResponse.ok) throw new Error(`Stats endpoint returned ${statsResponse.status}`);
        if (!reputationResponse.ok) throw new Error(`Reputation endpoint returned ${reputationResponse.status}`);
        if (!evidenceResponse.ok) throw new Error(`Evidence endpoint returned ${evidenceResponse.status}`);
        if (!harmonyResponse.ok) throw new Error(`Harmony endpoint returned ${harmonyResponse.status}`);

        const tasksData = await tasksResponse.json();
        const statsData = await statsResponse.json();
        const reputationData = await reputationResponse.json();
        const evidenceData = await evidenceResponse.json();
        const harmonyData = await harmonyResponse.json();

        const liveTasks: TaskRecord[] = tasksData.tasks ?? [];
        const terminalStates = new Set(['accepted', 'rejected', 'cancelled', 'expired']);
        const activeTasks = liveTasks.filter((task) => !terminalStates.has(task.state)).length;
        const hcsMessages = liveTasks.filter((task) => typeof task.hcsSequence === 'number').length
          + (statsData.orchestrator?.eventStream?.totalEvents ?? 0);

        setTasks(liveTasks);
        setWorkflowSummary(evidenceData.summary ?? null);
        setReputationSummary(reputationData.stats ?? null);
        setHarmonic(harmonyData);
        setHarmonicError(null);
        setLiveError(null);
        setMetrics(prev => ({
          ...prev,
          totalAgents: statsData.orchestrator?.registry?.activeAgents ?? reputationData.stats?.trackedAgents ?? prev.totalAgents,
          activeTasks,
          hcsMessages,
          paymentsProcessed: statsData.orchestrator?.settlement?.settled ?? 0,
          latticeNodes: statsData.orchestrator?.lattice?.nodes ?? statsData.orchestrator?.lattice?.totalNodes ?? prev.latticeNodes,
          latticeEdges: statsData.orchestrator?.lattice?.edges ?? statsData.orchestrator?.lattice?.totalEdges ?? prev.latticeEdges,
          systemHealth: harmonyData.status === 'critical'
            ? 'critical'
            : harmonyData.status === 'strained'
              ? 'degraded'
              : 'healthy',
          lastPulse: harmonyData.timestamp ? new Date(harmonyData.timestamp).toISOString() : new Date().toISOString()
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Live marketplace endpoints unavailable';
        setLiveError(message);
        if (message.includes('Harmony')) {
          setHarmonicError(message);
        }
      }
    };

    fetchLiveState();
    const interval = setInterval(fetchLiveState, 5000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { 
      label: 'Total Agents', 
      value: metrics.totalAgents, 
      icon: Bot, 
      color: 'blue',
      trend: `${reputationSummary?.trackedAgents ?? 0} scored`
    },
    { 
      label: 'Active Tasks', 
      value: metrics.activeTasks, 
      icon: Activity, 
      color: 'purple',
      trend: `${tasks.length} total`
    },
    { 
      label: 'HCS Messages', 
      value: metrics.hcsMessages.toLocaleString(), 
      icon: MessageSquare, 
      color: 'green',
      trend: `${workflowSummary?.closed ?? 0} closed proofs`
    },
    { 
      label: 'Payments', 
      value: metrics.paymentsProcessed, 
      icon: CreditCard, 
      color: 'orange',
      trend: `${workflowSummary?.proofing ?? 0} proofing`
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Activity className="w-4 h-4 text-blue-500" />;
    }
  };

  const getStatusColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'degraded':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'critical':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getHarmonicColor = (status: HarmonicState['status']) => {
    switch (status) {
      case 'aligned':
        return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
      case 'warm':
        return 'text-sky-300 bg-sky-500/10 border-sky-500/30';
      case 'strained':
        return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
      case 'critical':
        return 'text-red-300 bg-red-500/10 border-red-500/30';
      default:
        return 'text-gray-300 bg-gray-500/10 border-gray-500/30';
    }
  };

  const formatPercent = (value: number | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '0%';
    return `${Math.round(value * 100)}%`;
  };

  const harmonicSignals = [
    {
      label: 'Rig Health',
      value: harmonic?.signals.rigHealth ?? 'unknown',
      icon: Server,
    },
    {
      label: 'Scheduler Load',
      value: formatPercent(harmonic?.signals.schedulerLoad),
      icon: Gauge,
    },
    {
      label: 'Queue Depth',
      value: harmonic?.signals.queueDepth ?? 0,
      icon: Activity,
    },
    {
      label: 'Lattice Issues',
      value: `${harmonic?.signals.latticeDegraded ?? 0}/${harmonic?.signals.latticeCritical ?? 0}`,
      icon: RadioTower,
    },
  ];

  const formatAge = (timestamp: number) => {
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.round(minutes / 60)}h ago`;
  };

  const recentActivity = tasks
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map((task, index) => ({
      id: index,
      type: task.intent.serviceType,
      message: `${task.intent.taskId} is ${task.state}${task.winnerId ? ` with ${task.winnerId}` : ''}`,
      time: formatAge(task.updatedAt || task.createdAt),
      status: task.state === 'accepted' ? 'success' : task.state === 'rejected' || task.state === 'expired' ? 'warning' : 'info',
    }));

  return (
    <div className="space-y-6">
      <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-sky-300" />
              <h3 className="text-lg font-semibold">Harmonic State</h3>
            </div>
            <p className="mt-2 text-sm text-gray-400">
              Rig, scheduler, lattice health, enterprise priority, and Vera orchestration in one operator signal.
            </p>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-lg border px-4 py-2 ${getHarmonicColor(harmonic?.status ?? 'critical')}`}>
            {harmonic?.status === 'critical' || harmonicError ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span className="text-sm font-semibold uppercase tracking-wide">
              {harmonicError ? 'offline' : harmonic?.status ?? 'loading'}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {harmonicSignals.map((signal) => {
            const Icon = signal.icon;
            return (
              <div key={signal.label} className="rounded-lg border border-gray-800 bg-gray-950/70 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Icon className="w-4 h-4 text-cyan-300" />
                  <span>{signal.label}</span>
                </div>
                <p className="mt-3 text-2xl font-semibold capitalize text-white">{signal.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 border-t border-gray-800 pt-4">
          <p className="text-xs font-semibold uppercase text-gray-500">Guidance</p>
          {harmonicError ? (
            <p className="mt-2 text-sm text-amber-300">{harmonicError}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(harmonic?.guidance?.length ? harmonic.guidance : ['Waiting for harmonic telemetry...']).map((item) => (
                <li key={item} className="flex gap-2 text-sm text-gray-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          const colorClasses = {
            blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
            purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
            green: 'bg-green-500/10 border-green-500/20 text-green-400',
            orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
          }[stat.color];

          return (
            <div 
              key={index}
              className={`p-6 rounded-xl border ${colorClasses} transition-all hover:scale-[1.02]`}
            >
              <div className="flex items-center justify-between mb-4">
                <Icon className="w-8 h-8" />
                <TrendingUp className="w-4 h-4 opacity-50" />
              </div>
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="text-sm opacity-80 mt-1">{stat.label}</p>
              <p className="text-xs opacity-60 mt-2">{stat.trend}</p>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Marketplace Proof Loop</h3>
            <p className="mt-1 text-sm text-gray-400">
              Live task, settlement, reputation, and evidence posture from the Vera marketplace APIs.
            </p>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
            liveError
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}>
            {liveError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <span>{liveError ? 'partial data' : 'live'}</span>
          </div>
        </div>

        {liveError && (
          <p className="mt-3 text-sm text-amber-300">{liveError}</p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500">Open</p>
            <p className="mt-2 text-2xl font-bold">{workflowSummary?.open ?? 0}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500">Proofing</p>
            <p className="mt-2 text-2xl font-bold text-sky-300">{workflowSummary?.proofing ?? 0}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500">Closed</p>
            <p className="mt-2 text-2xl font-bold text-emerald-300">{workflowSummary?.closed ?? 0}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-4">
            <p className="text-xs uppercase text-gray-500">Ready</p>
            <p className="mt-2 text-2xl font-bold text-purple-300">{workflowSummary?.readyForPromotion ?? 0}</p>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Health */}
        <div className="lg:col-span-2 space-y-6">
          {/* Health Status */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-400" />
              System Health
            </h3>
            <div className="flex items-center gap-4 mb-6">
              <div className={`px-4 py-2 rounded-lg border ${getStatusColor(metrics.systemHealth)}`}>
                <span className="font-medium capitalize">{metrics.systemHealth}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Clock className="w-4 h-4" />
                Last pulse: {new Date(metrics.lastPulse).toLocaleTimeString()}
              </div>
            </div>
            
            {/* Lattice Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flower2 className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-gray-400">Lattice Nodes</span>
                </div>
                <p className="text-2xl font-bold">{metrics.latticeNodes}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-gray-400">Active Edges</span>
                </div>
                <p className="text-2xl font-bold">{metrics.latticeEdges}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-400">Pulses/min</span>
                </div>
                <p className="text-2xl font-bold">12</p>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {recentActivity.length === 0 && (
                <p className="rounded-lg bg-gray-800 p-3 text-sm text-gray-400">
                  Waiting for live marketplace activity.
                </p>
              )}
              {recentActivity.map((activity) => (
                <div 
                  key={activity.id}
                  className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
                >
                  {getStatusIcon(activity.status)}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.message}</p>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-gray-700 rounded text-gray-400 capitalize">
                    {activity.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full px-4 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors text-left flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Trigger Lattice Pulse
              </button>
              <button className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-left flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Spawn New Agent
              </button>
              <button className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-left flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Run System Audit
              </button>
            </div>
          </div>

          {/* Network Status */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-semibold mb-4">Network</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Hedera Network</span>
                <span className="text-sm text-green-400">Testnet</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">HCS Topic</span>
                <span className="text-sm font-mono text-gray-300">0.0.12345</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Consensus</span>
                <span className="text-sm text-green-400">Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Latency</span>
                <span className="text-sm text-gray-300">~2.3s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
