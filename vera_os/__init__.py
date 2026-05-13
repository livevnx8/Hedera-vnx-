"""Public Python facade for Vera OS v2.

Seven layers of verifiable AI infrastructure for Hedera, exposed as stable
imports.  Pick what you need — each layer stands alone.

Layer 1  Hedera Core         HederaSpecialistSwarm
Layer 2  Predictions          PredictionService
Layer 3  Workflow Agents      WorkflowAgentService
Layer 4  Marketplace          MarketplaceService
Layer 5  Live Proof Loop      HCSProofEmitter, MirrorVerifier
Layer 6  Verifiable AI        FirstPartyAgentRegistry
Layer 7  Learning Lane        ProofLoopTracker, LessonEngine, UpgradePackageBuilder
"""

# Layer 1–4: core services
from .health import HealthService
from .intelligence import IntelligenceService
from .marketplace import MarketplaceService
from .markets import PredictionMarketService
from .prediction import PredictionService
from .specialists import HederaSpecialistSwarm
from .visuals import VisualAsset, get_visual_asset_pairs, get_visual_assets
from .workflows import WorkflowAgentService

# Layer 5: live proof loop
from src.hedera_proof.hcs_emitter import HCSProofEmitter
from src.hedera_proof.mirror_verifier import MirrorVerifier

# Layer 6: verifiable AI
from src.verifiable_ai.first_party_agents import FirstPartyAgentRegistry

# Layer 7: learning lane
from src.learning_lane.proof_loop_tracker import ProofLoopTracker
from src.learning_lane.lesson_engine import LessonEngine
from src.learning_lane.upgrade_packages import UpgradePackageBuilder

__version__ = "2.0.0"

__all__ = [
    # Layer 1–4
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
    # Layer 5: proof loop
    "HCSProofEmitter",
    "MirrorVerifier",
    # Layer 6: verifiable AI
    "FirstPartyAgentRegistry",
    # Layer 7: learning lane
    "ProofLoopTracker",
    "LessonEngine",
    "UpgradePackageBuilder",
    # meta
    "__version__",
]
