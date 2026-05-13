import { useEffect, useState } from 'react'
import { Radio, Wifi, WifiOff } from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import { api } from '../lib/api'

export default function LiveFeed() {
  const { events, connected } = useWebSocket()
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    api.getStreamHistory(30).then((r) => setHistory(r.events || [])).catch(() => {})
  }, [])

  const allEvents = [...history, ...events.map((e) => e.data)].slice(-100)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Live Feed</h2>
          <p className="text-gray-500 mt-1">Real-time event stream</p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1.5 text-xs text-vera-400">
              <Wifi size={14} />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <WifiOff size={14} />
              Disconnected
            </span>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <Radio size={14} className="text-vera-400" />
          <span className="text-sm text-gray-300">Events ({allEvents.length})</span>
        </div>

        <div className="divide-y divide-gray-800/50 max-h-[600px] overflow-y-auto">
          {allEvents.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Radio size={28} className="mx-auto mb-2 opacity-40" />
              <p>No events yet. Activity will appear here in real-time.</p>
            </div>
          ) : (
            [...allEvents].reverse().map((event: any, i: number) => (
              <div key={`${event.event_id || event.channel || ''}-${i}`} className="p-3 px-4 hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                      {event.channel || event.event_type || 'system'}
                    </span>
                    <span className="text-xs text-gray-300">
                      {event.task_id ? `task:${event.task_id}` : ''}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono">
                    {event.proof_hash?.slice(0, 8) || ''}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
