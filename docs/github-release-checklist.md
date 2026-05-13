# GitHub Release Checklist

Use this checklist before making Vera OS public, tagging a release, or sending the repository for review.

## Required Checks

- Run `python3 tests/validate_vera_os_release.py`.
- Run `python3 tests/validate_infrastructure.py`.
- Run `python3 tests/smoke_test.py`.
- Run `docker compose -f docker-compose.production.yml config` with placeholder secrets.
- Confirm README images render on GitHub.
- Confirm every visual in `docs/visuals/` has both PNG and SVG versions.

## Security

- Confirm `.env` and `.env.production` are not committed.
- Confirm `.env.example` is committed as a template.
- Confirm no private Hedera keys, operator secrets, Redis passwords, database passwords, or API tokens are tracked.
- Use strong production values for `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, and `GRAFANA_PASSWORD`.
- Confirm local `models` symlinks, GGUF files, raw datasets, and private checkpoints are not staged unless intentionally published via Git LFS.

## Documentation

- README clearly says `Vera OS`.
- README includes **Verifiable prediction infrastructure for Hedera-native AI agents**.
- README shows the quick start, Python facade, API surface, specialist families, and visual gallery.
- Supporting docs explain prediction infrastructure, Hedera specialists, visual assets, and release checks.

## Professional Polish

- Keep public claims tied to checked artifacts or clearly marked benchmarks.
- Keep screenshots and visual links relative so GitHub can render them.
- Keep examples short, runnable, and explicit about operations that may load models or touch networks.
- Keep the release branch staged from a reviewed allowlist instead of the full working tree.
