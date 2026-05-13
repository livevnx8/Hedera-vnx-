import { useEffect, useState } from 'react'
import { Radio, Wifi, WifiOff, Shield, ExternalLink } from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { api } from '../lib/api'

export default function LiveFeed() {
  const { events, connected } = useWebSocket()
  const [history, setHistory] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [proofStats, setProofStats] = useState<any>(null)

  useEffect(() => {
    api.getStreamHistory(30).then((r) => setHistory(r.events || [])).catch(() => {})
    api.get('/proof/receipts?limit=20').then((r) => setReceipts(r.receipts || [])).catch(() => {})
    api.get('/proof/stats').then(setProofStats).catch(() => {})
  }, [])

  const allEvents = [...history, ...events.map((e) => e.data)].slice(-100)

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Feed</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Real-time events + HCS proof receipts</p>
        </div>
        <div className="flex items-center gap-2.5">
          {proofStats && (
            <span className="text-[10px] px-2 py-1 rounded-lg bg-gray-800/60 text-gray-400 border border-gray-700/40">
              {proofStats.emitter?.mode || 'dry_run'} &middot; {proofStats.emitter?.total_emitted || 0} proofs
            </span>
          )}
          {connected ? (
            <span className="flex items-center gap-1.5 text-[11px] text-vera-400">
              <Wifi size={12} />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] text-red-400">
              <WifiOff size={12} />
              Offline
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Events Column */}
        <div className="lg:col-span-2 bg-gray-900/70 border border-gray-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800/60 flex items-center gap-2">
            <Radio size={12} className="text-vera-400" />
            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wider">Events ({allEvents.length})</span>
          </div>

          <div className="divide-y divide-gray-800/30 max-h-[640px] overflow-y-auto">
            {allEvents.length === 0 ? (
              <div className="py-16 text-center text-gray-500">
                <Radio size={24} className="mx-auto mb-2 opacity-25" />
                <p className="text-sm">No events yet. Activity will appear here in real-time.</p>
              </div>
            ) : (
              [...allEvents].reverse().map((event: any, i: number) => (
                <div key={`${event.event_id || event.channel || ''}-${i}`} className="px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400">
                        {event.channel || event.event_type || 'system'}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {event.task_id ? `task:${event.task_id}` : ''}
                      </span>
                    </div>
                    {event.proof_hash && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-vera-500/10 text-vera-400 font-mono">
                        {event.proof_hash.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* HCS Proof Receipts Column */}
        <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800/60 flex items-center gap-2">
            <Shield size={12} className="text-green-400" />
            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wider">Proof Receipts</span>
          </div>

          <div className="divide-y divide-gray-800/30 max-h-[640px] overflow-y-auto">
            {receipts.length === 0 ? (
              <div className="py-16 text-center text-gray-500">
                <Shield size={22} className="mx-auto mb-2 opacity-25" />
                <p className="text-[12px]">No proof receipts yet</p>
              </div>
            ) : (
              receipts.map((r: any, i: number) => (
                <div key={r.receipt_id || i} className="px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-gray-400">{r.event_type}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      r.mode === 'dry_run' ? 'bg-yellow-500/10 text-yellow-400' :
                      r.mode === 'testnet' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-green-500/10 text-green-400'
                    }`}>
                      {r.mode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-mono">
                      {r.proof_hash?.slice(0, 14)}
                    </span>
                    <div className="flex items-center gap-2">
                      {r.hashscan_url && (
                        <a href={r.hashscan_url} target="_blank" rel="noreferrer" className="text-vera-400 hover:text-vera-300">
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {r.topic_id && (
                        <span className="text-[9px] text-gray-600 font-mono">{r.topic_id}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
