import { useEffect, useState } from 'react'
import { Store, Clock, CheckCircle, XCircle } from 'lucide-react'
import { api } from '../lib/api'

const STATUS_COLORS: Record<string, string> = {
  posted: 'bg-blue-500/20 text-blue-400',
  bidding: 'bg-yellow-500/20 text-yellow-400',
  awarded: 'bg-purple-500/20 text-purple-400',
  executing: 'bg-orange-500/20 text-orange-400',
  verifying: 'bg-cyan-500/20 text-cyan-400',
  settled: 'bg-vera-500/20 text-vera-400',
  cancelled: 'bg-red-500/20 text-red-400',
  disputed: 'bg-red-500/20 text-red-400',
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Marketplace</h2>
          <p className="text-gray-500 mt-1">Task lifecycle • Bids • Settlements</p>
        </div>
        <div className="flex gap-2">
          {['', 'bidding', 'executing', 'settled'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                filter === s
                  ? 'border-vera-500 bg-vera-600/20 text-vera-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500">Total Tasks</p>
          <p className="text-xl font-bold text-white">{stats.tasks?.total_tasks ?? 0}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500">Active Bids</p>
          <p className="text-xl font-bold text-white">{stats.tasks?.total_bids ?? 0}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500">HBAR Settled</p>
          <p className="text-xl font-bold text-vera-400">{stats.tasks?.total_settled_hbar ?? 0} ℏ</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500">Escrow Held</p>
          <p className="text-xl font-bold text-yellow-400">{stats.escrow?.total_held_hbar ?? 0} ℏ</p>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-300">Tasks ({tasks.length})</h3>
        </div>
        {tasks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Store size={32} className="mx-auto mb-2 opacity-50" />
            <p>No tasks yet. Post one to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {tasks.map((task: any) => (
              <div key={task.task_id} className="p-4 hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{task.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {task.category} • {task.bids?.length ?? 0} bids • {task.budget_hbar} ℏ budget
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[task.status] || 'bg-gray-700 text-gray-400'}`}>
                    {task.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
