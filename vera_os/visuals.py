"""Inventory of Vera OS PNG and SVG visual assets."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VISUALS_DIR = ROOT / "docs" / "visuals"


@dataclass(frozen=True)
class VisualAsset:
    """A paired PNG/SVG visual available for docs, decks, and GitHub."""

    slug: str
    title: str
    description: str
    png: Path
    svg: Path


VISUAL_CATALOG: tuple[tuple[str, str, str], ...] = (
    (
        "vnx-edge-performance-dashboard",
        "Edge Performance Dashboard",
        "Executive performance snapshot for prediction quality, latency, and operational posture.",
    ),
    (
        "vnx-architecture-diagram",
        "Vera OS Architecture",
        "System architecture spanning prediction APIs, specialist swarms, cache, metrics, and deployment.",
    ),
    (
        "vnx-bitlattice-architecture",
        "BitLattice Model Architecture",
        "Model architecture view for the compact prediction engine powering token forecasts.",
    ),
    (
        "vnx-accuracy-metrics",
        "Accuracy Metrics",
        "Model quality and prediction-confidence visualization for public review.",
    ),
    (
        "vnx-performance-comparison",
        "Performance Comparison",
        "Benchmark-style comparison of Vera OS performance characteristics.",
    ),
    (
        "vnx-competitive-advantage-grid",
        "Competitive Advantage Grid",
        "Positioning matrix for speed, efficiency, verifiability, and operational readiness.",
    ),
    (
        "vnx-model-size-comparison",
        "Model Size Comparison",
        "Compact model footprint visualization for edge and infrastructure use cases.",
    ),
    (
        "vnx-scalability-visualization",
        "Scalability Visualization",
        "Scalability profile for multi-agent and production infrastructure growth.",
    ),
    (
        "vnx-verifiability-diagram",
        "Verifiability Diagram",
        "Auditability and verification flow for predictions, agents, and metrics.",
    ),
    (
        "vnx-sustainability-infographic",
        "Sustainability Infographic",
        "Efficiency and deployment footprint story for lightweight inference.",
    ),
    (
        "vnx-research-timeline",
        "Research Timeline",
        "Project evolution from model research through production infrastructure.",
    ),
)


def get_visual_assets(base_dir: Path | str | None = None) -> list[VisualAsset]:
    """Return the curated Vera OS visual catalog with concrete file paths."""
    visual_dir = Path(base_dir) if base_dir is not None else DEFAULT_VISUALS_DIR
    return [
        VisualAsset(
            slug=slug,
            title=title,
            description=description,
            png=visual_dir / f"{slug}-png.png",
            svg=visual_dir / f"{slug}-svg.svg",
        )
        for slug, title, description in VISUAL_CATALOG
    ]


def get_visual_asset_pairs(base_dir: Path | str | None = None) -> dict[str, dict[str, str]]:
    """Return visual paths as a JSON-friendly mapping by slug."""
    return {
        asset.slug: {"png": str(asset.png), "svg": str(asset.svg)}
        for asset in get_visual_assets(base_dir)
    }


__all__ = [
    "VisualAsset",
    "get_visual_asset_pairs",
    "get_visual_assets",
]
