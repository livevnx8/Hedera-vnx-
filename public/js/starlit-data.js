/**
 * Starlit Data Layer
 * 
 * Real-time data visualization and processing for Vera's UI.
 * Handles Hedera data streaming, chart rendering, and reactive data binding.
 */

class StarlitData {
  constructor() {
    this.charts = new Map();
    this.dataCache = new Map();
    this.subscribers = new Map();
    this.autoRefresh = new Map();
  }

  /**
   * Initialize IndexedDB for data caching
   */
  async initStorage() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('starlit-data', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('metrics')) {
          db.createObjectStore('metrics', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('queries')) {
          db.createObjectStore('queries', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Subscribe to real-time data updates
   */
  subscribe(channel, callback) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel).add(callback);
    
    return () => {
      this.subscribers.get(channel)?.delete(callback);
    };
  }

  /**
   * Publish data update to subscribers
   */
  publish(channel, data) {
    this.dataCache.set(channel, { data, timestamp: Date.now() });
    this.subscribers.get(channel)?.forEach(cb => {
      try { cb(data); } catch (e) { console.error('Starlit subscriber error:', e); }
    });
  }

  /**
   * Create a real-time chart for Hedera token prices
   */
  createPriceChart(containerId, tokenId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const chart = LightweightCharts.createChart(container, {
      width: options.width || container.clientWidth,
      height: options.height || 400,
      layout: {
        background: { color: 'transparent' },
        textColor: getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e2e8f0',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)' },
      ...options.chartOptions,
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const chartId = `${containerId}-${tokenId}`;
    this.charts.set(chartId, { chart, series, tokenId });

    // Auto-refresh price data
    this.startPriceRefresh(chartId, tokenId, options.interval || 60000);

    return { chart, series, id: chartId };
  }

  /**
   * Start automatic price data refresh
   */
  async startPriceRefresh(chartId, tokenId, interval) {
    if (this.autoRefresh.has(chartId)) {
      clearInterval(this.autoRefresh.get(chartId));
    }

    const refresh = async () => {
      try {
        const response = await fetch(`/v1/hedera/saucerswap/token/${tokenId}/price-chart?period=1h`);
        if (!response.ok) throw new Error('Failed to fetch price data');
        const data = await response.json();
        
        const chart = this.charts.get(chartId);
        if (chart && data.candles) {
          chart.series.setData(data.candles.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })));
          chart.chart.timeScale().fitContent();
        }

        this.publish(`price:${tokenId}`, data);
      } catch (error) {
        console.error('Price refresh error:', error);
      }
    };

    await refresh(); // Initial load
    const timer = setInterval(refresh, interval);
    this.autoRefresh.set(chartId, timer);
  }

  /**
   * Create account balance visualization
   */
  createBalanceCard(containerId, accountId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const card = document.createElement('div');
    card.className = 'starlit-data-card';
    card.innerHTML = `
      <div class="starlit-card-header">
        <span class="starlit-card-title">${options.title || 'Account Balance'}</span>
        <span class="starlit-card-badge">${accountId}</span>
      </div>
      <div class="starlit-card-content" id="${containerId}-content">
        <div class="starlit-loading">Loading...</div>
      </div>
      ${options.showTokens ? `<div class="starlit-card-tokens" id="${containerId}-tokens"></div>` : ''}
    `;
    container.appendChild(card);

    // Subscribe to balance updates
    const unsubscribe = this.subscribe(`balance:${accountId}`, (data) => {
      this.updateBalanceCard(containerId, data);
    });

    // Initial load
    this.refreshBalance(accountId);

    return { card, unsubscribe };
  }

  /**
   * Update balance card with new data
   */
  updateBalanceCard(containerId, data) {
    const content = document.getElementById(`${containerId}-content`);
    const tokensContainer = document.getElementById(`${containerId}-tokens`);
    
    if (content) {
      content.innerHTML = `
        <div class="starlit-balance-main">
          <span class="starlit-balance-value">${data.hbarBalance?.toFixed(4) || '0.0000'}</span>
          <span class="starlit-balance-unit">HBAR</span>
        </div>
        ${data.usdValue ? `<div class="starlit-balance-usd">≈ $${data.usdValue.toFixed(2)} USD</div>` : ''}
      `;
    }

    if (tokensContainer && data.tokens) {
      const tokenHtml = data.tokens.slice(0, 5).map(token => `
        <div class="starlit-token-row">
          <span class="starlit-token-symbol">${token.symbol}</span>
          <span class="starlit-token-balance">${(token.balance / Math.pow(10, token.decimals || 0)).toLocaleString()}</span>
        </div>
      `).join('');
      tokensContainer.innerHTML = tokenHtml || '<div class="starlit-no-tokens">No tokens found</div>';
    }
  }

  /**
   * Refresh account balance from API
   */
  async refreshBalance(accountId) {
    try {
      const response = await fetch(`/v1/hedera/account/${accountId}/info`);
      if (!response.ok) throw new Error('Failed to fetch balance');
      const data = await response.json();
      this.publish(`balance:${accountId}`, data);
      return data;
    } catch (error) {
      console.error('Balance refresh error:', error);
      return null;
    }
  }

  /**
   * Create a data table with sorting and filtering
   */
  createDataTable(containerId, columns, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const table = document.createElement('table');
    table.className = 'starlit-data-table';
    
    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        ${columns.map(col => `
          <th data-column="${col.key}" ${col.sortable ? 'class="sortable"' : ''}>
            ${col.label}
            ${col.sortable ? '<span class="sort-indicator">↕</span>' : ''}
          </th>
        `).join('')}
      </tr>
    `;
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    tbody.id = `${containerId}-tbody`;
    table.appendChild(tbody);

    container.appendChild(table);

    // Sorting
    if (options.sortable) {
      thead.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const column = th.dataset.column;
          const currentDir = th.dataset.sort || 'asc';
          const newDir = currentDir === 'asc' ? 'desc' : 'asc';
          
          thead.querySelectorAll('th').forEach(h => delete h.dataset.sort);
          th.dataset.sort = newDir;
          
          this.sortTable(containerId, column, newDir);
        });
      });
    }

    return {
      table,
      setData: (data) => this.updateDataTable(containerId, columns, data),
      clear: () => { tbody.innerHTML = ''; },
    };
  }

  /**
   * Update data table with new rows
   */
  updateDataTable(containerId, columns, data) {
    const tbody = document.getElementById(`${containerId}-tbody`);
    if (!tbody) return;

    tbody.innerHTML = data.map(row => `
      <tr>
        ${columns.map(col => {
          const value = this.getNestedValue(row, col.key);
          const formatted = col.format ? col.format(value, row) : value;
          return `<td>${formatted}</td>`;
        }).join('')}
      </tr>
    `).join('');
  }

  /**
   * Sort table by column
   */
  sortTable(containerId, column, direction) {
    const tbody = document.getElementById(`${containerId}-tbody`);
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const colIndex = Array.from(tbody.closest('table').querySelectorAll('thead th'))
      .findIndex(th => th.dataset.column === column);

    rows.sort((a, b) => {
      const aVal = a.cells[colIndex]?.textContent || '';
      const bVal = b.cells[colIndex]?.textContent || '';
      
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return direction === 'asc' ? aNum - bNum : bNum - aNum;
      }
      
      return direction === 'asc' 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    });

    rows.forEach(row => tbody.appendChild(row));
  }

  /**
   * Get nested object value by path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Create a JSON tree viewer for API responses
   */
  createJsonViewer(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const viewer = document.createElement('div');
    viewer.className = 'starlit-json-viewer';
    viewer.innerHTML = this.renderJsonTree(data, 0, options.expanded || false);
    container.appendChild(viewer);

    // Add click handlers for expand/collapse
    viewer.querySelectorAll('.starlit-json-key').forEach(key => {
      key.addEventListener('click', (e) => {
        const parent = e.target.closest('.starlit-json-node');
        if (parent) {
          parent.classList.toggle('collapsed');
        }
      });
    });

    return viewer;
  }

  /**
   * Render JSON as expandable tree
   */
  renderJsonTree(data, depth = 0, expanded = false) {
    if (data === null) return '<span class="starlit-json-null">null</span>';
    if (typeof data === 'string') return `<span class="starlit-json-string">"${this.escapeHtml(data)}"</span>`;
    if (typeof data === 'number') return `<span class="starlit-json-number">${data}</span>`;
    if (typeof data === 'boolean') return `<span class="starlit-json-boolean">${data}</span>`;
    
    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      const items = data.map((item, i) => `
        <div class="starlit-json-item">
          <span class="starlit-json-index">${i}:</span>
          ${this.renderJsonTree(item, depth + 1, expanded)}
        </div>
      `).join('');
      
      return `
        <div class="starlit-json-node ${expanded ? '' : 'collapsed'}">
          <span class="starlit-json-bracket">[</span>
          <span class="starlit-json-key">${data.length} items</span>
          <div class="starlit-json-children">${items}</div>
          <span class="starlit-json-bracket">]</span>
        </div>
      `;
    }
    
    if (typeof data === 'object') {
      const entries = Object.entries(data);
      if (entries.length === 0) return '{}';
      
      const props = entries.map(([key, value]) => `
        <div class="starlit-json-property">
          <span class="starlit-json-key">"${key}":</span>
          ${this.renderJsonTree(value, depth + 1, expanded)}
        </div>
      `).join('');
      
      return `
        <div class="starlit-json-node ${expanded ? '' : 'collapsed'}">
          <span class="starlit-json-bracket">{</span>
          <span class="starlit-json-key">${entries.length} props</span>
          <div class="starlit-json-children">${props}</div>
          <span class="starlit-json-bracket">}</span>
        </div>
      `;
    }
    
    return String(data);
  }

  /**
   * Escape HTML for safe rendering
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Export data to CSV
   */
  exportToCSV(data, filename = 'export.csv') {
    if (!data || !data.length) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => {
          const val = row[h];
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.autoRefresh.forEach(timer => clearInterval(timer));
    this.autoRefresh.clear();
    this.charts.forEach(({ chart }) => chart.remove());
    this.charts.clear();
    this.subscribers.clear();
    this.dataCache.clear();
  }
}

// Global instance
const starlit = new StarlitData();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => starlit.initStorage());
} else {
  starlit.initStorage();
}

// Expose for global access
window.starlit = starlit;
