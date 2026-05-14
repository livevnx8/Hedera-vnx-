"""
Meridian Training Monitor

Lightweight CLI + HTTP dashboard for watching training runs.
Polls checkpoint directory and prints real-time progress.

Usage:
    # Terminal dashboard (polls every 5s)
    python src/ai/meridian/train_monitor.py --watch models/meridian/checkpoints/base-v1

    # One-shot status
    python src/ai/meridian/train_monitor.py --checkpoint models/meridian/checkpoints/base-v1/best.pt

    # HTTP dashboard on port 8124
    python src/ai/meridian/train_monitor.py --serve --port 8124 --watch models/meridian/checkpoints/base-v1
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional


def load_training_summary(checkpoint_dir: Path) -> Optional[Dict[str, Any]]:
    """Load training_summary.json if it exists."""
    path = checkpoint_dir / "training_summary.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_run_config(checkpoint_dir: Path) -> Optional[Dict[str, Any]]:
    """Load run_config.json if it exists."""
    path = checkpoint_dir / "run_config.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def find_latest_checkpoint(checkpoint_dir: Path) -> Optional[Path]:
    """Find the most recent checkpoint file."""
    checkpoints = sorted(checkpoint_dir.glob("checkpoint-*.pt"))
    return checkpoints[-1] if checkpoints else None


def load_checkpoint_meta(path: Path) -> Optional[Dict[str, Any]]:
    """Load checkpoint metadata without loading full model state."""
    try:
        import torch
        ckpt = torch.load(path, map_location="cpu", weights_only=False)
        return {
            "step": ckpt.get("step", 0),
            "eval_loss": ckpt.get("eval", {}).get("loss") if ckpt.get("eval") else None,
            "eval_perplexity": ckpt.get("eval", {}).get("perplexity") if ckpt.get("eval") else None,
            "best_eval_loss": ckpt.get("best_eval_loss"),
            "checkpoint_version": ckpt.get("checkpoint_version"),
        }
    except Exception:
        return None


def format_eta(seconds_remaining: float) -> str:
    """Format remaining seconds as human-readable ETA."""
    if seconds_remaining < 60:
        return f"{seconds_remaining:.0f}s"
    elif seconds_remaining < 3600:
        return f"{seconds_remaining/60:.1f}m"
    else:
        return f"{seconds_remaining/3600:.1f}h"


def print_status(checkpoint_dir: Path, *, verbose: bool = False) -> None:
    """Print current training status."""
    run_config = load_run_config(checkpoint_dir)
    summary = load_training_summary(checkpoint_dir)
    latest_ckpt = find_latest_checkpoint(checkpoint_dir)
    ckpt_meta = load_checkpoint_meta(latest_ckpt) if latest_ckpt else None

    # Header
    print(f"\n{'='*70}")
    print(f"  Meridian Training Monitor: {checkpoint_dir}")
    print(f"{'='*70}")

    # Config
    if run_config:
        cfg = run_config.get("model_config", {})
        print(f"\n  Model: {cfg.get('d_model', '?')}d × {cfg.get('n_layers', '?')}L, "
              f"{cfg.get('n_heads', '?')}h, vocab={cfg.get('vocab_size', '?')}")
        print(f"  Training: {run_config.get('epochs', '?')} epochs, "
              f"lr={run_config.get('max_lr', '?')}, "
              f"grad_clip={run_config.get('grad_clip', '?')}")
        if run_config.get("grad_accum_steps", 1) > 1:
            print(f"  Gradient accumulation: {run_config['grad_accum_steps']} steps")
    else:
        print("\n  ⚠️  No run_config.json found — training may not have started")

    # Progress
    if ckpt_meta:
        step = ckpt_meta["step"]
        print(f"\n  Latest checkpoint: {latest_ckpt.name if latest_ckpt else 'N/A'} (step {step})")
        if ckpt_meta.get("eval_loss") is not None:
            print(f"  Eval loss:       {ckpt_meta['eval_loss']:.4f}")
        if ckpt_meta.get("eval_perplexity") is not None:
            print(f"  Eval perplexity: {ckpt_meta['eval_perplexity']:.2f}")
        if ckpt_meta.get("best_eval_loss") is not None:
            print(f"  Best eval loss:  {ckpt_meta['best_eval_loss']:.4f}")

        # Estimate progress
        if run_config:
            total_epochs = run_config.get("epochs", 1)
            # Rough estimate: assume linear progress
            # This is imprecise but gives a sense
            print(f"\n  Status: training in progress")
    elif summary:
        # Training complete
        print(f"\n  ✅ Training complete!")
        print(f"  Final step:     {summary.get('final_step', '?')}")
        print(f"  Best eval loss: {summary.get('best_eval_loss', 'N/A')}")
        if summary.get("final_eval"):
            fe = summary["final_eval"]
            print(f"  Final eval:     loss={fe.get('loss', 'N/A')}, ppl={fe.get('perplexity', 'N/A')}")
    else:
        print("\n  ⏳ Waiting for training to start...")

    print(f"{'='*70}\n")


def watch_loop(checkpoint_dir: Path, interval: float = 5.0) -> None:
    """Poll checkpoint directory and print updates."""
    last_ckpt_name = None
    try:
        while True:
            latest = find_latest_checkpoint(checkpoint_dir)
            current_name = latest.name if latest else None
            if current_name != last_ckpt_name:
                # Clear screen for clean update
                os.system("clear" if os.name != "nt" else "cls")
                print_status(checkpoint_dir)
                last_ckpt_name = current_name
            else:
                # Still print timestamp so user knows it's alive
                print(f"\r  ⏳ Last update: {time.strftime('%H:%M:%S')} — waiting for next checkpoint...", end="", flush=True)
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n\n  Monitoring stopped.")


def serve_http(checkpoint_dir: Path, port: int = 8124) -> None:
    """Simple HTTP endpoint returning JSON status."""
    try:
        from http.server import HTTPServer, BaseHTTPRequestHandler
    except ImportError:
        print("HTTP server requires standard library (Python 3.7+)")
        sys.exit(1)

    class StatusHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/status":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()

                run_config = load_run_config(checkpoint_dir)
                summary = load_training_summary(checkpoint_dir)
                latest_ckpt = find_latest_checkpoint(checkpoint_dir)
                ckpt_meta = load_checkpoint_meta(latest_ckpt) if latest_ckpt else None

                payload = {
                    "checkpoint_dir": str(checkpoint_dir),
                    "run_config": run_config,
                    "training_summary": summary,
                    "latest_checkpoint": latest_ckpt.name if latest_ckpt else None,
                    "latest_step": ckpt_meta["step"] if ckpt_meta else None,
                    "latest_eval_loss": ckpt_meta.get("eval_loss"),
                    "latest_eval_perplexity": ckpt_meta.get("eval_perplexity"),
                    "best_eval_loss": ckpt_meta.get("best_eval_loss"),
                    "timestamp": time.time(),
                }
                self.wfile.write(json.dumps(payload, indent=2).encode("utf-8"))
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format, *args):
            pass  # Suppress default logging

    server = HTTPServer(("", port), StatusHandler)
    print(f"  Meridian monitor serving on http://localhost:{port}/status")
    print(f"  Watching: {checkpoint_dir}")
    print("  Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")


def main():
    parser = argparse.ArgumentParser(description="Monitor Meridian training runs")
    parser.add_argument("--watch", type=Path, help="Watch checkpoint directory for updates")
    parser.add_argument("--checkpoint", type=Path, help="Inspect a single checkpoint file")
    parser.add_argument("--serve", action="store_true", help="Start HTTP status server")
    parser.add_argument("--port", type=int, default=8124, help="HTTP server port")
    parser.add_argument("--interval", type=float, default=5.0, help="Poll interval in seconds")
    args = parser.parse_args()

    if args.checkpoint:
        if args.checkpoint.is_dir():
            print_status(args.checkpoint, verbose=True)
        else:
            meta = load_checkpoint_meta(args.checkpoint)
            if meta:
                print(json.dumps(meta, indent=2))
            else:
                print(f"Could not load checkpoint: {args.checkpoint}")
        return

    checkpoint_dir = args.watch or Path("models/meridian/checkpoints")
    if not checkpoint_dir.exists():
        checkpoint_dir.mkdir(parents=True, exist_ok=True)

    if args.serve:
        serve_http(checkpoint_dir, args.port)
    elif args.watch:
        watch_loop(checkpoint_dir, args.interval)
    else:
        print_status(checkpoint_dir, verbose=True)


if __name__ == "__main__":
    main()
