"""Public Python facade for Vera OS.

Vera OS is verifiable prediction infrastructure for Hedera-native AI agents.
The package exposes stable entry points over the prediction engine, Hedera
specialist swarm, prediction market infrastructure, health checks, visual
asset inventory, agent marketplace, AI intelligence backbone, live Hedera
proof loops, verifiable AI agents, and the learning lane.
"""

from .health import HealthService
from .markets import PredictionMarketService
from .prediction import PredictionService
from .specialists import HederaSpecialistSwarm
from .visuals import VisualAsset, get_visual_asset_pairs, get_visual_assets
from .workflows import WorkflowAgentService
from .marketplace import MarketplaceService
from .intelligence import IntelligenceService

# v2: Proof Loop + Verifiable AI + Learning Lane
from src.hedera_proof.hcs_emitter import HCSProofEmitter
from src.hedera_proof.mirror_verifier import MirrorVerifier
from src.verifiable_ai.first_party_agents import FirstPartyAgentRegistry
from src.learning_lane.proof_loop_tracker import ProofLoopTracker
from src.learning_lane.lesson_engine import LessonEngine
from src.learning_lane.upgrade_packages import UpgradePackageBuilder

__version__ = "2.0.0"

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
    # v2
    "HCSProofEmitter",
    "MirrorVerifier",
    "FirstPartyAgentRegistry",
    "ProofLoopTracker",
    "LessonEngine",
    "UpgradePackageBuilder",
    "__version__",
]
