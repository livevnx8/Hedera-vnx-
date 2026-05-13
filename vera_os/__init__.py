"""Public Python facade for Vera OS.

Vera OS is verifiable prediction infrastructure for Hedera-native AI agents.
The package exposes stable entry points over the prediction engine, Hedera
specialist swarm, prediction market infrastructure, health checks, and visual
asset inventory.
"""

from .health import HealthService
from .markets import PredictionMarketService
from .prediction import PredictionService
from .specialists import HederaSpecialistSwarm
from .visuals import VisualAsset, get_visual_asset_pairs, get_visual_assets

__version__ = "0.3.0"

__all__ = [
    "HealthService",
    "HederaSpecialistSwarm",
    "PredictionMarketService",
    "PredictionService",
    "VisualAsset",
    "get_visual_asset_pairs",
    "get_visual_assets",
    "__version__",
]
