import { useEffect, useState } from 'react'
import { Bot, Trophy, Shield } from 'lucide-react'
import { api } from '../lib/api'

const TIER_COLORS: Record<string, string> = {
  elite: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  trusted: 'bg-vera-500/15 text-vera-400 border-vera-500/20',
  standard: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  probation: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  restricted: 'bg-red-500/15 text-red-400 border-red-500/20',
}

const DOMAIN_COLORS: Record<string, string> = {
  defi: 'text-blue-400 bg-blue-500/10',
  carbon: 'text-green-400 bg-green-500/10',
  risk: 'text-orange-400 bg-orange-500/10',
  hedera: 'text-purple-400 bg-purple-500/10',
  intel: 'text-cyan-400 bg-cyan-500/10',
  ops: 'text-yellow-400 bg-yellow-500/10',
  marketplace: 'text-vera-400 bg-vera-500/10',
  compliance: 'text-pink-400 bg-pink-500/10',
}

export default function Agents() {
  const [agents, setAgents] = useState<any[]>([])
  const [fpAgents, setFpAgents] = useState<any[]>([])

  useEffect(() => {
    api.getAgents().then((r) => setAgents(r.agents || [])).catch(() => {})
    api.getVerifiableAgents().then((r) => setFpAgents(r.agents || [])).catch(() => {})
  }, [])

  const allAgents = [...fpAgents.map((a: any) => ({ ...a, is_first_party: true })), ...agents]

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Agents</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">{allAgents.length} agents — 8 first-party + 30 workflow</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {allAgents.length === 0 ? (
          <div className="col-span-3 text-center text-gray-500 py-16">
            <Bot size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No agents registered. Start the server to populate.</p>
          </div>
        ) : (
          allAgents.map((agent: any) => {
            const domain = agent.domain || 'general'
            const dc = DOMAIN_COLORS[domain] || 'text-gray-400 bg-gray-500/10'
            return (
              <div key={agent.agent_id} className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-4 hover:border-gray-700/60 transition-all duration-150 group">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`p-1 rounded-md shrink-0 ${dc.split(' ')[1]}`}>
                      {agent.is_first_party
                        ? <Shield size={13} className={dc.split(' ')[0]} strokeWidth={2} />
                        : <Bot size={13} className={dc.split(' ')[0]} strokeWidth={2} />
                      }
                    </div>
                    <span className="text-[13px] font-medium text-white truncate">{agent.display_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {agent.is_first_party && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-vera-500/15 text-vera-400 font-medium">VNX</span>
                    )}
                    {agent.tier && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TIER_COLORS[agent.tier] || 'bg-gray-700/50 text-gray-400 border-gray-700'}`}>
                        {agent.tier}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-2">
                  {agent.score != null && (
                    <div className="flex items-center gap-1">
                      <Trophy size={11} className="text-yellow-400/80" />
                      <span className="text-sm font-semibold text-white tabular-nums">{Math.round(agent.score)}</span>
                    </div>
                  )}
                  {agent.confidence_floor != null && (
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {Math.round(agent.confidence_floor * 100)}% floor
                    </div>
                  )}
                  <div className="text-[11px] text-gray-500 tabular-nums">
                    {agent.total_tasks ?? agent.total_executions ?? 0} runs
                    {agent.success_rate != null && <> &middot; {Math.round(agent.success_rate * 100)}%</>}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${dc}`}>
                    {domain}
                  </span>
                  {agent.total_earned_hbar != null && agent.total_earned_hbar > 0 && (
                    <span className="text-[10px] text-gray-500 tabular-nums">{agent.total_earned_hbar.toFixed(2)} HBAR</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
