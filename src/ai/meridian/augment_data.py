"""
Scale Vera training data from ~200 real examples to 10K+ via template augmentation.

Strategy:
  1. Load real vera-dataset.train.jsonl
  2. Paraphrase instructions using rule-based templates
  3. Vary tool parameters, topic IDs, block numbers
  4. Mix synthetic but realistic examples
  5. Output augmented.train.jsonl / augmented.eval.jsonl

This is a bootstrapping step before we have enough live Vera traffic for 100% real data.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any, Dict, List

from infrastructure import SCHEMA_VERSION, file_sha256, set_reproducible_seed, write_json


# ─── Paraphrase Templates ───────────────────────────────────────────

TOOL_REQUEST_PARAPHRASES = [
    "Can you {action}?",
    "I need to {action}",
    "Please {action} for me",
    "Help me {action}",
    "What's the result of {action}?",
    "Run {action}",
    "Execute {action}",
    "Show me {action}",
]

AGENT_TASK_PARAPHRASES = [
    "Process {task}",
    "The task is: {task}",
    "I need {task} done",
    "Handle {task}",
    "Can you do {task}?",
    "We need to {task}",
    "Start {task}",
]

TOPIC_MESSAGES = [
    "Agent registration completed successfully",
    "New task assigned to lattice swarm",
    "Verification result submitted to results topic",
    "Audit trail updated with new transaction",
    "Heartbeat received from all nodes",
    "High volume alert on monitoring topic",
    "Swarm coordination state synchronized",
    "Consensus achieved on latest proposal",
]

VERA_TOOLS = [
    {"name": "get_price_chart", "description": "Get token price chart", "params": ["token", "period"]},
    {"name": "get_account_balance", "description": "Get HBAR balance", "params": ["account_id"]},
    {"name": "submit_topic_message", "description": "Send HCS message", "params": ["topic_id", "message"]},
    {"name": "create_scheduled_transaction", "description": "Schedule future execution", "params": ["transaction", "execute_at"]},
    {"name": "verify_block_proof", "description": "Validate block stream proof", "params": ["block_number", "proof_hash"]},
    {"name": "spawn_lattice_agent", "description": "Create new swarm agent", "params": ["role", "capabilities"]},
    {"name": "query_carbon_retirement", "description": "Check carbon credit status", "params": ["project_id"]},
    {"name": "get_defi_yield", "description": "Get DeFi yield opportunities", "params": ["pool_address"]},
    {"name": "get_news", "description": "Get news and research", "params": ["query"]},
    {"name": "vera_memory_recall", "description": "Recall from memory", "params": ["query"]},
]

VERA_TOPICS = [
    "0.0.12345", "0.0.12346", "0.0.12347", "0.0.12348",
    "0.0.12349", "0.0.12350", "0.0.12351", "0.0.12352",
]


def paraphrase_tool_instruction(instruction: str, request: str) -> str:
    """Replace the user request with a paraphrased variant."""
    template = random.choice(TOOL_REQUEST_PARAPHRASES)
    action = request.lower().replace("?", "").replace("can you ", "").replace("what's the ", "")
    new_request = template.format(action=action)
    # Replace the request line in the instruction
    lines = instruction.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("User request:"):
            lines[i] = f"User request: {new_request}"
            break
    return "\n".join(lines)


def vary_tool_params(output: str) -> str:
    """Vary parameters in tool call JSON outputs."""
    try:
        calls = json.loads(output)
        if isinstance(calls, list):
            for call in calls:
                if "params" in call and isinstance(call["params"], dict):
                    for key in call["params"]:
                        if key in ("token", "pool_address"):
                            call["params"][key] = random.choice(["HBAR", "USDC", "SAUCE", "HST", "XRP"])
                        elif key == "period":
                            call["params"][key] = random.choice(["1d", "7d", "30d", "1y"])
                        elif key == "account_id":
                            call["params"][key] = f"0.0.{random.randint(1000, 99999)}"
                        elif key == "topic_id":
                            call["params"][key] = random.choice(VERA_TOPICS)
                        elif key == "block_number":
                            call["params"][key] = random.randint(14000000, 16000000)
            return json.dumps(calls, indent=2)
    except (json.JSONDecodeError, TypeError):
        pass
    return output


def vary_anomaly_stats(instruction: str, output: str) -> tuple[str, str]:
    """Vary block stream stats while keeping the label consistent."""
    is_anomaly = "anomaly" in output.lower()
    if is_anomaly:
        stats = {
            "blocks_per_sec": round(random.uniform(0.05, 0.5), 2),
            "latency_ms": random.randint(3000, 8000),
            "divergences": random.randint(1, 10),
            "reconnects": random.randint(3, 15),
        }
        reason = random.choice([
            "low throughput", "proof divergences detected",
            "high latency", "suspicious pattern",
            "reconnect storm",
        ])
        new_output = f"anomaly: {reason}"
    else:
        stats = {
            "blocks_per_sec": round(random.uniform(2.0, 3.0), 2),
            "latency_ms": random.randint(80, 200),
            "divergences": 0,
            "reconnects": random.randint(0, 2),
        }
        new_output = "normal"

    stats_str = json.dumps(stats, indent=2)
    lines = instruction.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("Stats:"):
            lines[i] = f"Stats:\n{stats_str}"
            break
    new_instruction = "\n".join(lines)
    return new_instruction, new_output


def vary_spawn_decision(instruction: str, output: str) -> tuple[str, str]:
    """Vary task descriptions while keeping spawn/route label."""
    is_spawn = output.strip().lower() == "spawn"
    tasks = [
        "Process 5000 carbon credit retirements",
        "Simple price query for HBAR",
        "Verify block proofs for last 1000 blocks",
        "Get account balance for user",
        "Coordinate multi-agent DeFi analysis",
        "Check mirror node health",
        "Run lattice consensus for new proposal",
        "Fetch token metadata",
        "Audit 10000 transactions",
        "Generate compliance report",
        "Monitor carbon credit retirement queue",
        "Query DeFi pool liquidity",
        "Validate NFT collection metadata",
        "Process HCS message backlog",
        "Run smart contract security scan",
    ]
    task = random.choice(tasks)
    load = "high" if is_spawn else "low"
    new_instruction = f"""You are Meridian, Vera's ternary reasoning engine.
Your task: decide if this task requires spawning a new agent.

Task description: {task}
Current agent load: {load}

Respond with "spawn" or "route"."""
    return new_instruction, output


def vary_topic_classification(instruction: str, output: str) -> tuple[str, str]:
    """Vary messages while keeping the topic label."""
    msg = random.choice(TOPIC_MESSAGES)
    topics_str = "\n".join(f"- {t}" for t in VERA_TOPICS)
    new_instruction = f"""You are Meridian, Vera's ternary reasoning engine.
Your task: classify which HCS topic this message belongs to.

Available topics:
{topics_str}

Message: {msg}

Respond with the topic ID only."""
    return new_instruction, output


# ─── Augmenters ─────────────────────────────────────────────────────


def augment_example(example: Dict[str, Any]) -> Dict[str, Any]:
    """Create a single augmented variant of a real example."""
    task_type = example.get("task_type", "tool_routing")
    instruction = example["instruction"]
    output = example["output"]
    input_text = example.get("input", "")

    if task_type == "tool_routing":
        # Extract request from instruction
        request_match = None
        for line in instruction.split("\n"):
            if line.startswith("User request:"):
                request_match = line.replace("User request:", "").strip()
                break
        if request_match:
            instruction = paraphrase_tool_instruction(instruction, request_match)
        output = vary_tool_params(output)

    elif task_type == "anomaly_detection":
        instruction, output = vary_anomaly_stats(instruction, output)

    elif task_type == "agent_spawn":
        instruction, output = vary_spawn_decision(instruction, output)

    elif task_type == "topic_classification":
        instruction, output = vary_topic_classification(instruction, output)

    return {
        "schema_version": SCHEMA_VERSION,
        "task_type": task_type,
        "source": "augmented",
        "instruction": instruction,
        "input": input_text,
        "output": output,
        "metadata": example.get("metadata", {}),
    }


def generate_synthetic_tool_examples(n: int) -> List[Dict[str, Any]]:
    """Generate fresh synthetic tool routing examples."""
    examples = []
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
        "Get news about Hedera governance proposals",
        "Recall memory about last carbon audit",
        "What's the price of SAUCE token?",
        "Check balance for account 0.0.99999",
        "Submit proof to audit topic 0.0.12348",
    ]
    tools_str = "\n".join(f"- {t['name']}: {t['description']}" for t in VERA_TOOLS)

    for _ in range(n):
        req = random.choice(requests)
        instruction = f"""You are Meridian, Vera's ternary reasoning engine.
Your task: given a user request, select the correct tool(s) and provide parameters.

Available tools:
{tools_str}

User request: {req}

Respond with a JSON array of tool calls."""
        # Select matching tools
        selected = [t for t in VERA_TOOLS if any(kw in req.lower() for kw in t["name"].split("_"))]
        if not selected:
            selected = [random.choice(VERA_TOOLS)]
        output = json.dumps([
            {"tool": t["name"], "params": {p: "..." for p in t["params"]}}
            for t in selected
        ], indent=2)
        examples.append({
            "schema_version": SCHEMA_VERSION,
            "task_type": "tool_routing",
            "source": "synthetic",
            "instruction": instruction,
            "input": "",
            "output": output,
        })
    return examples


# ─── Pipeline ───────────────────────────────────────────────────────


def augment_dataset(
    input_path: Path,
    output_path: Path,
    target_size: int = 10000,
    synthetic_ratio: float = 0.3,
    seed: int = 137,
) -> Dict[str, int]:
    """Scale a small real dataset to target_size via augmentation + synthetic mix."""
    set_reproducible_seed(seed)

    # Load real examples
    real_examples: List[Dict[str, Any]] = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                real_examples.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    print(f"Loaded {len(real_examples)} real examples from {input_path}")
    if len(real_examples) == 0:
        raise SystemExit(f"No examples found in {input_path}")

    # Calculate counts
    n_synthetic = int(target_size * synthetic_ratio)
    n_augmented = target_size - n_synthetic - len(real_examples)
    if n_augmented < 0:
        n_augmented = 0
        n_synthetic = target_size - len(real_examples)

    print(f"Target: {target_size} total")
    print(f"  Real: {len(real_examples)}")
    print(f"  Augmented: {n_augmented}")
    print(f"  Synthetic: {n_synthetic}")

    # Generate augmented examples
    augmented: List[Dict[str, Any]] = []
    for _ in range(n_augmented):
        source = random.choice(real_examples)
        augmented.append(augment_example(source))

    # Generate synthetic examples
    synthetic = generate_synthetic_tool_examples(n_synthetic)

    # Combine and shuffle
    all_examples = real_examples + augmented + synthetic
    random.shuffle(all_examples)

    # Split
    train_split = 0.9
    split_idx = int(len(all_examples) * train_split)
    train = all_examples[:split_idx]
    eval_set = all_examples[split_idx:]

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

    # Manifest
    task_counts: Dict[str, int] = {}
    for ex in all_examples:
        tt = str(ex.get("task_type", "unknown"))
        task_counts[tt] = task_counts.get(tt, 0) + 1

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "seed": seed,
        "target_size": target_size,
        "synthetic_ratio": synthetic_ratio,
        "real_examples": len(real_examples),
        "augmented_examples": len(augmented),
        "synthetic_examples": len(synthetic),
        "total_examples": len(all_examples),
        "train_examples": len(train),
        "eval_examples": len(eval_set),
        "train_path": str(train_path),
        "eval_path": str(eval_path),
        "task_counts": task_counts,
        "train_sha256": file_sha256(train_path),
        "eval_sha256": file_sha256(eval_path),
    }

    manifest_path = output_path.with_suffix(".manifest.json")
    write_json(manifest_path, manifest)

    print(f"\nDataset ready: {len(train)} train, {len(eval_set)} eval")
    print(f"  Task distribution: {task_counts}")
    print(f"  Train: {train_path}")
    print(f"  Eval:  {eval_path}")
    print(f"  Manifest: {manifest_path}")

    return {"train": len(train), "eval": len(eval_set), "total": len(all_examples)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Augment Vera training data to 10K+ examples")
    parser.add_argument("--input", default="models/meridian/vera-dataset.train.jsonl",
                        help="Input real dataset")
    parser.add_argument("--output", default="models/meridian/augmented-dataset.jsonl",
                        help="Output augmented dataset")
    parser.add_argument("--target-size", type=int, default=10000,
                        help="Total target examples")
    parser.add_argument("--synthetic-ratio", type=float, default=0.3,
                        help="Fraction of synthetic examples")
    parser.add_argument("--seed", type=int, default=137, help="Deterministic seed")
    args = parser.parse_args()

    stats = augment_dataset(
        input_path=Path(args.input),
        output_path=Path(args.output),
        target_size=args.target_size,
        synthetic_ratio=args.synthetic_ratio,
        seed=args.seed,
    )
    print(f"Stats: {stats}")
