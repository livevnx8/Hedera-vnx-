---
description: Live web dashboard for Vera rig status
---

# Build Dashboard UI

Real-time web dashboard at `http://localhost:8088/dashboard`.

## Quick Dashboard

```bash
// turbo
mkdir -p /home/vera-live-0-1/hedera-llm-api/public

cat > /home/vera-live-0-1/hedera-llm-api/public/dashboard.html << 'HTML'
<!DOCTYPE html>
<html>
<head>
<title>🌸 Vera Rig Dashboard</title>
<style>
body { font-family: monospace; background: #0a0e1a; color: #a0ffb0; padding: 2em; }
h1 { color: #ff6b9d; }
.card { background: #1a1e2e; border: 1px solid #2a3e4e; border-radius: 8px; padding: 1em; margin: 1em 0; }
.metric { display: flex; justify-content: space-between; padding: 0.5em 0; }
.good { color: #50ff80; }
.warn { color: #ffcc50; }
.critical { color: #ff5050; }
.bar { height: 8px; background: #2a3e4e; border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; transition: width 0.5s; }
</style>
</head>
<body>
<h1>🌸 Vera Flower of Life — Live Dashboard</h1>
<div id="timestamp"></div>

<div class="card">
  <h2>📊 System</h2>
  <div id="system"></div>
</div>

<div class="card">
  <h2>🤖 Vera Process</h2>
  <div id="vera"></div>
</div>

<div class="card">
  <h2>🌸 Lattice</h2>
  <div id="lattice"></div>
</div>

<div class="card">
  <h2>🔗 HCS Topics</h2>
  <div id="hcs"></div>
</div>

<div class="card">
  <h2>🎮 GPU</h2>
  <div id="gpu"></div>
</div>

<script>
async function update() {
  const r = await fetch('/api/dashboard/full').then(r => r.json()).catch(() => null);
  if (!r) return;
  
  document.getElementById('timestamp').textContent = new Date().toISOString();
  
  const render = (el, data) => {
    document.getElementById(el).innerHTML = Object.entries(data).map(([k,v]) => {
      const cls = typeof v === 'object' && v.status ? v.status : 'good';
      const val = typeof v === 'object' ? v.value : v;
      return `<div class="metric"><span>${k}</span><span class="${cls}">${val}</span></div>`;
    }).join('');
  };
  
  render('system', r.system);
  render('vera', r.vera);
  render('lattice', r.lattice);
  render('hcs', r.hcs);
  render('gpu', r.gpu || { status: 'N/A' });
}

update();
setInterval(update, 5000);
</script>
</body>
</html>
HTML
```

## Backend API

```bash
// turbo
cat > src/routes/dashboard.ts << 'EOF'
import { Router } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';

export const dashboardRouter = Router();

function sh(cmd: string): string {
  try { return execSync(cmd, { timeout: 5000 }).toString().trim(); }
  catch { return ''; }
}

dashboardRouter.get('/full', (req, res) => {
  const diskUsage = parseInt(sh("df / | awk 'NR==2 {print $5}'").replace('%',''));
  const memUsage = parseInt(sh("free | awk '/Mem:/ {printf \"%.0f\", $3/$2*100}'"));
  const cpuUsage = parseFloat(sh("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"));
  const veraPid = sh("pgrep -f 'node.*PORT=8088' | head -1");
  const latticeFiles = sh("find /mnt/vera-mirror-shards/vera-lattice -type f | wc -l");
  const gpuTemp = sh("nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits | head -1");
  const gpuUtil = sh("nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits | head -1");
  
  res.json({
    system: {
      cpu: { value: `${cpuUsage}%`, status: cpuUsage > 80 ? 'warn' : 'good' },
      memory: { value: `${memUsage}%`, status: memUsage > 80 ? 'warn' : 'good' },
      disk: { value: `${diskUsage}%`, status: diskUsage > 80 ? 'critical' : 'good' }
    },
    vera: {
      status: veraPid ? { value: `Running (PID ${veraPid})`, status: 'good' } 
                     : { value: 'Not Running', status: 'critical' }
    },
    lattice: {
      files: latticeFiles,
      status: { value: 'Active', status: 'good' }
    },
    hcs: {
      carbon: '0.0.10416187',
      registry: '0.0.10416178',
      task: '0.0.10414500'
    },
    gpu: gpuTemp ? {
      temperature: { value: `${gpuTemp}°C`, status: parseInt(gpuTemp) > 85 ? 'critical' : 'good' },
      utilization: `${gpuUtil}%`
    } : null
  });
});
EOF
```

## Register Route

```bash
# Add to src/server.ts:
# import { dashboardRouter } from './routes/dashboard.js';
# app.use('/api/dashboard', dashboardRouter);
# app.use('/dashboard', express.static('public'));
```

## Access

```
http://localhost:8088/dashboard
```
