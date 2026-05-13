import { Routes, Route, NavLink } from 'react-router-dom'
import { Activity, Store, Bot, Radio, Brain, Settings, Shield } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Marketplace from './pages/Marketplace'
import Agents from './pages/Agents'
import LiveFeed from './pages/LiveFeed'
import Intelligence from './pages/Intelligence'
import System from './pages/System'

const navItems = [
  { to: '/', icon: Activity, label: 'Overview' },
  { to: '/marketplace', icon: Store, label: 'Marketplace' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/live', icon: Radio, label: 'Live Feed' },
  { to: '/intelligence', icon: Brain, label: 'Intelligence' },
  { to: '/system', icon: Settings, label: 'System' },
]

export default function App() {
  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900/80 backdrop-blur border-r border-gray-800/60 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-vera-500/20 flex items-center justify-center">
              <Shield size={14} className="text-vera-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-tight">Vera OS</h1>
              <p className="text-[10px] text-gray-500 leading-tight">v2.0.0 &middot; 38 Agents &middot; 7 Layers</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                  isActive
                    ? 'bg-vera-500/15 text-vera-400 font-medium shadow-sm shadow-vera-500/5'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-800/60">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-vera-400 shadow-sm shadow-vera-400/50 animate-pulse" />
            <span className="text-[11px] text-gray-500">Proof loop active</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/live" element={<LiveFeed />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/system" element={<System />} />
        </Routes>
      </main>
    </div>
  )
}
