import { useState } from 'react'
import { Brain, Send, Loader2, Shield, Zap } from 'lucide-react'
import { api } from '../lib/api'

export default function Intelligence() {
  const [question, setQuestion] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [answer, setAnswer] = useState<any>(null)
  const [decomposition, setDecomposition] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [proofRun, setProofRun] = useState<any>(null)
  const [runType, setRunType] = useState('health_check')
  const [runLoading, setRunLoading] = useState(false)

  const handleAsk = async () => {
    if (!question.trim()) return
    setLoading(true)
    try {
      const result = await api.ask(question)
      setAnswer(result)
    } catch (e: any) {
      setAnswer({ answer: `Error: ${e.message}` })
    }
    setLoading(false)
  }

  const handleDecompose = async () => {
    if (!taskDesc.trim()) return
    setLoading(true)
    try {
      const result = await api.decompose(taskDesc)
      setDecomposition(result)
    } catch (e: any) {
      setDecomposition({ steps: [], reasoning: `Error: ${e.message}` })
    }
    setLoading(false)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Intelligence</h2>
        <p className="text-[12px] text-gray-500 mt-0.5">AI Q&amp;A, task decomposition, verifiable proof loop runner</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ask Q&A */}
        <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-5">
          <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Brain size={13} className="text-cyan-400" />
            Ask Vera
          </h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              placeholder="What is the current risk exposure?"
              className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-[13px] text-white placeholder-gray-500 focus:outline-none focus:border-vera-500/50 transition-colors"
            />
            <button
              onClick={handleAsk}
              disabled={loading}
              className="px-3 py-2 bg-vera-600/80 hover:bg-vera-500 rounded-lg text-white text-[13px] transition-all duration-150 disabled:opacity-40"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          {answer && (
            <div className="bg-gray-800/60 rounded-lg p-3.5">
              <p className="text-[13px] text-gray-300 whitespace-pre-wrap leading-relaxed">{answer.answer}</p>
              <p className="text-[10px] text-gray-500 mt-2">
                via {answer.method} &middot; {answer.source_count ?? 0} sources
              </p>
            </div>
          )}
        </div>

        {/* Task Decomposition */}
        <div className="bg-gray-900/70 border border-gray-800/60 rounded-xl p-5">
          <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Brain size={13} className="text-purple-400" />
            Decompose Task
          </h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDecompose()}
              placeholder="Analyze whale activity and check portfolio risk"
              className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-[13px] text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
            />
            <button
              onClick={handleDecompose}
              disabled={loading}
              className="px-3 py-2 bg-purple-600/80 hover:bg-purple-500 rounded-lg text-white text-[13px] transition-all duration-150 disabled:opacity-40"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          {decomposition && (
            <div className="bg-gray-800/60 rounded-lg p-3.5">
              <p className="text-[11px] text-gray-500 mb-2">{decomposition.reasoning}</p>
              <div className="space-y-1.5">
                {(decomposition.steps || []).map((step: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-vera-400 w-4 text-right">{i + 1}.</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-gray-700/60 text-gray-300">
                      {step.domain}/{step.agent}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                {decomposition.method} &middot; {Math.round((decomposition.confidence || 0) * 100)}% confidence
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Verifiable AI Runner */}
      <div className="mt-4 bg-gray-900/70 border border-gray-800/60 rounded-xl p-5">
        <h3 className="text-[12px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap size={13} className="text-green-400" />
          Run Verifiable Task
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">proof loop</span>
        </h3>
        <div className="flex gap-2 mb-3">
          <select
            value={runType}
            onChange={(e) => setRunType(e.target.value)}
            className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-green-500/50 transition-colors"
          >
            <option value="health_check">Health Check</option>
            <option value="topic_audit">HCS Topic Audit</option>
            <option value="carbon_verify">Carbon Verification</option>
            <option value="compliance_review">Compliance Review</option>
            <option value="quality_score">Quality Score</option>
            <option value="proof_publish">Proof Publish</option>
          </select>
          <button
            onClick={async () => {
              setRunLoading(true)
              try {
                const result = await api.runNow({ task_type: runType, budget_hbar: 10.0, data: {} })
                setProofRun(result)
              } catch (e: any) {
                setProofRun({ status: 'error', error: e.message })
              }
              setRunLoading(false)
            }}
            disabled={runLoading}
            className="px-4 py-2 bg-green-600/80 hover:bg-green-500 rounded-lg text-white text-[13px] transition-all duration-150 disabled:opacity-40 flex items-center gap-2"
          >
            {runLoading ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
            Run Now
          </button>
        </div>

        {proofRun && (
          <div className="bg-gray-800/60 rounded-lg p-3.5 space-y-1.5">
            {[
              { label: 'Status', value: proofRun.status, cls: proofRun.status === 'settled' ? 'text-green-400' : 'text-red-400' },
              proofRun.agent_name && { label: 'Agent', value: proofRun.agent_name, cls: 'text-white' },
              proofRun.verification && { label: 'Verification', value: `${Math.round((proofRun.verification.score || 0) * 100)}%`, cls: 'text-white' },
              proofRun.settlement && { label: 'Settlement', value: `${proofRun.settlement.amount_hbar} HBAR`, cls: 'text-vera-400' },
              proofRun.proof && { label: 'Proof Receipts', value: `${proofRun.proof.receipts?.length || 0} (${proofRun.proof.mode})`, cls: 'text-gray-300' },
              proofRun.duration_s && { label: 'Duration', value: `${proofRun.duration_s}s`, cls: 'text-gray-300' },
            ].filter(Boolean).map((row: any) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">{row.label}</span>
                <span className={`text-[11px] font-medium tabular-nums ${row.cls}`}>{row.value}</span>
              </div>
            ))}
            {proofRun.error && (
              <p className="text-[11px] text-red-400 mt-1">{proofRun.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
