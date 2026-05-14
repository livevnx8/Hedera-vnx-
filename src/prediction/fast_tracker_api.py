"""
API router for 5-min fast prediction tracker with real-time HBAR chart.
"""

import os
import sqlite3
import time

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/fast", tags=["fast-predictions"])

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "fast_predictions.db")


def _get_db():
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/prices")
async def price_ticks(minutes: int = Query(60, le=1440)):
    """Get price ticks for chart (last N minutes)."""
    conn = _get_db()
    if not conn:
        return {"prices": []}
    cutoff = time.time() - (minutes * 60)
    rows = conn.execute(
        "SELECT timestamp, price FROM price_ticks WHERE timestamp > ? ORDER BY timestamp ASC",
        (cutoff,),
    ).fetchall()
    conn.close()
    return {"prices": [{"t": r["timestamp"], "p": r["price"]} for r in rows]}


@router.get("/predictions")
async def fast_predictions(limit: int = Query(50, le=500)):
    """Recent 5-min predictions."""
    conn = _get_db()
    if not conn:
        return {"predictions": []}
    rows = conn.execute(
        "SELECT * FROM fast_predictions ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return {"predictions": [dict(r) for r in rows]}


@router.get("/accuracy")
async def fast_accuracy():
    """Fast prediction accuracy stats."""
    conn = _get_db()
    if not conn:
        return {"message": "No data yet — start scripts/fast_predictor.py"}

    total = conn.execute("SELECT COUNT(*) FROM fast_predictions WHERE correct IS NOT NULL").fetchone()[0]
    correct = conn.execute("SELECT COUNT(*) FROM fast_predictions WHERE correct = 1").fetchone()[0]
    pending = conn.execute("SELECT COUNT(*) FROM fast_predictions WHERE correct IS NULL").fetchone()[0]

    # Rolling accuracy
    r10 = conn.execute(
        "SELECT correct FROM fast_predictions WHERE correct IS NOT NULL ORDER BY timestamp DESC LIMIT 10"
    ).fetchall()
    r50 = conn.execute(
        "SELECT correct FROM fast_predictions WHERE correct IS NOT NULL ORDER BY timestamp DESC LIMIT 50"
    ).fetchall()

    # Last prediction
    last = conn.execute("SELECT * FROM fast_predictions ORDER BY timestamp DESC LIMIT 1").fetchone()

    # Last price
    last_price = conn.execute("SELECT price, timestamp FROM price_ticks ORDER BY timestamp DESC LIMIT 1").fetchone()

    conn.close()
    return {
        "total_scored": total,
        "total_correct": correct,
        "accuracy": round(correct / max(total, 1), 4),
        "pending": pending,
        "rolling_10": round(sum(r[0] for r in r10) / max(len(r10), 1), 4) if r10 else 0,
        "rolling_50": round(sum(r[0] for r in r50) / max(len(r50), 1), 4) if r50 else 0,
        "streak": [r[0] for r in r10],
        "last_prediction": dict(last) if last else None,
        "last_price": {"price": last_price["price"], "timestamp": last_price["timestamp"]} if last_price else None,
    }


@router.get("/dashboard", response_class=HTMLResponse)
async def fast_dashboard():
    """Real-time HBAR prediction tracker with live chart."""
    return HTMLResponse(content=DASHBOARD_HTML)


DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vera OS — Live HBAR Intelligence</title>
<style>
:root{--bg:#06080f;--surface:#0d1117;--border:#1b2332;--border-glow:#6366f133;--text:#e2e8f0;--muted:#64748b;--accent:#6366f1;--green:#10b981;--red:#f43f5e;--yellow:#f59e0b;--radius:14px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes glow{0%,100%{box-shadow:0 0 4px var(--accent)}50%{box-shadow:0 0 16px var(--accent)}}
@keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 28px;border-bottom:1px solid var(--border);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;background:rgba(6,8,15,.85)}
.brand{display:flex;align-items:center;gap:12px}
.brand .live{width:10px;height:10px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
.brand h1{font-size:17px;font-weight:700;letter-spacing:-.3px}
.brand h1 em{font-style:normal;color:var(--accent);font-weight:800}
.brand .tag{font-size:9px;background:var(--accent);color:#fff;padding:2px 7px;border-radius:20px;font-weight:600;letter-spacing:.3px;margin-left:8px}
.nav{display:flex;gap:8px}
.nav a{color:var(--muted);text-decoration:none;font-size:11px;padding:5px 12px;border:1px solid var(--border);border-radius:8px;transition:all .2s}
.nav a:hover{color:var(--accent);border-color:var(--accent)}

.main{display:grid;grid-template-columns:1fr 320px;gap:0;min-height:calc(100vh - 52px)}
@media(max-width:900px){.main{grid-template-columns:1fr}}

.left{padding:20px 24px;display:flex;flex-direction:column;gap:16px}
.right{border-left:1px solid var(--border);padding:20px;display:flex;flex-direction:column;gap:16px;background:rgba(13,17,23,.5)}

.signal-banner{display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);animation:fadeIn .4s}
.signal-dir{font-size:36px;font-weight:800;letter-spacing:-1px;font-variant-numeric:tabular-nums}
.signal-dir.up{color:var(--green)}.signal-dir.down{color:var(--red)}
.signal-meta{flex:1}
.signal-meta .price{font-size:22px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums}
.signal-meta .sub{font-size:11px;color:var(--muted);margin-top:2px}
.signal-conf{text-align:right}
.signal-conf .pct{font-size:28px;font-weight:700;color:var(--accent)}
.signal-conf .lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.countdown-ring{position:relative;width:44px;height:44px}
.countdown-ring svg{transform:rotate(-90deg)}
.countdown-ring .time{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--muted)}

.chart-container{flex:1;min-height:240px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;position:relative}
.chart-container .title{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.chart-container .title .live-tag{font-size:9px;color:var(--green);display:flex;align-items:center;gap:4px}
.chart-container .title .live-tag::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 1.5s infinite}
canvas{width:100%!important;height:100%!important;display:block;border-radius:8px}

.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.stat-pill{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;transition:border-color .3s}
.stat-pill:hover{border-color:var(--border-glow)}
.stat-pill .n{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2}
.stat-pill .n.g{color:var(--green)}.stat-pill .n.r{color:var(--red)}.stat-pill .n.y{color:var(--yellow)}.stat-pill .n.b{color:var(--accent)}
.stat-pill .l{font-size:9px;text-transform:uppercase;color:var(--muted);letter-spacing:.4px;margin-top:4px}

.section-title{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:0 4px}

.streak-wrap{display:flex;gap:4px;flex-wrap:wrap}
.s-dot{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;transition:transform .2s}
.s-dot:hover{transform:scale(1.2)}
.s-dot.g{background:rgba(16,185,129,.15);color:var(--green);border:1px solid rgba(16,185,129,.3)}
.s-dot.r{background:rgba(244,63,94,.12);color:var(--red);border:1px solid rgba(244,63,94,.25)}

.pred-table{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:0}
.pred-item{display:grid;grid-template-columns:52px 1fr 44px 50px;gap:6px;padding:9px 10px;border-bottom:1px solid var(--border);font-size:11px;align-items:center;animation:slideIn .3s;transition:background .2s}
.pred-item:hover{background:rgba(99,102,241,.04)}
.pred-item .time{color:var(--muted);font-variant-numeric:tabular-nums;font-size:10px}
.pred-item .price-col{display:flex;flex-direction:column;gap:1px}
.pred-item .price-col .p{font-weight:600;font-variant-numeric:tabular-nums}
.pred-item .price-col .chg{font-size:9px}
.pred-item .dir{font-weight:700;font-size:12px}
.pred-item .dir.up{color:var(--green)}.pred-item .dir.down{color:var(--red)}
.pred-item .badge{padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;text-align:center}
.pred-item .badge.correct{background:rgba(16,185,129,.12);color:var(--green)}
.pred-item .badge.wrong{background:rgba(244,63,94,.12);color:var(--red)}
.pred-item .badge.pending{background:rgba(99,102,241,.1);color:var(--accent)}

.tech-stack{padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;font-size:10px;color:var(--muted);line-height:1.8}
.tech-stack .row{display:flex;justify-content:space-between;align-items:center}
.tech-stack .val{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.tech-stack .highlight{color:var(--accent)}
</style>
</head>
<body>
<div class="topbar">
  <div class="brand">
    <div class="live"></div>
    <h1><em>Vera</em> Intelligence</h1>
    <span class="tag">LIVE</span>
  </div>
  <div class="nav">
    <a href="/predictions/dashboard">Hourly</a>
    <a href="/monitoring">System</a>
    <a href="/docs">API</a>
  </div>
</div>

<div class="main">
  <div class="left">
    <div class="signal-banner" id="signal">
      <div class="signal-dir up" id="sig-dir">--</div>
      <div class="signal-meta">
        <div class="price" id="sig-price">$0.0000</div>
        <div class="sub" id="sig-sub">Loading...</div>
      </div>
      <div class="signal-conf">
        <div class="pct" id="sig-conf">--%</div>
        <div class="lbl">Confidence</div>
      </div>
      <div class="countdown-ring" id="cd-ring">
        <svg width="44" height="44"><circle cx="22" cy="22" r="18" fill="none" stroke="#1e293b" stroke-width="3"/><circle id="cd-arc" cx="22" cy="22" r="18" fill="none" stroke="#6366f1" stroke-width="3" stroke-dasharray="113" stroke-dashoffset="0" stroke-linecap="round"/></svg>
        <div class="time" id="cd-time">5:00</div>
      </div>
    </div>

    <div class="stats-row" id="stats"></div>

    <div class="chart-container">
      <div class="title">
        <span>HBAR / USD</span>
        <span class="live-tag">Real-Time</span>
      </div>
      <canvas id="chart"></canvas>
    </div>
  </div>

  <div class="right">
    <div class="section-title">Accuracy Streak</div>
    <div class="streak-wrap" id="streak"></div>

    <div class="section-title" style="margin-top:8px">Prediction Log</div>
    <div class="pred-table" id="preds"></div>

    <div class="tech-stack" id="tech">
      <div class="row"><span>Inference</span><span class="val highlight">ONNX Runtime</span></div>
      <div class="row"><span>Model</span><span class="val">VNX BitLattice v3</span></div>
      <div class="row"><span>Latency</span><span class="val" id="latency">--</span></div>
      <div class="row"><span>Chain</span><span class="val">Hedera HCS</span></div>
      <div class="row"><span>Cycle</span><span class="val">5 min</span></div>
      <div class="row"><span>Provider</span><span class="val" id="provider">CPU</span></div>
    </div>
  </div>
</div>

<script>
var canvas = document.getElementById('chart');
var ctx = canvas.getContext('2d');
var lastPredTime = 0;

function resize() {
  var box = canvas.parentElement;
  canvas.width = box.clientWidth - 32;
  canvas.height = box.clientHeight - 40;
}
resize();
window.addEventListener('resize', resize);

function drawChart(prices, predictions) {
  resize();
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!prices || prices.length < 2) {
    ctx.fillStyle = '#374151'; ctx.font = '12px sans-serif';
    ctx.fillText('Collecting price data...', w/2 - 70, h/2);
    return;
  }
  var ps = prices.map(function(p){return p.p});
  var mn = Math.min.apply(null, ps), mx = Math.max.apply(null, ps);
  var rng = mx - mn || 0.00001; var pad = rng * 0.15;
  mn -= pad; mx += pad; rng = mx - mn;
  var t0 = prices[0].t, t1 = prices[prices.length-1].t, tR = t1 - t0 || 1;

  // Subtle grid
  ctx.strokeStyle = '#1a2233'; ctx.lineWidth = 1;
  for (var i = 0; i <= 5; i++) {
    var gy = Math.round(h * i / 5) + 0.5;
    ctx.beginPath(); ctx.moveTo(40, gy); ctx.lineTo(w, gy); ctx.stroke();
    ctx.fillStyle = '#4b5563'; ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText((mx - rng * i / 5).toFixed(5), 38, gy + 3);
  }
  ctx.textAlign = 'left';

  // Smooth price line with glow
  ctx.save();
  ctx.shadowColor = 'rgba(99,102,241,.4)'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (var i = 0; i < prices.length; i++) {
    var x = 40 + ((prices[i].t - t0) / tR) * (w - 44);
    var y = h - ((prices[i].p - mn) / rng) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Gradient fill
  var lx = 40 + ((t1 - t0) / tR) * (w - 44);
  var ly = h - ((ps[ps.length-1] - mn) / rng) * h;
  ctx.lineTo(lx, h); ctx.lineTo(40, h); ctx.closePath();
  var grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(99,102,241,.12)'); grd.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = grd; ctx.fill();

  // Live price dot
  ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#a5b4fc'; ctx.fill();
  ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(165,180,252,.4)'; ctx.lineWidth = 2; ctx.stroke();

  // Prediction markers
  if (predictions) {
    predictions.forEach(function(pred) {
      if (pred.timestamp >= t0 && pred.timestamp <= t1) {
        var px = 40 + ((pred.timestamp - t0) / tR) * (w - 44);
        var py = h - ((pred.price_at_predict - mn) / rng) * h;
        var isUp = pred.direction === 'UP';
        var color = isUp ? '#10b981' : '#f43f5e';
        // Marker line
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = color + '44'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
        ctx.restore();
        // Triangle
        ctx.beginPath();
        if (isUp) {
          ctx.moveTo(px, py - 14); ctx.lineTo(px - 6, py - 4); ctx.lineTo(px + 6, py - 4);
        } else {
          ctx.moveTo(px, py + 14); ctx.lineTo(px - 6, py + 4); ctx.lineTo(px + 6, py + 4);
        }
        ctx.closePath(); ctx.fillStyle = color; ctx.fill();
        // Result ring
        if (pred.correct !== null && pred.correct !== undefined) {
          ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.strokeStyle = pred.correct ? '#10b981' : '#f43f5e'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    });
  }
}

function accCls(v) { return v >= 0.6 ? 'g' : v >= 0.5 ? 'y' : 'r'; }

async function load() {
  try {
    var [acc, pr, pd] = await Promise.all([
      fetch('/fast/accuracy').then(function(r){return r.json()}),
      fetch('/fast/prices?minutes=120').then(function(r){return r.json()}),
      fetch('/fast/predictions?limit=30').then(function(r){return r.json()})
    ]);

    var lp = acc.last_price || {};
    var pred = acc.last_prediction || {};
    var price = lp.price || 0;

    // Signal banner
    var dirEl = document.getElementById('sig-dir');
    dirEl.textContent = pred.direction || '--';
    dirEl.className = 'signal-dir ' + (pred.direction === 'UP' ? 'up' : 'down');
    document.getElementById('sig-price').textContent = '$' + price.toFixed(5);
    document.getElementById('sig-sub').textContent = 'HBAR/USD | Next 5m prediction';
    document.getElementById('sig-conf').textContent = ((pred.confidence || 0) * 100).toFixed(0) + '%';

    // Countdown to next prediction
    if (pred.timestamp) {
      lastPredTime = pred.timestamp;
    }

    // Stats row
    document.getElementById('stats').innerHTML =
      '<div class="stat-pill"><div class="n ' + accCls(acc.accuracy||0) + '">' + ((acc.accuracy||0)*100).toFixed(1) + '%</div><div class="l">Overall</div></div>' +
      '<div class="stat-pill"><div class="n ' + accCls(acc.rolling_10||0) + '">' + ((acc.rolling_10||0)*100).toFixed(0) + '%</div><div class="l">Last 10</div></div>' +
      '<div class="stat-pill"><div class="n ' + accCls(acc.rolling_50||0) + '">' + ((acc.rolling_50||0)*100).toFixed(0) + '%</div><div class="l">Last 50</div></div>' +
      '<div class="stat-pill"><div class="n b">' + ((acc.total_scored||0)+(acc.pending||0)) + '</div><div class="l">Predictions</div></div>';

    // Streak
    var streak = acc.streak || [];
    if (streak.length > 0) {
      document.getElementById('streak').innerHTML = streak.map(function(v,i) {
        return '<div class="s-dot ' + (v?'g':'r') + '" style="animation-delay:' + (i*30) + 'ms">' + (v?'+':'-') + '</div>';
      }).join('');
    } else {
      document.getElementById('streak').innerHTML = '<span style="color:#4b5563;font-size:11px">Scoring begins after first 5-min cycle</span>';
    }

    // Chart
    drawChart(pr.prices || [], pd.predictions || []);

    // Predictions list
    var preds = pd.predictions || [];
    var html = '';
    for (var i = 0; i < Math.min(preds.length, 20); i++) {
      var p = preds[i];
      var t = p.iso_time ? p.iso_time.slice(11,16) : '--';
      var chg = p.price_change_pct != null ? ((p.price_change_pct >= 0 ? '+' : '') + p.price_change_pct.toFixed(3) + '%') : '';
      var chgCls = p.price_change_pct > 0 ? 'up' : 'down';
      var badge = p.correct === null || p.correct === undefined ? 'pending' : (p.correct ? 'correct' : 'wrong');
      var badgeText = badge === 'pending' ? 'wait' : (badge === 'correct' ? 'hit' : 'miss');
      html += '<div class="pred-item">' +
        '<div class="time">' + t + '</div>' +
        '<div class="price-col"><div class="p">$' + p.price_at_predict.toFixed(4) + '</div><div class="chg ' + chgCls + '">' + chg + '</div></div>' +
        '<div class="dir ' + (p.direction==='UP'?'up':'down') + '">' + p.direction + '</div>' +
        '<div class="badge ' + badge + '">' + badgeText + '</div>' +
        '</div>';
    }
    document.getElementById('preds').innerHTML = html || '<div style="color:#4b5563;font-size:11px;padding:12px">No predictions yet</div>';

    // Tech stack
    document.getElementById('latency').textContent = (pred.inference_ms || 0).toFixed(2) + 'ms';

    document.getElementById('ts') && (document.getElementById('ts').textContent = new Date().toLocaleTimeString());
  } catch(e) {
    console.error(e);
  }
}

// Countdown ring animation
function updateCountdown() {
  if (!lastPredTime) return;
  var elapsed = Date.now()/1000 - lastPredTime;
  var remaining = Math.max(0, 300 - elapsed);
  var min = Math.floor(remaining / 60);
  var sec = Math.floor(remaining % 60);
  document.getElementById('cd-time').textContent = min + ':' + (sec < 10 ? '0' : '') + sec;
  var pct = elapsed / 300;
  var offset = 113 * (1 - pct);
  document.getElementById('cd-arc').setAttribute('stroke-dashoffset', Math.max(0, offset));
}

setInterval(load, 8000);
setInterval(updateCountdown, 1000);
load();
</script>
</body>
</html>"""
