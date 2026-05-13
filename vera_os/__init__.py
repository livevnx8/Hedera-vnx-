"""Public Python facade for Vera OS.

Vera OS is verifiable prediction infrastructure for Hedera-native AI agents.
The package keeps imports lightweight and exposes stable entry points over the
working prediction engine, Hedera specialist swarm, health checks, and visual
asset inventory.
"""

from .health import HealthService
from .prediction import PredictionService
from .specialists import HederaSpecialistSwarm
from .visuals import VisualAsset, get_visual_asset_pairs, get_visual_assets

__version__ = "0.2.0"

__all__ = [
    "HealthService",
    "HederaSpecialistSwarm",
    "PredictionService",
    "VisualAsset",
    "get_visual_asset_pairs",
    "get_visual_assets",
    "__version__",
]
