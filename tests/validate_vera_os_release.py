#!/usr/bin/env python3
"""Validate the Vera OS public release surface.

This complements the infrastructure validator by checking the things a GitHub
visitor, package user, or reviewer will touch first: imports, examples, docs,
README visual links, and the PNG/SVG asset inventory.
"""

from __future__ import annotations

import ast
import importlib
import re
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VISUALS_DIR = ROOT / "docs" / "visuals"

EXPECTED_EXPORTS = {
    "PredictionService",
    "HederaSpecialistSwarm",
    "HealthService",
    "VisualAsset",
    "get_visual_assets",
    "get_visual_asset_pairs",
}

EXPECTED_DOCS = {
    "docs/vera-os-overview.md": ["Vera OS", "Verifiable prediction infrastructure"],
    "docs/prediction-infrastructure.md": ["PredictionService", "FastAPI", "Prometheus"],
    "docs/hedera-specialists.md": ["HederaSpecialistSwarm", "specialists", "alerts"],
    "docs/visual-assets.md": ["PNG", "SVG", "visual"],
    "docs/github-release-checklist.md": ["release", "README", "visual"],
}

EXPECTED_EXAMPLES = {
    "examples/vera_os_predict_hbar.py",
    "examples/vera_os_run_hedera_swarm.py",
    "examples/vera_os_health_report.py",
    "examples/vera_os_visual_assets.py",
}

EXPECTED_VISUAL_SLUGS = {
    "vnx-accuracy-metrics",
    "vnx-architecture-diagram",
    "vnx-bitlattice-architecture",
    "vnx-competitive-advantage-grid",
    "vnx-edge-performance-dashboard",
    "vnx-model-size-comparison",
    "vnx-performance-comparison",
    "vnx-research-timeline",
    "vnx-scalability-visualization",
    "vnx-sustainability-infographic",
    "vnx-verifiability-diagram",
}

README_REQUIRED_TEXT = [
    "Vera OS",
    "Verifiable prediction infrastructure for Hedera-native AI agents",
    "PredictionService",
    "HederaSpecialistSwarm",
    "docs/visuals/vnx-edge-performance-dashboard-png.png",
    "docs/visuals/vnx-architecture-diagram-png.png",
]


class Validator:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0

    def check(self, condition: bool, message: str) -> None:
        if condition:
            self.passed += 1
            print(f"PASS: {message}")
        else:
            self.failed += 1
            print(f"FAIL: {message}")

    def section(self, title: str) -> None:
        print(f"\n{title}")
        print("-" * len(title))


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        signature = handle.read(8)
        if signature != b"\x89PNG\r\n\x1a\n":
            raise ValueError("invalid PNG signature")
        chunk_length = handle.read(4)
        chunk_type = handle.read(4)
        if len(chunk_length) != 4 or chunk_type != b"IHDR":
            raise ValueError("missing PNG IHDR chunk")
        width, height = struct.unpack(">II", handle.read(8))
    return width, height


def visual_slug(path: Path) -> str:
    name = path.name
    return name.removesuffix("-png.png").removesuffix("-svg.svg")


def validate_imports(v: Validator) -> None:
    v.section("Public Package")
    sys.path.insert(0, str(ROOT))
    package = importlib.import_module("vera_os")
    for export in sorted(EXPECTED_EXPORTS):
        v.check(hasattr(package, export), f"vera_os exports {export}")

    assets = package.get_visual_assets()
    v.check(len(assets) == len(EXPECTED_VISUAL_SLUGS), "visual asset helper returns all assets")
    v.check(all(asset.png.exists() and asset.svg.exists() for asset in assets), "visual asset helper paths exist")


def validate_docs(v: Validator) -> None:
    v.section("Documentation")
    for relative, required_terms in EXPECTED_DOCS.items():
        path = ROOT / relative
        v.check(path.exists(), f"{relative} exists")
        if path.exists():
            text = path.read_text(encoding="utf-8")
            for term in required_terms:
                v.check(term in text, f"{relative} contains '{term}'")


def validate_examples(v: Validator) -> None:
    v.section("Examples")
    for relative in sorted(EXPECTED_EXAMPLES):
        path = ROOT / relative
        v.check(path.exists(), f"{relative} exists")
        if path.exists():
            try:
                ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except SyntaxError as exc:
                v.check(False, f"{relative} compiles ({exc})")
            else:
                v.check(True, f"{relative} compiles")


def validate_readme(v: Validator) -> None:
    v.section("README")
    readme = ROOT / "README.md"
    v.check(readme.exists(), "README.md exists")
    if not readme.exists():
        return

    text = readme.read_text(encoding="utf-8")
    for term in README_REQUIRED_TEXT:
        v.check(term in text, f"README contains '{term}'")

    image_links = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", text)
    v.check(len(image_links) >= 3, "README includes at least three rendered images")
    for link in image_links:
        if link.startswith(("http://", "https://")):
            continue
        target = (ROOT / link.split("#", 1)[0]).resolve()
        v.check(target.exists() and ROOT in target.parents, f"README image link resolves: {link}")


def validate_visuals(v: Validator) -> None:
    v.section("Visual Assets")
    png_files = sorted(VISUALS_DIR.glob("*-png.png"))
    svg_files = sorted(VISUALS_DIR.glob("*-svg.svg"))
    png_slugs = {visual_slug(path) for path in png_files}
    svg_slugs = {visual_slug(path) for path in svg_files}

    v.check(png_slugs == EXPECTED_VISUAL_SLUGS, "all expected PNG visuals are present")
    v.check(svg_slugs == EXPECTED_VISUAL_SLUGS, "all expected SVG visuals are present")
    v.check(png_slugs == svg_slugs, "PNG and SVG visuals are paired")

    for path in png_files:
        try:
            width, height = png_dimensions(path)
        except Exception as exc:
            v.check(False, f"{path.name} is valid PNG ({exc})")
        else:
            v.check(width >= 800 and height >= 450, f"{path.name} is high-resolution ({width}x{height})")

    for path in svg_files:
        try:
            ET.parse(path)
        except ET.ParseError as exc:
            v.check(False, f"{path.name} is valid SVG XML ({exc})")
        else:
            v.check(True, f"{path.name} is valid SVG XML")


def main() -> int:
    v = Validator()
    validate_imports(v)
    validate_docs(v)
    validate_examples(v)
    validate_readme(v)
    validate_visuals(v)

    print("\nSummary")
    print("-------")
    print(f"Passed: {v.passed}")
    print(f"Failed: {v.failed}")
    if v.failed:
        print("Grade: NEEDS WORK")
        return 1
    print("Grade: RELEASE READY")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
