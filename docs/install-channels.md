# Install channels

Two publish paths exist. Prefer **GitHub Release** assets for binaries and installers.

| Channel | Publishes | Trigger | Use when |
| --- | --- | --- | --- |
| **GitHub Release** | Cross-compiled binaries, `SHA256SUMS`, `install.sh`, `install.ps1` | Push tag `v*` (`.github/workflows/release.yml`) | Production installs; pin with `VERSION=vX.Y.Z` |
| **GitHub Pages** | Short URLs only: `/install`, `/install.ps1` (copies of the tagged install scripts) | Same `v*` tags (`.github/workflows/pages.yml`) | Convenience mirror of release installers |

## Integrity

- Binaries ship only on Releases with per-asset SHA256 digests in `SHA256SUMS`.
- `install.sh` / `install.ps1` download the matching Release asset and **refuse to install** on checksum mismatch.
- Pages does **not** host binaries. It only serves installer scripts from the tagged commit that created the release (not `main` HEAD).

## HEAD drift

Pages is pinned to release tags (`v*`), not continuous `main` deploys. Until the next tag, editing install scripts on `main` does not change Pages or Release assets. That avoids script drift vs published checksums.

## Commands

See [README Installation](../README.md#installation) for preferred (download → inspect → run) vs pipe-to-shell convenience forms. Release notes from `release.yml` match those README commands.
