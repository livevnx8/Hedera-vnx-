import { useEffect, useState } from 'react'
import { Bot, Trophy, TrendingUp } from 'lucide-react'
import { api } from '../lib/api'

const TIER_COLORS: Record<string, string> = {
  elite: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  trusted: 'bg-vera-500/20 text-vera-400 border-vera-500/30',
  standard: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  probation: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  restricted: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const DOMAIN_COLORS: Record<string, string> = {
  defi: 'text-blue-400',
  carbon: 'text-green-400',
  risk: 'text-orange-400',
  hedera: 'text-purple-400',
  intel: 'text-cyan-400',
  ops: 'text-yellow-400',
}

export default function Agents() {
  const [agents, setAgents] = useState<any[]>([])

  useEffect(() => {
    api.getAgents().then((r) => setAgents(r.agents || [])).catch(() => {})
  }, [])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Agents</h2>
        <p className="text-gray-500 mt-1">30 specialized agents across 6 domains</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.length === 0 ? (
          <div className="col-span-3 text-center text-gray-500 py-12">
            <Bot size={40} className="mx-auto mb-3 opacity-40" />
            <p>No agents registered yet. Start the server to populate agents.</p>
          </div>
        ) : (
          agents.map((agent: any) => (
            <div key={agent.agent_id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot size={16} className={DOMAIN_COLORS[agent.domain] || 'text-gray-400'} />
                  <span className="text-sm font-medium text-white">{agent.display_name}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs border ${TIER_COLORS[agent.tier] || 'bg-gray-700 text-gray-400'}`}>
                  {agent.tier}
                </span>
              </div>

              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-1">
                  <Trophy size={12} className="text-yellow-400" />
                  <span className="text-lg font-bold text-white">{Math.round(agent.score)}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {agent.total_tasks} tasks • {Math.round((agent.success_rate || 0) * 100)}% success
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className={DOMAIN_COLORS[agent.domain] || ''}>{agent.domain}</span>
                <span>{agent.total_earned_hbar?.toFixed(2) ?? 0} ℏ earned</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
