# Model Artifacts

Vera OS supports local model artifacts, but the public GitHub release should not
blindly commit heavyweight model files.

## Included In Code

The code expects model files under `MODELS_DIR`, which defaults to `./models`.
You can override it:

```bash
export MODELS_DIR=/path/to/vera-models
```

The production prediction engine looks for:

- `hbar_production.pt`
- `sauce_production.pt`
- `dovu_production.pt`

The VNX swarm engine also supports compact `.vnx` artifacts.

## What Not To Commit

Do not commit large local GGUF files, private fine-tunes, raw datasets, or
absolute symlinks to workstation storage. The current local workspace has
multi-gigabyte GGUF files and a symlinked `models` directory; those are suitable
for local operation, not a normal Git commit.

Use Git LFS or a release artifact bucket when publishing model binaries.
