"""
API router for 5-min fast prediction tracker with real-time HBAR chart.
"""

import os
import sqlite3
import sys
import time

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/fast", tags=["fast-predictions"])

# Lazy-import Hiero mirror node verifier (avoids import cycle)
_mirror_verifier = None

def _get_verifier():
    global _mirror_verifier
    if _mirror_verifier is None:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from hedera_proof.mirror_verifier import MirrorVerifier
        _mirror_verifier = MirrorVerifier()
    return _mirror_verifier

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


@router.get("/agents")
async def agent_stats():
    """Per-agent accuracy and adaptive weights."""
    conn = _get_db()
    if not conn:
        return {"agents": []}
    try:
        rows = conn.execute(
            "SELECT agent_name, weight, total_votes, correct_votes, accuracy FROM agent_weights ORDER BY accuracy DESC"
        ).fetchall()
        conn.close()
        return {"agents": [dict(r) for r in rows]}
    except Exception:
        conn.close()
        return {"agents": []}


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


@router.get("/patterns")
async def fast_patterns():
    """Recent pattern detections with accuracy breakdown."""
    conn = _get_db()
    if not conn:
        return {"patterns": []}
    # Recent predictions that had a pattern detected
    rows = conn.execute(
        "SELECT pattern, pattern_confidence, direction, correct, timestamp "
        "FROM fast_predictions WHERE pattern IS NOT NULL "
        "ORDER BY timestamp DESC LIMIT 50"
    ).fetchall()
    # Per-pattern accuracy
    pat_stats = conn.execute(
        "SELECT pattern, COUNT(*) as total, SUM(correct) as correct "
        "FROM fast_predictions WHERE pattern IS NOT NULL AND correct IS NOT NULL "
        "GROUP BY pattern"
    ).fetchall()
    conn.close()
    return {
        "recent": [dict(r) for r in rows],
        "stats": {r["pattern"]: {"total": r["total"], "correct": r["correct"], "accuracy": round(r["correct"] / max(r["total"], 1), 3)} for r in pat_stats},
    }


@router.get("/verify/{prediction_id}")
async def verify_prediction(prediction_id: int):
    """
    Verify a specific prediction against Hiero mirror node on-chain data.
    Uses the open-source Hiero Mirror Node REST API — no SDK required.
    """
    conn = _get_db()
    if not conn:
        return {"error": "No database — start scripts/fast_predictor.py"}

    row = conn.execute(
        "SELECT id, timestamp, direction, confidence, pattern, "
        "price_at_predict, correct, iso_time FROM fast_predictions WHERE id = ?",
        (prediction_id,)
    ).fetchone()
    conn.close()

    if not row:
        return {"error": "Prediction not found", "prediction_id": prediction_id}

    # Build a deterministic proof hash from prediction data
    import hashlib
    proof_payload = f"{row['timestamp']}:{row['direction']}:{row['confidence']}:{row['price_at_predict']}"
    proof_hash = hashlib.sha256(proof_payload.encode()).hexdigest()

    # Verify against Hiero mirror node (dry-run fallback if no topic configured)
    topic_id = os.environ.get("VERA_TASK_TOPIC_ID", "")
    if topic_id and topic_id != "dry_run":
        verifier = _get_verifier()
        result = verifier.verify_by_hash(
            proof_hash=proof_hash,
            topic_id=topic_id,
        )
        return {
            "prediction_id": prediction_id,
            "prediction": dict(row),
            "proof_hash": proof_hash,
            "on_chain_verified": result.verified,
            "consensus_timestamp": result.consensus_timestamp,
            "hashscan_url": result.hashscan_url,
            "mirror_node": verifier.stats()["mirror_nodes"][0] if verifier.stats()["mirror_nodes"] else None,
            "note": "Verified via Hiero Mirror Node REST API (Apache-2.0)",
        }

    return {
        "prediction_id": prediction_id,
        "prediction": dict(row),
        "proof_hash": proof_hash,
        "on_chain_verified": None,
        "note": "HCS topic not configured — proof computed but not emitted. Set VERA_TASK_TOPIC_ID to enable Hiero verification.",
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
<title>VNX Prediction Swarm — Real-Time HBAR</title>
<style>
:root{--bg:#04060b;--surface:#0a0f1a;--surface2:#0f1520;--border:#162032;--border-hi:#1e3a5f;--text:#e2e8f0;--muted:#5a6b82;--accent:#7c3aed;--accent2:#a78bfa;--cyan:#06b6d4;--green:#10b981;--red:#f43f5e;--yellow:#eab308;--orange:#f97316;--radius:14px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'SF Mono','JetBrains Mono','Fira Code',monospace;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes orbit{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes slideR{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes blink{0%,50%,100%{opacity:1}25%,75%{opacity:.5}}
@keyframes swarmPulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,.3)}50%{box-shadow:0 0 0 8px rgba(124,58,237,0)}}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;background:rgba(4,6,11,.92);backdrop-filter:blur(16px)}
.brand{display:flex;align-items:center;gap:10px}
.swarm-icon{width:28px;height:28px;position:relative}
.swarm-icon .core{width:10px;height:10px;background:var(--accent);border-radius:50%;position:absolute;top:9px;left:9px;animation:swarmPulse 2s infinite}
.swarm-icon .ring{width:28px;height:28px;border:1.5px solid var(--accent2);border-radius:50%;border-top-color:transparent;animation:orbit 3s linear infinite;position:absolute}
.swarm-icon .ring2{width:20px;height:20px;border:1px solid var(--cyan);border-radius:50%;border-bottom-color:transparent;animation:orbit 2s linear infinite reverse;position:absolute;top:4px;left:4px}
.brand h1{font-size:15px;font-weight:700;letter-spacing:-.2px;font-family:'Inter',-apple-system,sans-serif}
.brand h1 em{font-style:normal;color:var(--accent2);font-weight:800}
.brand h1 .dim{color:var(--muted);font-weight:400}
.status-pills{display:flex;gap:6px;margin-left:12px}
.s-pill{font-size:8px;padding:3px 8px;border-radius:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase}
.s-pill.live{background:rgba(16,185,129,.15);color:var(--green);border:1px solid rgba(16,185,129,.3)}
.s-pill.swarm{background:rgba(124,58,237,.12);color:var(--accent2);border:1px solid rgba(124,58,237,.3)}
.nav{display:flex;gap:6px}
.nav a{color:var(--muted);text-decoration:none;font-size:10px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;transition:all .2s;font-family:inherit}
.nav a:hover{color:var(--cyan);border-color:var(--cyan)}

.layout{display:grid;grid-template-columns:1fr 300px;grid-template-rows:auto 1fr auto;gap:0;min-height:calc(100vh - 48px)}
@media(max-width:960px){.layout{grid-template-columns:1fr;grid-template-rows:auto auto 1fr auto}}

.consensus-bar{grid-column:1/-1;display:flex;align-items:center;gap:16px;padding:14px 24px;border-bottom:1px solid var(--border);background:var(--surface)}
.consensus-signal{display:flex;align-items:center;gap:12px}
.dir-badge{font-size:28px;font-weight:900;letter-spacing:-1px;padding:6px 16px;border-radius:10px;font-family:'Inter',sans-serif}
.dir-badge.up{color:var(--green);background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2)}
.dir-badge.down{color:var(--red);background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.2)}
.consensus-meta{flex:1}
.consensus-meta .price{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;font-family:'Inter',sans-serif}
.consensus-meta .desc{font-size:10px;color:var(--muted);margin-top:2px}
.consensus-right{display:flex;align-items:center;gap:20px}
.conf-block{text-align:center}
.conf-block .val{font-size:24px;font-weight:800;color:var(--accent2);font-family:'Inter',sans-serif}
.conf-block .lbl{font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:1px}
.cd-ring{position:relative;width:40px;height:40px}
.cd-ring svg{transform:rotate(-90deg)}
.cd-ring .txt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--muted)}

.agents-bar{grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:8px 24px;border-bottom:1px solid var(--border);background:var(--surface2);overflow-x:auto}
.agent-chip{display:flex;align-items:center;gap:6px;padding:5px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:9px;white-space:nowrap;transition:all .2s}
.agent-chip:hover{border-color:var(--accent);transform:translateY(-1px)}
.agent-chip .dot{width:6px;height:6px;border-radius:50%}
.agent-chip .dot.on{background:var(--green);animation:pulse 2s infinite}
.agent-chip .name{color:var(--text);font-weight:600}
.agent-chip .role{color:var(--muted)}

.center{padding:16px 24px;display:flex;flex-direction:column;gap:14px;min-width:0}
.sidebar{border-left:1px solid var(--border);padding:16px;display:flex;flex-direction:column;gap:12px;background:var(--surface2);overflow-y:auto}

.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.metric{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;transition:all .3s}
.metric:hover{border-color:var(--border-hi);transform:translateY(-1px)}
.metric .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2;font-family:'Inter',sans-serif}
.metric .v.g{color:var(--green)}.metric .v.r{color:var(--red)}.metric .v.y{color:var(--yellow)}.metric .v.c{color:var(--cyan)}.metric .v.p{color:var(--accent2)}
.metric .k{font-size:8px;text-transform:uppercase;color:var(--muted);letter-spacing:.4px;margin-top:3px}

.chart-panel{flex:1;min-height:220px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;position:relative}
.chart-panel .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.chart-panel .hdr span{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.chart-panel .hdr .live-i{color:var(--green);display:flex;align-items:center;gap:4px}
.chart-panel .hdr .live-i::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--green);animation:pulse 1.5s infinite}
canvas{width:100%!important;display:block;border-radius:6px}

.sec-title{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600}

.streak-wrap{display:flex;gap:3px;flex-wrap:wrap}
.sd{width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;transition:transform .15s}
.sd:hover{transform:scale(1.3)}
.sd.g{background:rgba(16,185,129,.12);color:var(--green);border:1px solid rgba(16,185,129,.25)}
.sd.r{background:rgba(244,63,94,.1);color:var(--red);border:1px solid rgba(244,63,94,.2)}

.log-list{flex:1;overflow-y:auto;display:flex;flex-direction:column}
.log-item{display:grid;grid-template-columns:44px 1fr 36px 42px;gap:4px;padding:7px 8px;border-bottom:1px solid var(--border);font-size:10px;align-items:center;animation:slideR .25s}
.log-item:hover{background:rgba(124,58,237,.03)}
.log-item .t{color:var(--muted);font-size:9px}
.log-item .px{font-weight:600;font-variant-numeric:tabular-nums}
.log-item .d{font-weight:800;font-size:11px}
.log-item .d.up{color:var(--green)}.log-item .d.down{color:var(--red)}
.log-item .b{padding:2px 5px;border-radius:3px;font-size:8px;font-weight:700;text-align:center}
.log-item .b.hit{background:rgba(16,185,129,.1);color:var(--green)}
.log-item .b.miss{background:rgba(244,63,94,.1);color:var(--red)}
.log-item .b.wait{background:rgba(99,102,241,.08);color:var(--accent2)}

.swarm-panel{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
.swarm-panel .row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:9px}
.swarm-panel .row .k{color:var(--muted)}
.swarm-panel .row .v{color:var(--text);font-weight:600}
.swarm-panel .row .v.hi{color:var(--accent2)}
.swarm-panel .row .v.cy{color:var(--cyan)}
</style>
</head>
<body>
<div class="topbar">
  <div class="brand">
    <div class="swarm-icon"><div class="ring"></div><div class="ring2"></div><div class="core"></div></div>
    <h1><em>VNX</em> Prediction Swarm <span class="dim">// HBAR</span></h1>
    <div class="status-pills">
      <span class="s-pill live">LIVE</span>
      <span class="s-pill swarm">SWARM ACTIVE</span>
    </div>
  </div>
  <div class="nav">
    <a href="/predictions/dashboard">1h Mode</a>
    <a href="/monitoring">Layers</a>
    <a href="/docs">API</a>
  </div>
</div>

<div class="layout">
  <div class="consensus-bar">
    <div class="consensus-signal">
      <div class="dir-badge up" id="sig-dir">--</div>
      <div class="consensus-meta">
        <div class="price" id="sig-price">$0.00000</div>
        <div class="desc" id="sig-desc">Swarm consensus loading...</div>
      </div>
    </div>
    <div class="consensus-right">
      <div class="conf-block"><div class="val" id="sig-conf">--%</div><div class="lbl">Consensus</div></div>
      <div class="cd-ring">
        <svg width="40" height="40"><circle cx="20" cy="20" r="16" fill="none" stroke="#162032" stroke-width="2.5"/><circle id="cd-arc" cx="20" cy="20" r="16" fill="none" stroke="#7c3aed" stroke-width="2.5" stroke-dasharray="100.5" stroke-dashoffset="0" stroke-linecap="round"/></svg>
        <div class="txt" id="cd-time">5:00</div>
      </div>
    </div>
  </div>

  <div class="agents-bar" id="agents">
    <div class="agent-chip"><div class="dot on"></div><span class="name">BitLattice-ONNX</span><span class="role">primary</span></div>
    <div class="agent-chip"><div class="dot on"></div><span class="name">RSI-Agent</span><span class="role">momentum</span></div>
    <div class="agent-chip"><div class="dot on"></div><span class="name">BB-Agent</span><span class="role">volatility</span></div>
    <div class="agent-chip"><div class="dot on"></div><span class="name">SMA-Cross</span><span class="role">trend</span></div>
    <div class="agent-chip"><div class="dot on"></div><span class="name">Volume-Flow</span><span class="role">liquidity</span></div>
    <div class="agent-chip"><div class="dot on"></div><span class="name">Price-Action</span><span class="role">structure</span></div>
    <div class="agent-chip" id="pat-chip"><div class="dot on"></div><span class="name">Pattern-Recog</span><span class="role">chart</span></div>
  </div>

  <div class="center">
    <div class="metrics" id="metrics"></div>
    <div class="chart-panel">
      <div class="hdr"><span>HBAR/USD Price + Swarm Signals</span><span class="live-i">streaming</span></div>
      <canvas id="chart" height="220"></canvas>
    </div>
  </div>

  <div class="sidebar">
    <div class="sec-title">Swarm Accuracy</div>
    <div class="streak-wrap" id="streak"></div>

    <div class="sec-title" style="margin-top:6px">Signal Log</div>
    <div class="log-list" id="preds"></div>

    <div class="swarm-panel">
      <div class="row"><span class="k">Engine</span><span class="v hi">ONNX Runtime (GPU)</span></div>
      <div class="row"><span class="k">Model</span><span class="v">VNX BitLattice v3</span></div>
      <div class="row"><span class="k">Agents</span><span class="v cy">7 active</span></div>
      <div class="row"><span class="k">Latency</span><span class="v" id="latency">--</span></div>
      <div class="row"><span class="k">Consensus</span><span class="v">Weighted majority</span></div>
      <div class="row"><span class="k">Chain</span><span class="v cy">Hedera HCS-20</span></div>
      <div class="row"><span class="k">Cycle</span><span class="v">5 min</span></div>
      <div class="row"><span class="k">Data</span><span class="v">CoinGecko RT</span></div>
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
    var totalPreds = (acc.total_scored||0) + (acc.pending||0);

    // Consensus signal
    var dirEl = document.getElementById('sig-dir');
    dirEl.textContent = pred.direction || '--';
    dirEl.className = 'dir-badge ' + (pred.direction === 'UP' ? 'up' : 'down');
    document.getElementById('sig-price').textContent = '$' + price.toFixed(5);
    var agentCount = 7;
    var agreeing = Math.round(agentCount * (pred.confidence || 0.5));
    var patText = pred.pattern ? ' | ' + pred.pattern.replace(/_/g,' ') : '';
    document.getElementById('sig-desc').textContent = agreeing + '/' + agentCount + ' agents agree' + patText + ' | Next signal in countdown';
    // Pattern chip highlight
    var patChip = document.getElementById('pat-chip');
    if (pred.pattern) { patChip.style.borderColor = '#f97316'; patChip.querySelector('.dot').style.background = '#f97316'; }
    else { patChip.style.borderColor = 'var(--border)'; patChip.querySelector('.dot').style.background = ''; }
    document.getElementById('sig-conf').textContent = ((pred.confidence || 0) * 100).toFixed(0) + '%';

    // Countdown
    if (pred.timestamp) lastPredTime = pred.timestamp;

    // Metrics row
    document.getElementById('metrics').innerHTML =
      '<div class="metric"><div class="v ' + accCls(acc.accuracy||0) + '">' + ((acc.accuracy||0)*100).toFixed(1) + '%</div><div class="k">Swarm Acc</div></div>' +
      '<div class="metric"><div class="v ' + accCls(acc.rolling_10||0) + '">' + ((acc.rolling_10||0)*100).toFixed(0) + '%</div><div class="k">Last 10</div></div>' +
      '<div class="metric"><div class="v ' + accCls(acc.rolling_50||0) + '">' + ((acc.rolling_50||0)*100).toFixed(0) + '%</div><div class="k">Last 50</div></div>' +
      '<div class="metric"><div class="v c">' + totalPreds + '</div><div class="k">Signals</div></div>' +
      '<div class="metric"><div class="v p">' + (pred.inference_ms || 0).toFixed(1) + 'ms</div><div class="k">Latency</div></div>';

    // Streak
    var streak = acc.streak || [];
    if (streak.length > 0) {
      document.getElementById('streak').innerHTML = streak.map(function(v,i) {
        return '<div class="sd ' + (v?'g':'r') + '">' + (v?'+':'-') + '</div>';
      }).join('');
    } else {
      document.getElementById('streak').innerHTML = '<span style="color:var(--muted);font-size:9px">Swarm scoring begins after first 5m cycle</span>';
    }

    // Chart
    drawChart(pr.prices || [], pd.predictions || []);

    // Signal log
    var preds = pd.predictions || [];
    var html = '';
    for (var i = 0; i < Math.min(preds.length, 25); i++) {
      var p = preds[i];
      var t = p.iso_time ? p.iso_time.slice(11,16) : '--';
      var badge = p.correct === null || p.correct === undefined ? 'wait' : (p.correct ? 'hit' : 'miss');
      var patBadge = p.pattern ? '<span style="color:#f97316;font-size:7px;margin-left:3px">' + p.pattern.replace(/_/g,' ') + '</span>' : '';
      html += '<div class="log-item">' +
        '<div class="t">' + t + '</div>' +
        '<div class="px">$' + p.price_at_predict.toFixed(4) + patBadge + '</div>' +
        '<div class="d ' + (p.direction==='UP'?'up':'down') + '">' + p.direction + '</div>' +
        '<div class="b ' + badge + '">' + badge + '</div>' +
        '</div>';
    }
    document.getElementById('preds').innerHTML = html || '<div style="color:var(--muted);font-size:9px;padding:8px">Awaiting first swarm signal...</div>';

    // Latency in panel
    document.getElementById('latency').textContent = (pred.inference_ms || 0).toFixed(2) + 'ms';

  } catch(e) {
    console.error('Swarm load error:', e);
  }
}

// Countdown ring
function updateCountdown() {
  if (!lastPredTime) return;
  var elapsed = Date.now()/1000 - lastPredTime;
  var remaining = Math.max(0, 300 - elapsed);
  var min = Math.floor(remaining / 60);
  var sec = Math.floor(remaining % 60);
  document.getElementById('cd-time').textContent = min + ':' + (sec < 10 ? '0' : '') + sec;
  var pct = Math.min(1, elapsed / 300);
  var offset = 100.5 * (1 - pct);
  document.getElementById('cd-arc').setAttribute('stroke-dashoffset', Math.max(0, offset));
  // Color shift as countdown approaches 0
  var arc = document.getElementById('cd-arc');
  if (remaining < 30) arc.setAttribute('stroke', '#10b981');
  else if (remaining < 60) arc.setAttribute('stroke', '#06b6d4');
  else arc.setAttribute('stroke', '#7c3aed');
}

setInterval(load, 6000);
setInterval(updateCountdown, 1000);
load();
</script>
</body>
</html>"""
