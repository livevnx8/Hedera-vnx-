import { useState } from 'react'
import { Brain, Send, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

export default function Intelligence() {
  const [question, setQuestion] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [answer, setAnswer] = useState<any>(null)
  const [decomposition, setDecomposition] = useState<any>(null)
  const [loading, setLoading] = useState(false)

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
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Intelligence</h2>
        <p className="text-gray-500 mt-1">AI-powered task decomposition and Q&A</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ask Q&A */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Brain size={16} className="text-cyan-400" />
            Ask Vera
          </h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              placeholder="What is the current risk exposure?"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-vera-500"
            />
            <button
              onClick={handleAsk}
              disabled={loading}
              className="px-3 py-2 bg-vera-600 hover:bg-vera-500 rounded-lg text-white text-sm transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          {answer && (
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{answer.answer}</p>
              <p className="text-xs text-gray-600 mt-2">
                via {answer.method} • {answer.source_count ?? 0} sources
              </p>
            </div>
          )}
        </div>

        {/* Task Decomposition */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Brain size={16} className="text-purple-400" />
            Decompose Task
          </h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDecompose()}
              placeholder="Analyze whale activity and check portfolio risk"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-vera-500"
            />
            <button
              onClick={handleDecompose}
              disabled={loading}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          {decomposition && (
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2">{decomposition.reasoning}</p>
              <div className="space-y-2">
                {(decomposition.steps || []).map((step: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-vera-400 w-5">{i + 1}.</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                      {step.domain}/{step.agent}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {decomposition.method} • confidence: {Math.round((decomposition.confidence || 0) * 100)}%
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
