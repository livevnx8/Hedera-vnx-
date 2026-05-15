"""Shared filesystem paths for VNX.

The original research workspace used absolute local paths. The public release
uses repository-relative defaults with environment-variable overrides so the
same code works from a clone, editable install, Docker container, or production
mount.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(os.environ.get("VNX_HOME", Path(__file__).resolve().parents[1])).resolve()
SRC_DIR = Path(os.environ.get("VNX_SRC_DIR", ROOT / "src")).resolve()
MODELS_DIR = Path(os.environ.get("MODELS_DIR", ROOT / "models")).resolve()
DATA_DIR = Path(os.environ.get("VNX_DATA_DIR", ROOT / "data")).resolve()
TOKEN_DATA_DIR = Path(os.environ.get("VNX_TOKEN_DATA_DIR", DATA_DIR / "tokens")).resolve()
CACHE_DIR = Path(os.environ.get("VNX_CACHE_DIR", ROOT / "cache")).resolve()
LOGS_DIR = Path(os.environ.get("VNX_LOG_DIR", ROOT / "logs")).resolve()


def add_src_to_path() -> None:
    """Make the local `src` tree importable for BitLattice support modules."""
    src = str(SRC_DIR)
    root = str(ROOT)
    if src not in sys.path:
        sys.path.insert(0, src)
    if root not in sys.path:
        sys.path.insert(0, root)


def ensure_runtime_dirs() -> None:
    """Create runtime directories used by local caches and logs."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


__all__ = [
    "CACHE_DIR",
    "DATA_DIR",
    "LOGS_DIR",
    "MODELS_DIR",
    "ROOT",
    "SRC_DIR",
    "TOKEN_DATA_DIR",
    "add_src_to_path",
    "ensure_runtime_dirs",
]
