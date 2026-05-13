import { Routes, Route, NavLink } from 'react-router-dom'
import { Activity, Store, Bot, Radio, Brain, Settings } from 'lucide-react'
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
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-vera-400">Vera OS</h1>
          <p className="text-xs text-gray-500 mt-1">v1.0.0 • 30 Agents • 6 Domains</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-vera-600/20 text-vera-400 font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-vera-400 animate-pulse" />
            <span className="text-xs text-gray-500">System Active</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-950">
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
