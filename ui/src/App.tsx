import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Bot, 
  MessageSquare, 
  CreditCard, 
  Settings,
  Flower2,
  Zap,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import LatticeVisualizer from './components/LatticeVisualizer';
import AgentMonitor from './components/AgentMonitor';
import HcsMonitor from './components/HcsMonitor';
import Dashboard from './components/Dashboard';
import Payments from './components/Payments';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemStatus, setSystemStatus] = useState({
    healthy: true,
    latticeActive: true,
    agentsOnline: 0,
    hcsMessages: 0,
    lastUpdate: new Date()
  });

  // Fetch system status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/vnx/health');
        const data = await response.json();
        setSystemStatus(prev => ({
          ...prev,
          healthy: data.status === 'healthy',
          lastUpdate: new Date()
        }));
      } catch (e) {
        // API not available yet
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'lattice', label: 'Lattice', icon: Flower2 },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'hcs', label: 'HCS Monitor', icon: MessageSquare },
    { id: 'payments', label: 'Payments', icon: CreditCard },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'lattice':
        return <LatticeVisualizer />;
      case 'agents':
        return <AgentMonitor />;
      case 'hcs':
        return <HcsMonitor />;
      case 'payments':
        return <Payments />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Flower2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                VNX Oasis
              </h1>
              <p className="text-xs text-gray-500">Living Lattice OS</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      activeTab === item.id
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                    {item.id === 'hcs' && systemStatus.hcsMessages > 0 && (
                      <span className="ml-auto bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {systemStatus.hcsMessages}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* System Status */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-2 text-sm">
            {systemStatus.healthy ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-green-400">System Online</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                <span className="text-yellow-400">Connecting...</span>
              </>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Last update: {systemStatus.lastUpdate.toLocaleTimeString()}
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-8">
          <h2 className="text-lg font-semibold capitalize">
            {activeTab.replace('-', ' ')}
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg">
              <Zap className={`w-4 h-4 ${systemStatus.latticeActive ? 'text-green-400 animate-pulse' : 'text-gray-500'}`} />
              <span className="text-sm text-gray-400">
                Lattice {systemStatus.latticeActive ? 'Active' : 'Standby'}
              </span>
            </div>
            <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
