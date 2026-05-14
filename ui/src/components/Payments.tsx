import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Wallet
} from 'lucide-react';

interface Payment {
  id: string;
  type: 'x402' | 'hcs' | 'escrow';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  from: string;
  to: string;
  timestamp: string;
  memo?: string;
}

const Payments = () => {
  const [payments, setPayments] = useState<Payment[]>([
    {
      id: 'pay-001',
      type: 'x402',
      amount: 50,
      currency: 'ℏ',
      status: 'completed',
      from: '0.0.1001',
      to: '0.0.1002',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      memo: 'Agent task completion'
    },
    {
      id: 'pay-002',
      type: 'escrow',
      amount: 1250,
      currency: 'ℏ',
      status: 'pending',
      from: '0.0.2001',
      to: '0.0.2002',
      timestamp: new Date(Date.now() - 600000).toISOString(),
      memo: 'Multi-agent batch job'
    },
    {
      id: 'pay-003',
      type: 'hcs',
      amount: 0.1,
      currency: 'ℏ',
      status: 'completed',
      from: '0.0.3001',
      to: '0.0.3002',
      timestamp: new Date(Date.now() - 900000).toISOString(),
      memo: 'Message verification'
    }
  ]);

  const [stats, setStats] = useState({
    totalVolume: 1300.1,
    totalCount: 89,
    pendingCount: 12,
    successRate: 98.5
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'pending':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'failed':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'x402':
        return 'x402 Payment';
      case 'escrow':
        return 'Escrow';
      case 'hcs':
        return 'HCS Fee';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-6 h-6 text-purple-400" />
            <span className="text-sm text-gray-400">Total Volume</span>
          </div>
          <p className="text-2xl font-bold">{stats.totalVolume.toLocaleString()} ℏ</p>
          <p className="text-xs text-gray-500 mt-1">+12% this week</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="w-6 h-6 text-blue-400" />
            <span className="text-sm text-gray-400">Total Payments</span>
          </div>
          <p className="text-2xl font-bold">{stats.totalCount}</p>
          <p className="text-xs text-gray-500 mt-1">All time</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-6 h-6 text-yellow-400" />
            <span className="text-sm text-gray-400">Pending</span>
          </div>
          <p className="text-2xl font-bold">{stats.pendingCount}</p>
          <p className="text-xs text-gray-500 mt-1">Awaiting settlement</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 h-6 text-green-400" />
            <span className="text-sm text-gray-400">Success Rate</span>
          </div>
          <p className="text-2xl font-bold">{stats.successRate}%</p>
          <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
        </div>
      </div>

      {/* Payment Types */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-400 text-sm">x402</span>
            x402 Micropayments
          </h3>
          <p className="text-sm text-gray-400 mb-4">Stream-based payments for agent tasks</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Active Streams</span>
              <span className="text-white">8</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Volume (24h)</span>
              <span className="text-white">450 ℏ</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 text-sm">ESC</span>
            Escrow
          </h3>
          <p className="text-sm text-gray-400 mb-4">Secure task-completion payments</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Active Escrows</span>
              <span className="text-white">5</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Locked Value</span>
              <span className="text-white">2,150 ℏ</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-green-400 text-sm">HCS</span>
            HCS Operations
          </h3>
          <p className="text-sm text-gray-400 mb-4">Message submission fees</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Messages (24h)</span>
              <span className="text-white">1,247</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Fees</span>
              <span className="text-white">12.47 ℏ</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Payments Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-lg font-semibold">Recent Payments</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800">
              <tr>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">ID</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Type</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Amount</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">From → To</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-6 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-gray-400">{payment.id}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-300">{getTypeLabel(payment.type)}</span>
                    {payment.memo && (
                      <p className="text-xs text-gray-500">{payment.memo}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium">
                      {payment.amount} {payment.currency}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-gray-400">{payment.from}</span>
                      <ArrowRight className="w-3 h-3 text-gray-600" />
                      <span className="font-mono text-gray-400">{payment.to}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(payment.status)}`}>
                      {getStatusIcon(payment.status)}
                      <span className="capitalize">{payment.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(payment.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Payments;
