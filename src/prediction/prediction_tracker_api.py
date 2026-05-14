"""
API router for hourly prediction tracker — serves prediction history & accuracy.
"""

import json
import os
import sqlite3
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/predictions", tags=["predictions"])

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "predictions.db")


def _get_db():
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/history")
async def prediction_history(limit: int = Query(50, le=500)):
    """Recent predictions with accuracy scores."""
    conn = _get_db()
    if not conn:
        return {"predictions": [], "message": "No predictions yet — run scripts/hourly_predictor.py"}

    rows = conn.execute(
        "SELECT * FROM predictions ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return {"predictions": [dict(r) for r in rows]}


@router.get("/accuracy")
async def prediction_accuracy():
    """Overall accuracy statistics."""
    conn = _get_db()
    if not conn:
        return {"message": "No predictions yet"}

    stats = {}
    for horizon in ["1h", "24h"]:
        col = f"correct_{horizon}"
        total = conn.execute(f"SELECT COUNT(*) FROM predictions WHERE {col} IS NOT NULL").fetchone()[0]
        correct = conn.execute(f"SELECT COUNT(*) FROM predictions WHERE {col} = 1").fetchone()[0]
        stats[f"{horizon}_total"] = total
        stats[f"{horizon}_correct"] = correct
        stats[f"{horizon}_accuracy"] = round(correct / max(total, 1), 4)

    stats["total_predictions"] = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
    stats["unscored"] = conn.execute(
        "SELECT COUNT(*) FROM predictions WHERE correct_1h IS NULL"
    ).fetchone()[0]

    # Recent 10
    recent = conn.execute(
        "SELECT correct_1h FROM predictions WHERE correct_1h IS NOT NULL "
        "ORDER BY timestamp DESC LIMIT 10"
    ).fetchall()
    stats["recent_10"] = [r[0] for r in recent]
    stats["recent_10_accuracy"] = round(sum(stats["recent_10"]) / max(len(stats["recent_10"]), 1), 4)

    # Last prediction
    last = conn.execute("SELECT * FROM predictions ORDER BY timestamp DESC LIMIT 1").fetchone()
    if last:
        stats["last_prediction"] = dict(last)

    conn.close()
    return stats


@router.get("/dashboard", response_class=HTMLResponse)
async def predictions_dashboard():
    """Live prediction tracker dashboard."""
    return HTMLResponse(content=DASHBOARD_HTML)


DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vera OS — HBAR Prediction Tracker</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#0a0e17; color:#e0e6ed; }
  .header { padding:20px 32px; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; }
  .header h1 { font-size:20px; font-weight:600; }
  .header h1 span { color:#6366f1; }
  .subtitle { color:#6b7280; font-size:12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; padding:24px 32px; }
  .stat-card { background:#111827; border:1px solid #1e293b; border-radius:12px; padding:20px; text-align:center; }
  .stat-card .label { font-size:11px; text-transform:uppercase; color:#6b7280; margin-bottom:8px; letter-spacing:0.5px; }
  .stat-card .value { font-size:32px; font-weight:700; font-variant-numeric:tabular-nums; }
  .stat-card .value.green { color:#22c55e; }
  .stat-card .value.yellow { color:#f59e0b; }
  .stat-card .value.red { color:#ef4444; }
  .stat-card .value.blue { color:#6366f1; }
  .section { padding:0 32px 24px; }
  .section h2 { font-size:14px; text-transform:uppercase; color:#6b7280; margin-bottom:12px; letter-spacing:0.5px; }
  table { width:100%; border-collapse:collapse; background:#111827; border-radius:12px; overflow:hidden; }
  thead th { text-align:left; font-size:11px; color:#6b7280; padding:12px 16px; text-transform:uppercase; border-bottom:1px solid #1e293b; }
  tbody td { padding:10px 16px; font-size:13px; border-bottom:1px solid #1e293b22; font-variant-numeric:tabular-nums; }
  .up { color:#22c55e; } .down { color:#ef4444; }
  .correct { background:#22c55e22; color:#22c55e; padding:2px 8px; border-radius:4px; font-size:11px; }
  .wrong { background:#ef444422; color:#ef4444; padding:2px 8px; border-radius:4px; font-size:11px; }
  .pending { background:#6366f122; color:#6366f1; padding:2px 8px; border-radius:4px; font-size:11px; }
  .streak { display:flex; gap:4px; padding:8px 32px 16px; }
  .streak .dot { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; }
  .streak .dot.g { background:#22c55e33; color:#22c55e; } .streak .dot.r { background:#ef444433; color:#ef4444; }
  .refresh-bar { padding:8px 32px; font-size:11px; color:#4b5563; text-align:right; }
  a { color:#6366f1; text-decoration:none; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1><span>Vera OS</span> HBAR Prediction Tracker</h1>
    <div class="subtitle">VNX BitLattice Model — Hourly Predictions with Accuracy Tracking</div>
  </div>
  <div style="display:flex;gap:12px"><a href="/fast/dashboard">Fast 5-min</a> <a href="/monitoring">System</a></div>
</div>
<div class="refresh-bar">Auto-refresh: <span id="cd">30</span>s | <span id="ts">—</span></div>

<div class="grid" id="stats">Loading...</div>
<div class="section"><h2>Recent Streak (1h)</h2></div>
<div class="streak" id="streak"></div>
<div class="section">
  <h2>Prediction History</h2>
  <table>
    <thead><tr>
      <th>Time (UTC)</th><th>Price</th>
      <th>1h Pred</th><th>1h Conf</th><th>1h Actual</th><th>1h Result</th>
      <th>24h Pred</th><th>24h Conf</th><th>24h Actual</th><th>24h Result</th>
    </tr></thead>
    <tbody id="rows">Loading...</tbody>
  </table>
</div>

<script>
function accColor(v) { return v >= 0.6 ? 'green' : v >= 0.5 ? 'yellow' : 'red'; }
function dir(d) { return '<span class="' + (d==='UP'?'up':'down') + '">' + d + '</span>'; }
function badge(v) {
  if (v === null || v === undefined) return '<span class="pending">pending</span>';
  return v ? '<span class="correct">correct</span>' : '<span class="wrong">wrong</span>';
}
function pct(a, b) {
  if (a === null || a === undefined || !b) return '';
  return ((a - b) / b * 100).toFixed(2) + '%';
}

async function load() {
  try {
    const accResp = await fetch('/predictions/accuracy');
    const histResp = await fetch('/predictions/history?limit=100');

    if (!accResp.ok || !histResp.ok) {
      document.getElementById('stats').innerHTML = '<div class="stat-card"><div class="label">Status</div><div class="value red">API Error</div></div>';
      return;
    }

    const acc = await accResp.json();
    const hist = await histResp.json();

    var a1 = acc['1h_accuracy'] || 0;
    var a24 = acc['24h_accuracy'] || 0;
    var lp = acc.last_prediction || {};
    var lpPrice = lp.price_at_predict || 0;
    var lpConf = lp.confidence_1h || 0;

    document.getElementById('stats').innerHTML =
      '<div class="stat-card"><div class="label">1h Accuracy</div><div class="value ' + accColor(a1) + '">' + (a1*100).toFixed(1) + '%</div><div class="subtitle">' + (acc['1h_correct']||0) + '/' + (acc['1h_total']||0) + '</div></div>' +
      '<div class="stat-card"><div class="label">24h Accuracy</div><div class="value ' + accColor(a24) + '">' + (a24*100).toFixed(1) + '%</div><div class="subtitle">' + (acc['24h_correct']||0) + '/' + (acc['24h_total']||0) + '</div></div>' +
      '<div class="stat-card"><div class="label">Recent 10 (1h)</div><div class="value ' + accColor(acc.recent_10_accuracy||0) + '">' + ((acc.recent_10_accuracy||0)*100).toFixed(0) + '%</div></div>' +
      '<div class="stat-card"><div class="label">Total Predictions</div><div class="value blue">' + (acc.total_predictions||0) + '</div></div>' +
      '<div class="stat-card"><div class="label">Last Price</div><div class="value">$' + lpPrice.toFixed(4) + '</div></div>' +
      '<div class="stat-card"><div class="label">Last Signal</div><div class="value ' + (lp.direction_1h==='UP'?'green':'red') + '">' + (lp.direction_1h||'--') + '</div><div class="subtitle">' + (lpConf*100).toFixed(0) + '% conf</div></div>';

    // Streak
    var streakArr = acc.recent_10 || [];
    if (streakArr.length > 0) {
      var dots = streakArr.map(function(v) {
        return '<div class="dot ' + (v ? 'g' : 'r') + '">' + (v ? 'Y' : 'N') + '</div>';
      }).join('');
      document.getElementById('streak').innerHTML = dots;
    } else {
      document.getElementById('streak').innerHTML = '<span style="color:#4b5563">No scored predictions yet -- accuracy builds after 1h</span>';
    }

    // Table
    var preds = hist.predictions || [];
    var rowsHtml = '';
    for (var i = 0; i < preds.length; i++) {
      var p = preds[i];
      var timeStr = p.iso_time ? p.iso_time.slice(0,16).replace('T',' ') : '--';
      var actualStr1h = p.actual_price_1h != null ? ('$' + p.actual_price_1h.toFixed(4) + ' (' + pct(p.actual_price_1h, p.price_at_predict) + ')') : '--';
      var actualStr24h = p.actual_price_24h != null ? ('$' + p.actual_price_24h.toFixed(4)) : '--';
      rowsHtml += '<tr>' +
        '<td>' + timeStr + '</td>' +
        '<td>$' + p.price_at_predict.toFixed(4) + '</td>' +
        '<td>' + dir(p.direction_1h) + '</td>' +
        '<td>' + (p.confidence_1h*100).toFixed(0) + '%</td>' +
        '<td>' + actualStr1h + '</td>' +
        '<td>' + badge(p.correct_1h) + '</td>' +
        '<td>' + dir(p.direction_24h) + '</td>' +
        '<td>' + (p.confidence_24h*100).toFixed(0) + '%</td>' +
        '<td>' + actualStr24h + '</td>' +
        '<td>' + badge(p.correct_24h) + '</td>' +
        '</tr>';
    }
    document.getElementById('rows').innerHTML = rowsHtml || '<tr><td colspan="10" style="text-align:center;color:#6b7280;">No predictions yet</td></tr>';

    document.getElementById('ts').textContent = new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Dashboard load error:', err);
    document.getElementById('stats').innerHTML = '<div class="stat-card"><div class="label">Error</div><div class="value red">' + err.message + '</div></div>';
  }
}

var cd = 30;
setInterval(function() { cd--; document.getElementById('cd').textContent = cd; if(cd<=0){cd=30;load();} }, 1000);
load();
</script>
</body>
</html>"""
