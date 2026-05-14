"""
Meridian Data Preparation Pipeline

Extracts Vera's interaction traces and formats them into an instruction-following
dataset suitable for training the ternary transformer.

Sources:
  - data/learning-interactions.jsonl (tool-call traces)
  - HCS topic routing decisions (from logs/topic-poller)
  - Agent spawn/execution records
  - Block stream event patterns

Output: JSONL with {instruction, input, output} fields.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any, Dict, List

from infrastructure import SCHEMA_VERSION, file_sha256, set_reproducible_seed, write_json


# ─── Vera Task Templates ────────────────────────────────────────────────────

TOOL_ROUTING_TEMPLATE = """You are Meridian, Vera's ternary reasoning engine.
Your task: given a user request, select the correct tool(s) and provide parameters.

Available tools:
{tools}

User request: {request}

Respond with a JSON array of tool calls."""

HCS_TOPIC_TEMPLATE = """You are Meridian, Vera's ternary reasoning engine.
Your task: classify which HCS topic this message belongs to.

Available topics:
{topics}

Message: {message}

Respond with the topic ID only."""

AGENT_SPAWN_TEMPLATE = """You are Meridian, Vera's ternary reasoning engine.
Your task: decide if this task requires spawning a new agent.

Task description: {task}
Current agent load: {load}

Respond with "spawn" or "route"."""

BLOCKSTREAM_ANOMALY_TEMPLATE = """You are Meridian, Vera's ternary reasoning engine.
Your task: detect anomalies in block stream statistics.

Stats:
{stats}

Respond with "normal" or "anomaly: <reason>"."""


# ─── Synthetic Data Generators ────────────────────────────────────────────

VERA_TOOLS = [
    {"name": "get_price_chart", "description": "Get token price chart", "params": ["token", "period"]},
    {"name": "get_account_balance", "description": "Get HBAR balance", "params": ["account_id"]},
    {"name": "submit_topic_message", "description": "Send HCS message", "params": ["topic_id", "message"]},
    {"name": "create_scheduled_transaction", "description": "Schedule future execution", "params": ["transaction", "execute_at"]},
    {"name": "verify_block_proof", "description": "Validate block stream proof", "params": ["block_number", "proof_hash"]},
    {"name": "spawn_lattice_agent", "description": "Create new swarm agent", "params": ["role", "capabilities"]},
    {"name": "query_carbon_retirement", "description": "Check carbon credit status", "params": ["project_id"]},
    {"name": "get_defi_yield", "description": "Get DeFi yield opportunities", "params": ["pool_address"]},
]

VERA_TOPICS = [
    "0.0.12345",   # Registry
    "0.0.12346",   # Tasks
    "0.0.12347",   # Results
    "0.0.12348",   # Audit
    "0.0.12349",   # Beacon
    "0.0.12350",   # Hot Topics
    "0.0.12351",   # Swarm State
    "0.0.12352",   # Swarm Consensus
]


def example_record(task_type: str, instruction: str, output: str, *, source: str = "synthetic") -> Dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "task_type": task_type,
        "source": source,
        "instruction": instruction,
        "input": "",
        "output": output,
    }


def generate_tool_routing_examples(n: int) -> List[Dict[str, Any]]:
    """Generate synthetic tool-routing training examples."""
    requests = [
        "What's the HBAR price over the last 7 days?",
        "Check my account balance for 0.0.1234",
        "Send a message to the audit topic about the new deployment",
        "Schedule a token transfer for tomorrow at midnight",
        "Verify the block proof for block 15000000",
        "I need a new agent for carbon credit verification",
        "Show me the latest DeFi yields on SaucerSwap",
        "Query carbon retirement status for project REED-001",
        "Get price chart for HBAR/USDC over 30 days",
        "Send HCS message to swarm consensus topic",
        "Create scheduled transaction to mint NFT next week",
        "Verify if block 14999999 proof is valid",
        "Spawn an agent with DeFi analysis capabilities",
    ]
    examples = []
    for i in range(n):
        req = random.choice(requests)
        # Build expected tool calls (simplified — in real data this comes from executor traces)
        selected = [t for t in VERA_TOOLS if any(
            kw in req.lower() for kw in t["name"].split("_")
        )]
        if not selected:
            selected = [random.choice(VERA_TOOLS)]

        tools_str = "\n".join(f"- {t['name']}: {t['description']}" for t in VERA_TOOLS)
        instruction = TOOL_ROUTING_TEMPLATE.format(tools=tools_str, request=req)
        output = json.dumps([
            {"tool": t["name"], "params": {p: "..." for p in t["params"]}}
            for t in selected
        ], indent=2)
        examples.append(example_record("tool_routing", instruction, output))
    return examples


def generate_topic_classification_examples(n: int) -> List[Dict[str, Any]]:
    """Generate synthetic HCS topic classification examples."""
    messages = [
        ("New agent registered with lattice swarm", "0.0.12345"),
        ("Task assignment: verify block 15000001", "0.0.12346"),
        ("Block proof verification complete: VALID", "0.0.12347"),
        ("Scheduled transaction executed successfully", "0.0.12348"),
        ("System heartbeat: all nodes operational", "0.0.12349"),
        ("High volume detected on carbon credit topic", "0.0.12350"),
        ("Swarm state update: 6 agents active", "0.0.12351"),
        ("Consensus reached on DeFi yield proposal", "0.0.12352"),
    ]
    examples = []
    for i in range(n):
        msg, topic = random.choice(messages)
        topics_str = "\n".join(f"- {t}" for t in VERA_TOPICS)
        instruction = HCS_TOPIC_TEMPLATE.format(topics=topics_str, message=msg)
        examples.append(example_record("topic_classification", instruction, topic))
    return examples


def generate_agent_spawn_examples(n: int) -> List[Dict[str, Any]]:
    """Generate synthetic agent spawn decision examples."""
    tasks = [
        ("Process 5000 carbon credit retirements", "high", "spawn"),
        ("Simple price query for HBAR", "low", "route"),
        ("Verify block proofs for last 1000 blocks", "high", "spawn"),
        ("Get account balance for user", "low", "route"),
        ("Coordinate multi-agent DeFi analysis", "high", "spawn"),
        ("Check mirror node health", "low", "route"),
        ("Run lattice consensus for new proposal", "high", "spawn"),
        ("Fetch token metadata", "low", "route"),
    ]
    examples = []
    for i in range(n):
        task, load, decision = random.choice(tasks)
        instruction = AGENT_SPAWN_TEMPLATE.format(task=task, load=load)
        examples.append(example_record("agent_spawn", instruction, decision))
    return examples


def generate_blockstream_anomaly_examples(n: int) -> List[Dict[str, Any]]:
    """Generate synthetic block stream anomaly detection examples."""
    normal_stats = [
        {"blocks_per_sec": 2.5, "latency_ms": 120, "divergences": 0, "reconnects": 0},
        {"blocks_per_sec": 2.3, "latency_ms": 150, "divergences": 0, "reconnects": 1},
        {"blocks_per_sec": 2.7, "latency_ms": 100, "divergences": 0, "reconnects": 0},
    ]
    anomaly_stats = [
        {"blocks_per_sec": 0.1, "latency_ms": 5000, "divergences": 3, "reconnects": 10},
        {"blocks_per_sec": 5.0, "latency_ms": 50, "divergences": 0, "reconnects": 0},  # too fast = anomaly
        {"blocks_per_sec": 2.4, "latency_ms": 200, "divergences": 5, "reconnects": 2},
    ]
    examples = []
    for i in range(n):
        if random.random() < 0.7:
            stats = random.choice(normal_stats)
            label = "normal"
        else:
            stats = random.choice(anomaly_stats)
            if stats["blocks_per_sec"] < 1.0:
                label = "anomaly: low throughput"
            elif stats["divergences"] > 2:
                label = "anomaly: proof divergences detected"
            else:
                label = "anomaly: suspicious pattern"
        stats_str = json.dumps(stats, indent=2)
        instruction = BLOCKSTREAM_ANOMALY_TEMPLATE.format(stats=stats_str)
        examples.append(example_record("anomaly_detection", instruction, label))
    return examples


# ─── Real Data Ingestion ────────────────────────────────────────────────────

def load_existing_traces(data_dir: Path) -> List[Dict[str, Any]]:
    """Load existing Vera interaction traces if available."""
    traces: List[Dict[str, str]] = []
    trace_file = data_dir / "learning-interactions.jsonl"
    if not trace_file.exists():
        return traces

    with open(trace_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                # Map to instruction format if possible
                instruction = entry.get("instruction", entry.get("prompt", ""))
                output = entry.get("output", entry.get("response", ""))
                if instruction and output:
                    traces.append({
                        "schema_version": SCHEMA_VERSION,
                        "task_type": entry.get("task_type", "vera_trace"),
                        "source": "real_trace",
                        "instruction": instruction,
                        "input": entry.get("input", ""),
                        "output": output,
                        "trace_id": entry.get("trace_id") or entry.get("id"),
                    })
            except json.JSONDecodeError:
                continue
    return traces


# ─── Main Pipeline ──────────────────────────────────────────────────────────

def prepare_dataset(
    output_path: Path,
    n_synthetic: int = 5000,
    data_dir: Path = Path("data"),
    train_split: float = 0.9,
    seed: int = 137,
) -> Dict[str, int]:
    """Build complete training/evaluation dataset."""
    set_reproducible_seed(seed)
    print(f"Generating {n_synthetic} synthetic examples...")

    examples: List[Dict[str, Any]] = []
    examples += generate_tool_routing_examples(n_synthetic // 4)
    examples += generate_topic_classification_examples(n_synthetic // 4)
    examples += generate_agent_spawn_examples(n_synthetic // 4)
    examples += generate_blockstream_anomaly_examples(n_synthetic // 4)

    # Load real traces
    real_traces = load_existing_traces(data_dir)
    if real_traces:
        print(f"Loaded {len(real_traces)} real traces from {data_dir}")
        examples += real_traces

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

    print(f"Dataset prepared: {len(train)} train, {len(eval_set)} eval")
    print(f"  Train: {train_path}")
    print(f"  Eval:  {eval_path}")
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "seed": seed,
        "synthetic_requested": n_synthetic,
        "real_traces": len(real_traces),
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

    return {"train": len(train), "eval": len(eval_set)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare Meridian training data")
    parser.add_argument("--output", default="models/meridian/dataset.jsonl", help="Output path")
    parser.add_argument("--n-synthetic", type=int, default=5000, help="Synthetic examples")
    parser.add_argument("--data-dir", default="data", help="Directory with Vera traces")
    parser.add_argument("--train-split", type=float, default=0.9, help="Train/eval split")
    parser.add_argument("--seed", type=int, default=137, help="Deterministic generation seed")
    args = parser.parse_args()

    stats = prepare_dataset(
        output_path=Path(args.output),
        n_synthetic=args.n_synthetic,
        data_dir=Path(args.data_dir),
        train_split=args.train_split,
        seed=args.seed,
    )
    print(f"Stats: {stats}")
