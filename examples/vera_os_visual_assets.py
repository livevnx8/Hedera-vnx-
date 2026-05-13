#!/usr/bin/env python3
"""List Vera OS visual assets for README, docs, or presentation use."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vera_os import get_visual_assets


def main() -> None:
    assets = get_visual_assets()
    print(f"Vera OS visual assets: {len(assets)}")
    for asset in assets:
        print(f"- {asset.title}:")
        print(f"  PNG: {asset.png}")
        print(f"  SVG: {asset.svg}")


if __name__ == "__main__":
    main()
