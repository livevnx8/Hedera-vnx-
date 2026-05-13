"""Public Python facade for Vera OS.

Vera OS is verifiable prediction infrastructure for Hedera-native AI agents.
The package exposes stable entry points over the prediction engine, Hedera
specialist swarm, prediction market infrastructure, health checks, visual
asset inventory, agent marketplace, and AI intelligence backbone.
"""

from .health import HealthService
from .markets import PredictionMarketService
from .prediction import PredictionService
from .specialists import HederaSpecialistSwarm
from .visuals import VisualAsset, get_visual_asset_pairs, get_visual_assets
from .workflows import WorkflowAgentService
from .marketplace import MarketplaceService
from .intelligence import IntelligenceService

__version__ = "1.0.0"

__all__ = [
    "HealthService",
    "HederaSpecialistSwarm",
    "IntelligenceService",
    "MarketplaceService",
    "PredictionMarketService",
    "PredictionService",
    "VisualAsset",
    "WorkflowAgentService",
    "get_visual_asset_pairs",
    "get_visual_assets",
    "__version__",
]
