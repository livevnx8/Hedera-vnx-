import { useEffect, useState } from 'react'
import { Store, Shield } from 'lucide-react'
import { api } from '../lib/api'

const STATUS_COLORS: Record<string, string> = {
  posted: 'bg-blue-500/15 text-blue-400',
  bidding: 'bg-yellow-500/15 text-yellow-400',
  awarded: 'bg-purple-500/15 text-purple-400',
  executing: 'bg-orange-500/15 text-orange-400',
  verifying: 'bg-cyan-500/15 text-cyan-400',
  settled: 'bg-vera-500/15 text-vera-400',
  cancelled: 'bg-red-500/15 text-red-400',
  disputed: 'bg-red-500/15 text-red-400',
}

export default function Marketplace() {
  const [tasks, setTasks] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [filter, setFilter] = useState<string>('')

  useEffect(() => {
    api.getTasks(filter || undefined).then((r) => setTasks(r.tasks || [])).catch(() => {})
    api.getMarketplaceStats().then(setStats).catch(() => {})
  }, [filter])

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Marketplace</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Task lifecycle &middot; Bids &middot; Settlements</p>
        </div>
        <div className="flex gap-1.5">
          {['', 'bidding', 'executing', 'settled'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1.5 text-[11px] rounded-lg border transition-all duration-150 ${
                filter === s
                  ? 'border-vera-500/40 bg-vera-500/15 text-vera-400 font-medium'
                  : 'border-gray-700/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Tasks', value: stats.tasks?.total_tasks ?? 0, color: 'text-white' },
          { label: 'Active Bids', value: stats.tasks?.total_bids ?? 0, color: 'text-white' },
          { label: 'HBAR Settled', value: `${stats.tasks?.total_settled_hbar ?? 0}`, color: 'text-vera-400' },
          { label: 'Escrow Held', value: `${stats.escrow?.total_held_hbar ?? 0}`, color: 'text-yellow-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-4">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Task List */}
      <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800/60">
          <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider">Tasks ({tasks.length})</h3>
        </div>
        {tasks.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <Store size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No tasks yet. Post one to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/40">
            {tasks.map((task: any) => (
              <div key={task.task_id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{task.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {task.category} &middot; {task.bids?.length ?? 0} bids &middot; {task.budget_hbar} HBAR
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {task.result?.proof_hash && (
                      <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">
                        <Shield size={9} />
                        proof
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[task.status] || 'bg-gray-700/50 text-gray-400'}`}>
                      {task.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
