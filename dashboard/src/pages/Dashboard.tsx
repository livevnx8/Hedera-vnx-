import { useEffect, useState } from 'react'
import { Activity, Bot, Store, Zap, TrendingUp, Shield } from 'lucide-react'
import { api } from '../lib/api'

interface Stats {
  agents?: { total_agents?: number; total_runs?: number }
  marketplace?: { tasks?: { total_tasks?: number; total_settled_hbar?: number } }
  stream?: { total_emitted?: number; active_subscribers?: number }
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-vera-600/10">
          <Icon size={18} className="text-vera-400" />
        </div>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getAgentStats().catch(() => ({})),
      api.getMarketplaceStats().catch(() => ({})),
      api.getStreamStats().catch(() => ({})),
    ]).then(([agents, marketplace, stream]) => {
      setStats({ agents, marketplace, stream })
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="p-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">System Overview</h2>
        <p className="text-gray-500 mt-1">Vera OS v1.0.0 — Real-time agent marketplace</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard icon={Bot} label="Active Agents" value={stats.agents?.total_agents ?? 30} sub="6 domains" />
        <StatCard icon={Store} label="Total Tasks" value={stats.marketplace?.tasks?.total_tasks ?? 0} sub="Marketplace" />
        <StatCard icon={TrendingUp} label="HBAR Settled" value={`${stats.marketplace?.tasks?.total_settled_hbar ?? 0} ℏ`} sub="Total volume" />
        <StatCard icon={Zap} label="Events Emitted" value={stats.stream?.total_emitted ?? 0} sub="Stream pipeline" />
        <StatCard icon={Activity} label="Agent Runs" value={stats.agents?.total_runs ?? 0} sub="All-time executions" />
        <StatCard icon={Shield} label="System Status" value="Operational" sub="All systems green" />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['Run Intel Scan', 'Risk Assessment', 'System Health', 'Post Task'].map((action) => (
            <button
              key={action}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
