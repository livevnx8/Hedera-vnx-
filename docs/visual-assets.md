# Visual Assets

Vera OS includes professional visual assets in both **PNG** and **SVG** formats under `docs/visuals/`.

Use PNG files for GitHub READMEs, social previews, release notes, and quick presentation drops. Use SVG files when the visual needs to stay editable, scalable, or brand-adjustable.

## Inventory

| Slug | Use |
| --- | --- |
| `vnx-edge-performance-dashboard` | Executive performance and operational dashboard |
| `vnx-architecture-diagram` | System architecture overview |
| `vnx-bitlattice-architecture` | Compact model architecture |
| `vnx-accuracy-metrics` | Prediction quality and accuracy breakdown |
| `vnx-performance-comparison` | Performance comparison visual |
| `vnx-competitive-advantage-grid` | Positioning and advantage grid |
| `vnx-model-size-comparison` | Model footprint comparison |
| `vnx-scalability-visualization` | Scalability story |
| `vnx-verifiability-diagram` | Verification and audit flow |
| `vnx-sustainability-infographic` | Efficiency and sustainability story |
| `vnx-research-timeline` | Project timeline |

## Programmatic Access

```python
from vera_os import get_visual_assets

for asset in get_visual_assets():
    print(asset.title, asset.png, asset.svg)
```

The release validator checks that every visual has a PNG/SVG pair, that PNG files have valid headers and usable dimensions, and that SVG files parse as XML.
