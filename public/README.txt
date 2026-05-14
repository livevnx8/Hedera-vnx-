VERA OASIS - Public Folder Structure
=====================================

ROOT (http://localhost:8080/):
  index.html          → Vera Oasis Chat (legacy main chat shell)
  vera-chat.html      → Alias for index.html
  vera-hq.html        → Vera Headquarters (conversation + rig + supervisor + events)
  vnx-lm.html         → VNX-LM Forge (browser ternary lattice model prototype)
  /hq                 → Friendly route for Vera Headquarters
  /forge              → Friendly route for VNX-LM Forge

VERA-OASIS/ (UI Components):
  nexus.html          → GitNexus-style graph visualization
  harmonics.html      → Resonance harmonics & balance
  lattice-3d.html     → 3D Flower of Life
  wallet.html         → HBAR wallet interface
  swarm-3d.html       → 3D swarm visualization

_DEPRECATED/ (Old Vera versions - do not use):
  *-dashboard.html files
  verabridge*.html files
  qvx-*.html files

All other interfaces moved to deprecated folder.
Only Vera Oasis is actively maintained.
