"""
Vera OS v2.1 — Built-in Monitoring Dashboard
Serves a self-contained HTML page that polls /health and /metrics.
No external dependencies (Grafana/Prometheus) required.
"""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vera OS — Monitoring</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e17; color: #e0e6ed; }
  .header { padding: 20px 32px; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header h1 span { color: #6366f1; }
  .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
  .status-dot.ok { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
  .status-dot.degraded { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
  .status-dot.error { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; padding: 24px 32px; }
  .card { background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; }
  .card h2 { font-size: 14px; text-transform: uppercase; color: #6b7280; margin-bottom: 12px; letter-spacing: 0.5px; }
  .metric-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e293b22; }
  .metric-row:last-child { border-bottom: none; }
  .metric-name { color: #9ca3af; font-size: 13px; }
  .metric-value { font-weight: 600; font-size: 13px; font-variant-numeric: tabular-nums; }
  .metric-value.green { color: #22c55e; }
  .metric-value.yellow { color: #f59e0b; }
  .metric-value.red { color: #ef4444; }
  .layers-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .layer-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; }
  .layer-card .name { font-size: 12px; color: #6b7280; }
  .layer-card .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .refresh-bar { padding: 8px 32px; font-size: 11px; color: #4b5563; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  table th { text-align: left; font-size: 11px; color: #6b7280; padding: 6px 0; text-transform: uppercase; }
  table td { padding: 6px 0; font-size: 13px; border-top: 1px solid #1e293b22; }
  .sparkline { display: inline-block; height: 20px; }
</style>
</head>
<body>
<div class="header">
  <h1><span>Vera OS</span> Monitoring</h1>
  <div id="overall-status"><span class="status-dot"></span>Loading...</div>
</div>
<div class="refresh-bar">Auto-refresh: <span id="countdown">10</span>s | Last: <span id="last-update">—</span></div>

<div class="grid">
  <!-- System Overview -->
  <div class="card">
    <h2>System Overview</h2>
    <div id="system-metrics">Loading...</div>
  </div>

  <!-- 7 Layers -->
  <div class="card" style="grid-column: span 2">
    <h2>7-Layer Health</h2>
    <div id="layers" class="layers-grid">Loading...</div>
  </div>

  <!-- Proof Chain -->
  <div class="card">
    <h2>HCS Proof Chain</h2>
    <div id="proof-metrics">Loading...</div>
  </div>

  <!-- Services -->
  <div class="card">
    <h2>Services</h2>
    <div id="services">Loading...</div>
  </div>

  <!-- Prometheus Counters -->
  <div class="card" style="grid-column: span 2">
    <h2>Key Metrics (Prometheus)</h2>
    <div id="prom-metrics">Loading...</div>
  </div>
</div>

<script>
const REFRESH_INTERVAL = 10000;
let countdown = 10;

function statusClass(s) {
  if (s === 'ok' || s === 'healthy') return 'green';
  if (s === 'degraded' || s === 'warning') return 'yellow';
  return 'red';
}

function metricRow(name, value, cls) {
  return `<div class="metric-row"><span class="metric-name">${name}</span><span class="metric-value ${cls || ''}">${value}</span></div>`;
}

async function fetchHealth() {
  try {
    const res = await fetch('/health');
    const d = await res.json();

    // Overall
    const dotCls = d.status === 'ok' ? 'ok' : d.status === 'degraded' ? 'degraded' : 'error';
    document.getElementById('overall-status').innerHTML =
      `<span class="status-dot ${dotCls}"></span>${d.status.toUpperCase()} — v${d.version}`;

    // System
    const uptime = d.uptime_s >= 3600
      ? (d.uptime_s / 3600).toFixed(1) + 'h'
      : (d.uptime_s / 60).toFixed(0) + 'm';
    let sys = metricRow('Version', d.version, 'green');
    sys += metricRow('Uptime', uptime);
    sys += metricRow('Status', d.status, statusClass(d.status));
    document.getElementById('system-metrics').innerHTML = sys;

    // Layers
    if (d.layers) {
      let html = '';
      for (const [name, layer] of Object.entries(d.layers)) {
        const cls = statusClass(layer.status);
        let detail = '';
        if (layer.details) {
          const keys = Object.keys(layer.details).slice(0, 3);
          detail = keys.map(k => `${k}: ${JSON.stringify(layer.details[k])}`).join(', ');
        }
        html += `<div class="layer-card">
          <div class="name"><span class="status-dot ${cls}" style="width:8px;height:8px;"></span>L${layer.layer} ${name}</div>
          <div class="value ${cls}">${layer.status}</div>
          <div style="font-size:11px;color:#4b5563;margin-top:4px;">${detail}</div>
        </div>`;
      }
      document.getElementById('layers').innerHTML = html;
    }

    // Proof from layers
    if (d.layers && d.layers.live_proof_loop) {
      const p = d.layers.live_proof_loop.details || {};
      let html = metricRow('Mode', p.mode || '—');
      html += metricRow('Emitted', p.total_emitted || 0);
      html += metricRow('Errors', p.total_errors || 0, (p.total_errors || 0) > 0 ? 'red' : 'green');
      html += metricRow('Chain Length', p.chain_length || 0);
      document.getElementById('proof-metrics').innerHTML = html;
    }
  } catch (e) {
    document.getElementById('overall-status').innerHTML =
      '<span class="status-dot error"></span>API UNREACHABLE';
  }
}

async function fetchServices() {
  const services = [
    { name: 'Vera API (Python)', url: '/health', port: 8080 },
    { name: 'HCS Bridge (Node)', url: 'http://localhost:8001/health', port: 8001 },
  ];
  let html = '';
  for (const svc of services) {
    try {
      const r = await fetch(svc.url, { signal: AbortSignal.timeout(3000) });
      html += metricRow(svc.name, `:${svc.port} UP`, 'green');
    } catch {
      html += metricRow(svc.name, `:${svc.port} DOWN`, 'red');
    }
  }
  document.getElementById('services').innerHTML = html;
}

async function fetchPrometheus() {
  try {
    const res = await fetch('/metrics');
    const text = await res.text();
    const interesting = [
      'vera_proofs_emitted', 'vera_hcs_messages_total', 'vera_hcs_failures_total',
      'vera_predictions_total', 'vera_tasks_settled_total', 'vera_agent_executions_total',
      'vera_cache_hits_total', 'vera_cache_misses_total', 'vera_circuit_breaker_state',
      'vera_db_receipts_persisted_total', 'vera_uptime_seconds',
    ];
    let html = '<table><tr><th>Metric</th><th>Value</th></tr>';
    for (const line of text.split('\\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const parts = line.split(/\\s+/);
      if (parts.length >= 2) {
        const name = parts[0].replace(/\\{.*\\}/, '');
        const labels = parts[0].includes('{') ? parts[0].match(/\\{(.*)\\}/)?.[1] || '' : '';
        const val = parts[parts.length - 1];
        if (interesting.some(i => name.startsWith(i)) || parseFloat(val) > 0) {
          const display = labels ? `${name} (${labels})` : name;
          html += `<tr><td>${display.replace(/vera_/g, '')}</td><td class="metric-value">${val}</td></tr>`;
        }
      }
    }
    html += '</table>';
    document.getElementById('prom-metrics').innerHTML = html;
  } catch {
    document.getElementById('prom-metrics').innerHTML = 'Failed to fetch metrics';
  }
}

async function refresh() {
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
  await Promise.all([fetchHealth(), fetchServices(), fetchPrometheus()]);
  countdown = REFRESH_INTERVAL / 1000;
}

setInterval(() => {
  countdown--;
  document.getElementById('countdown').textContent = countdown;
  if (countdown <= 0) refresh();
}, 1000);

refresh();
</script>
</body>
</html>"""


@router.get("/monitoring", response_class=HTMLResponse)
async def monitoring_dashboard():
    """Built-in monitoring dashboard — no Grafana/Prometheus required."""
    return HTMLResponse(content=DASHBOARD_HTML)
