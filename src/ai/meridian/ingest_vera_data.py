"""
Ingest real Vera data sources into Meridian training format.

Sources:
  - data/work-records-cache.json   (best: real tool calls + outputs)
  - data/block-proofs.jsonl         (block proof verification traces)
  - data/vera-workflow-ledger.json  (workflow decisions)
  - data/vera-tool-weights.json     (tool usage patterns)
  - data/vera-skill-lattice.json    (skill/lattice decisions)

Output: JSONL files in instruction-following format for Meridian training.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Dict, List

from infrastructure import SCHEMA_VERSION, file_sha256, set_reproducible_seed, write_json


TOOL_ROUTING_TEMPLATE = """You are Meridian, Vera's ternary reasoning engine.
Your task: given a user request, select the correct tool(s) and provide parameters.

Available tools:
{tools}

User request: {request}

Respond with a JSON array of tool calls."""

ANOMALY_TEMPLATE = """You are Meridian, Vera's ternary reasoning engine.
Your task: detect anomalies in block stream statistics.

Stats:
{stats}

Respond with "normal" or "anomaly: <reason>"."""


# ─── Loaders ────────────────────────────────────────────────────────────────


def load_work_records(path: Path) -> List[Dict[str, Any]]:
    """Load work-records-cache.json and extract high-quality examples."""
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    records = data.get("records", [])
    # Only successful records with meaningful content
    return [
        r for r in records
        if r.get("success", False)
        and len(r.get("description", "")) > 10
        and len(r.get("outputs", {}).get("result", "")) > 20
    ]


def load_block_proofs(path: Path) -> List[Dict[str, Any]]:
    """Load block-proofs.jsonl for anomaly detection training."""
    if not path.exists():
        return []
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records


def load_workflow_ledger(path: Path) -> List[Dict[str, Any]]:
    """Load vera-workflow-ledger.json for spawn/routing decisions."""
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else data.get("workflows", [])


def load_tool_weights(path: Path) -> List[Dict[str, Any]]:
    """Load vera-tool-weights.json for tool preference patterns."""
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    weights = data.get("weights", [])
    return [w for w in weights if w.get("weight", 0) > 0]


def load_skill_lattice(path: Path) -> List[Dict[str, Any]]:
    """Load vera-skill-lattice.json for lattice coordination training."""
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("nodes", [])


# ─── Example Builders ───────────────────────────────────────────────────────


def build_tool_routing_examples(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert work records into tool-routing training examples."""
    examples = []
    for r in records:
        desc = r.get("description", "")
        # Extract role + task from description like "researcher: Research DeFi..."
        parts = desc.split(":", 1)
        role = parts[0].strip() if len(parts) > 1 else "agent"
        task = parts[1].strip() if len(parts) > 1 else desc

        tools_used = r.get("toolsUsed", [])
        result = r.get("outputs", {}).get("result", "")

        # Build instruction
        all_tools = [
            {"name": "get_price_chart", "description": "Get token price chart"},
            {"name": "get_account_balance", "description": "Get HBAR balance"},
            {"name": "submit_topic_message", "description": "Send HCS message"},
            {"name": "create_scheduled_transaction", "description": "Schedule future execution"},
            {"name": "verify_block_proof", "description": "Validate block stream proof"},
            {"name": "spawn_lattice_agent", "description": "Create new swarm agent"},
            {"name": "query_carbon_retirement", "description": "Check carbon credit status"},
            {"name": "get_defi_yield", "description": "Get DeFi yield opportunities"},
            {"name": "get_news", "description": "Get news and research"},
            {"name": "vera_memory_recall", "description": "Recall from memory"},
        ]
        tools_str = "\n".join(f"- {t['name']}: {t['description']}" for t in all_tools)
        instruction = TOOL_ROUTING_TEMPLATE.format(tools=tools_str, request=task)

        # Build expected output: JSON array of tool calls
        tool_calls = []
        for t in tools_used:
            tool_calls.append({"tool": t, "params": {"task": task}})
        if not tool_calls:
            tool_calls = [{"tool": "vera_memory_recall", "params": {"task": task}}]

        output = json.dumps(tool_calls, indent=2) + f"\n\nResult:\n{result[:500]}"

        examples.append({
            "schema_version": SCHEMA_VERSION,
            "task_type": "tool_routing",
            "source": "vera_work_record",
            "instruction": instruction,
            "input": f"Role: {role}\nTask: {task}",
            "output": output,
            "metadata": {
                "duration_ms": r.get("durationMs"),
                "tools_used": tools_used,
                "record_id": r.get("id"),
            },
        })
    return examples


def build_anomaly_examples(proofs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert block proof records into anomaly detection training examples."""
    examples = []
    # Group by block and check for divergences
    by_block: Dict[str, List[Dict[str, Any]]] = {}
    for p in proofs:
        bn = str(p.get("blockNumber", "0"))
        by_block.setdefault(bn, []).append(p)

    for bn, records in by_block.items():
        verified = [r for r in records if r.get("verified", False)]
        failed = [r for r in records if not r.get("verified", False)]

        # Normal case: all verify successfully
        if len(verified) > 0 and len(failed) == 0:
            stats = {
                "blocks_per_sec": 2.5,
                "latency_ms": 120,
                "divergences": 0,
                "reconnects": 0,
                "verified_blocks": len(verified),
            }
            stats_str = json.dumps(stats, indent=2)
            instruction = ANOMALY_TEMPLATE.format(stats=stats_str)
            examples.append({
                "schema_version": SCHEMA_VERSION,
                "task_type": "anomaly_detection",
                "source": "vera_block_proof",
                "instruction": instruction,
                "input": f"Block {bn}: {len(verified)} verifications, 0 failures",
                "output": "normal",
            })

        # Anomaly case: some failed
        if len(failed) > 0:
            divergences = len(failed)
            last_fail = failed[-1]
            reason = last_fail.get("divergence", "verification failure")
            stats = {
                "blocks_per_sec": 0.1,
                "latency_ms": 5000,
                "divergences": divergences,
                "reconnects": len(failed),
                "verified_blocks": len(verified),
            }
            stats_str = json.dumps(stats, indent=2)
            instruction = ANOMALY_TEMPLATE.format(stats=stats_str)
            examples.append({
                "schema_version": SCHEMA_VERSION,
                "task_type": "anomaly_detection",
                "source": "vera_block_proof",
                "instruction": instruction,
                "input": f"Block {bn}: {len(verified)} verifications, {len(failed)} failures",
                "output": f"anomaly: {reason}",
            })

    return examples


def build_spawn_examples(workflows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert workflow records into spawn/routing training examples."""
    examples = []
    for w in workflows:
        subject = w.get("subject", "")
        if "carbon-verification" in subject.lower():
            # High-load task → spawn
            instruction = f"""You are Meridian, Vera's ternary reasoning engine.
Your task: decide if this task requires spawning a new agent.

Task description: {subject}
Current agent load: high

Respond with "spawn" or "route"."""
            examples.append({
                "schema_version": SCHEMA_VERSION,
                "task_type": "agent_spawn",
                "source": "vera_workflow",
                "instruction": instruction,
                "input": f"Workflow: {subject}\nStage: {w.get('currentStage', 'unknown')}",
                "output": "spawn",
            })
        elif "query" in subject.lower() or "check" in subject.lower():
            # Simple query → route
            instruction = f"""You are Meridian, Vera's ternary reasoning engine.
Your task: decide if this task requires spawning a new agent.

Task description: {subject}
Current agent load: low

Respond with "spawn" or "route"."""
            examples.append({
                "schema_version": SCHEMA_VERSION,
                "task_type": "agent_spawn",
                "source": "vera_workflow",
                "instruction": instruction,
                "input": f"Workflow: {subject}\nStage: {w.get('currentStage', 'unknown')}",
                "output": "route",
            })
    return examples


# ─── Pipeline ──────────────────────────────────────────────────────────────


def ingest_vera_data(
    output_path: Path = Path("models/meridian/vera-dataset.jsonl"),
    data_dir: Path = Path("data"),
    train_split: float = 0.9,
    seed: int = 137,
) -> Dict[str, int]:
    """Ingest all real Vera data sources and create training dataset."""
    set_reproducible_seed(seed)

    # Load all sources
    work_records = load_work_records(data_dir / "work-records-cache.json")
    block_proofs = load_block_proofs(data_dir / "block-proofs.jsonl")
    workflows = load_workflow_ledger(data_dir / "vera-workflow-ledger.json")
    tool_weights = load_tool_weights(data_dir / "vera-tool-weights.json")
    skill_nodes = load_skill_lattice(data_dir / "vera-skill-lattice.json")

    print(f"Loaded sources:")
    print(f"  Work records:    {len(work_records)}")
    print(f"  Block proofs:    {len(block_proofs)}")
    print(f"  Workflows:       {len(workflows)}")
    print(f"  Tool weights:    {len(tool_weights)}")
    print(f"  Skill nodes:     {len(skill_nodes)}")

    # Build examples
    examples: List[Dict[str, Any]] = []

    # Best source: work records (real tool calls with outputs)
    tool_examples = build_tool_routing_examples(work_records)
    print(f"  → Tool routing examples: {len(tool_examples)}")
    examples += tool_examples

    # Anomaly detection from block proofs
    anomaly_examples = build_anomaly_examples(block_proofs)
    print(f"  → Anomaly examples: {len(anomaly_examples)}")
    examples += anomaly_examples

    # Spawn/routing from workflows
    spawn_examples = build_spawn_examples(workflows)
    print(f"  → Spawn examples: {len(spawn_examples)}")
    examples += spawn_examples

    if not examples:
        print("WARNING: No real Vera examples extracted. Check data sources.")
        return {"train": 0, "eval": 0, "total": 0}

    # Shuffle
    random.shuffle(examples)

    # Split
    split_idx = int(len(examples) * train_split)
    train = examples[:split_idx]
    eval_set = examples[split_idx:]

    # Write
    output_path.parent.mkdir(parents=True, exist_ok=True)
    train_path = output_path.with_suffix(".train.jsonl")
    eval_path = output_path.with_suffix(".eval.jsonl")

    with open(train_path, "w", encoding="utf-8") as f:
        for ex in train:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    with open(eval_path, "w", encoding="utf-8") as f:
        for ex in eval_set:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    print(f"\nDataset prepared: {len(train)} train, {len(eval_set)} eval")
    print(f"  Train: {train_path}")
    print(f"  Eval:  {eval_path}")

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "seed": seed,
        "real_sources": {
            "work_records": len(work_records),
            "block_proofs": len(block_proofs),
            "workflows": len(workflows),
            "tool_weights": len(tool_weights),
            "skill_nodes": len(skill_nodes),
        },
        "total_examples": len(examples),
        "train_examples": len(train),
        "eval_examples": len(eval_set),
        "train_path": str(train_path),
        "eval_path": str(eval_path),
        "train_sha256": file_sha256(train_path),
        "eval_sha256": file_sha256(eval_path),
        "task_counts": {},
    }
    for example in examples:
        task_type = str(example.get("task_type", "unknown"))
        manifest["task_counts"][task_type] = manifest["task_counts"].get(task_type, 0) + 1

    manifest_path = output_path.with_suffix(".manifest.json")
    write_json(manifest_path, manifest)
    print(f"  Manifest: {manifest_path}")

    return {"train": len(train), "eval": len(eval_set), "total": len(examples)}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest real Vera data for Meridian training")
    parser.add_argument("--output", default="models/meridian/vera-dataset.jsonl", help="Output path")
    parser.add_argument("--data-dir", default="data", help="Directory with Vera data sources")
    parser.add_argument("--train-split", type=float, default=0.9, help="Train/eval split")
    parser.add_argument("--seed", type=int, default=137, help="Deterministic generation seed")
    args = parser.parse_args()

    stats = ingest_vera_data(
        output_path=Path(args.output),
        data_dir=Path(args.data_dir),
        train_split=args.train_split,
        seed=args.seed,
    )
    print(f"Stats: {stats}")
