import { useEffect, useState } from 'react'
import { Cpu, Database, Zap, Shield } from 'lucide-react'
import { api } from '../lib/api'

export default function System() {
  const [aiStats, setAiStats] = useState<any>({})
  const [streamStats, setStreamStats] = useState<any>({})
  const [proofStats, setProofStats] = useState<any>(null)

  useEffect(() => {
    api.getAIStats().then(setAiStats).catch(() => {})
    api.getStreamStats().then(setStreamStats).catch(() => {})
    api.getProofStats().catch(() => null).then(setProofStats)
  }, [])

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">System</h2>
        <p className="text-[12px] text-gray-500 mt-0.5">Infrastructure, AI models, streaming, proof chain</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AI Models */}
        <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-5">
          <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Cpu size={13} className="text-purple-400" />
            AI Models
          </h3>
          <div className="space-y-2">
            {(aiStats.llm?.models || []).map((model: any) => (
              <div key={model.model_id} className="flex items-center justify-between bg-gray-800/60 rounded-lg p-3">
                <div>
                  <p className="text-[13px] font-medium text-white">{model.display_name}</p>
                  <p className="text-[11px] text-gray-500">{model.provider} &middot; {model.call_count} calls</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  model.available ? 'bg-vera-500/15 text-vera-400' : 'bg-red-500/15 text-red-400'
                }`}>
                  {model.available ? 'Online' : 'Offline'}
                </span>
              </div>
            ))}
            {(!aiStats.llm?.models || aiStats.llm.models.length === 0) && (
              <p className="text-[12px] text-gray-500">No models loaded</p>
            )}
          </div>
        </div>

        {/* Streaming Health */}
        <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-5">
          <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Zap size={13} className="text-yellow-400" />
            Streaming
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Events Emitted', value: streamStats.stream?.total_emitted ?? 0 },
              { label: 'Buffer Size', value: streamStats.stream?.buffer_size ?? 0 },
              { label: 'WS Connections', value: streamStats.connections?.active_connections ?? 0 },
              { label: 'Pipeline Rules', value: streamStats.pipeline?.total_rules ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800/60 rounded-lg p-3">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
                <p className="text-base font-semibold text-white tabular-nums mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Proof Chain */}
        <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-5">
          <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Shield size={13} className="text-green-400" />
            Proof Chain
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Mode', value: proofStats?.emitter?.mode ?? 'dry_run' },
              { label: 'Total Emitted', value: proofStats?.emitter?.total_emitted ?? 0 },
              { label: 'Verifications', value: proofStats?.verifier?.total_verifications ?? 0 },
              { label: 'Chain Length', value: proofStats?.emitter?.chain_length ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800/60 rounded-lg p-3">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
                <p className="text-base font-semibold text-white tabular-nums mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* System Config */}
        <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-5">
          <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Database size={13} className="text-cyan-400" />
            Configuration
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Version', value: 'v2.0.0' },
              { label: 'Agents', value: '38' },
              { label: 'Layers', value: '7' },
              { label: 'AI Primary', value: aiStats.llm?.primary_model ?? 'fallback' },
              { label: 'RAG Entries', value: aiStats.rag?.total_entries ?? 0 },
              { label: 'Total AI Calls', value: aiStats.llm?.total_calls ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800/60 rounded-lg p-3">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
                <p className="text-[13px] font-medium text-white mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
