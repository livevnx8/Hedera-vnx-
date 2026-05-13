import { useEffect, useState } from 'react'
import { Settings, Cpu, Database, Zap } from 'lucide-react'
import { api } from '../lib/api'

export default function System() {
  const [aiStats, setAiStats] = useState<any>({})
  const [streamStats, setStreamStats] = useState<any>({})
  const [pipelineHistory, setPipelineHistory] = useState<any[]>([])

  useEffect(() => {
    api.getAIStats().then(setAiStats).catch(() => {})
    api.getStreamStats().then(setStreamStats).catch(() => {})
  }, [])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">System</h2>
        <p className="text-gray-500 mt-1">Infrastructure, AI models, streaming health</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Models */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Cpu size={16} className="text-purple-400" />
            AI Models
          </h3>
          <div className="space-y-3">
            {(aiStats.llm?.models || []).map((model: any) => (
              <div key={model.model_id} className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                <div>
                  <p className="text-sm text-white">{model.display_name}</p>
                  <p className="text-xs text-gray-500">{model.provider} • {model.call_count} calls</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  model.available ? 'bg-vera-500/20 text-vera-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {model.available ? 'Online' : 'Offline'}
                </span>
              </div>
            ))}
            {(!aiStats.llm?.models || aiStats.llm.models.length === 0) && (
              <p className="text-sm text-gray-500">Loading models...</p>
            )}
          </div>
        </div>

        {/* Streaming Health */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Zap size={16} className="text-yellow-400" />
            Streaming
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Events Emitted</p>
              <p className="text-lg font-bold text-white">{streamStats.stream?.total_emitted ?? 0}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Buffer Size</p>
              <p className="text-lg font-bold text-white">{streamStats.stream?.buffer_size ?? 0}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">WS Connections</p>
              <p className="text-lg font-bold text-white">{streamStats.connections?.active_connections ?? 0}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Pipeline Rules</p>
              <p className="text-lg font-bold text-white">{streamStats.pipeline?.total_rules ?? 0}</p>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 lg:col-span-2">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Database size={16} className="text-cyan-400" />
            System Configuration
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Version', value: 'v1.0.0' },
              { label: 'Agents', value: '30' },
              { label: 'Domains', value: '6' },
              { label: 'AI Primary', value: aiStats.llm?.primary_model ?? 'fallback' },
              { label: 'RAG Entries', value: aiStats.rag?.total_entries ?? 0 },
              { label: 'Decompositions', value: aiStats.decompositions ?? 0 },
              { label: 'Summaries', value: aiStats.summaries ?? 0 },
              { label: 'Total AI Calls', value: aiStats.llm?.total_calls ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-medium text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
