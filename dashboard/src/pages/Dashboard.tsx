import { useEffect, useState } from 'react'
import { Activity, Bot, Store, Zap, TrendingUp, Shield, RefreshCw, BookOpen } from 'lucide-react'
import { api } from '../lib/api'

function StatCard({ icon: Icon, label, value, sub, accent = 'vera' }: {
  icon: any; label: string; value: string | number; sub?: string; accent?: string
}) {
  const colors: Record<string, string> = {
    vera: 'text-vera-400 bg-vera-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
    green: 'text-green-400 bg-green-500/10',
  }
  const c = colors[accent] || colors.vera
  return (
    <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-4 hover:border-gray-700/60 transition-colors">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={`p-1.5 rounded-md ${c.split(' ')[1]}`}>
          <Icon size={14} className={c.split(' ')[0]} strokeWidth={2} />
        </div>
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-semibold text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>({})
  const [proofStats, setProofStats] = useState<any>(null)
  const [learningStats, setLearningStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.getAgentStats().catch(() => ({})),
      api.getMarketplaceStats().catch(() => ({})),
      api.getStreamStats().catch(() => ({})),
      api.getProofStats().catch(() => null),
      api.getLearningStats().catch(() => null),
    ]).then(([agents, marketplace, stream, proof, learning]) => {
      setStats({ agents, marketplace, stream })
      setProofStats(proof)
      setLearningStats(learning)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw size={20} className="text-gray-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">System Overview</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Vera OS v2.0.0 — 7 layers, 38 agents, live proof loop</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Bot} label="Agents" value={stats.agents?.total_agents ?? 38} sub="8 first-party + 30 workflow" accent="blue" />
        <StatCard icon={Store} label="Tasks" value={stats.marketplace?.tasks?.total_tasks ?? 0} sub="Marketplace lifecycle" accent="purple" />
        <StatCard icon={TrendingUp} label="Settled" value={`${stats.marketplace?.tasks?.total_settled_hbar ?? 0} HBAR`} sub="Total settlement volume" accent="vera" />
        <StatCard icon={Zap} label="Events" value={stats.stream?.total_emitted ?? 0} sub="Stream pipeline" accent="yellow" />
      </div>

      {/* Proof + Learning stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Shield}
          label="Proofs Emitted"
          value={proofStats?.emitter?.total_emitted ?? 0}
          sub={`Mode: ${proofStats?.emitter?.mode ?? 'dry_run'}`}
          accent="green"
        />
        <StatCard
          icon={Activity}
          label="Proof Loops"
          value={learningStats?.loops?.total_loops ?? 0}
          sub={`${learningStats?.loops?.by_status?.closed ?? 0} closed`}
          accent="cyan"
        />
        <StatCard
          icon={BookOpen}
          label="Lessons"
          value={learningStats?.lessons?.total_lessons ?? 0}
          sub={`${learningStats?.lessons?.approved ?? 0} approved`}
          accent="purple"
        />
        <StatCard
          icon={Shield}
          label="Packages"
          value={learningStats?.packages?.total_packages ?? 0}
          sub={`${learningStats?.packages?.published ?? 0} published`}
          accent="vera"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-5">
        <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {[
            { label: 'Health Check', action: () => api.runNow({ task_type: 'health_check', budget_hbar: 5 }).catch(() => {}) },
            { label: 'Topic Audit', action: () => api.runNow({ task_type: 'topic_audit', budget_hbar: 10 }).catch(() => {}) },
            { label: 'Carbon Verify', action: () => api.runNow({ task_type: 'carbon_verify', budget_hbar: 15 }).catch(() => {}) },
            { label: 'Quality Score', action: () => api.runNow({ task_type: 'quality_score', budget_hbar: 10 }).catch(() => {}) },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={() => { action(); setTimeout(load, 500) }}
              className="px-3 py-2 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600/50 rounded-lg text-[12px] text-gray-300 hover:text-white transition-all duration-150"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
