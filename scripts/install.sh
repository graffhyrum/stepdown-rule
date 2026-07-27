#!/usr/bin/env bash
# Install stepdown-rule from GitHub Releases.
# Usage:
#   curl -fsSL https://graffhyrum.github.io/stepdown-rule/install | bash
#   VERSION=v0.2.0 bash install
set -euo pipefail

REPO="graffhyrum/stepdown-rule"
VERSION="${VERSION:-latest}"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$os" in
  linux) platform="linux" ;;
  darwin) platform="darwin" ;;
  mingw*|msys*|cygwin*)
    echo "Use install.ps1 on Windows (PowerShell)." >&2
    exit 1
    ;;
  *)
    echo "Unsupported OS: $os" >&2
    exit 1
    ;;
esac

case "$arch" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)
    echo "Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

asset="stepdown-rule-${platform}-${arch}"

if [[ "$VERSION" == "latest" ]]; then
  base_url="https://github.com/${REPO}/releases/latest/download"
else
  base_url="https://github.com/${REPO}/releases/download/${VERSION}"
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "Downloading ${asset} (${VERSION})..."
curl -fsSL "${base_url}/${asset}" -o "${tmpdir}/${asset}"
curl -fsSL "${base_url}/SHA256SUMS" -o "${tmpdir}/SHA256SUMS"

expected="$(awk -v f="$asset" '$2 == f { print $1; exit }' "${tmpdir}/SHA256SUMS")"
if [[ -z "$expected" ]]; then
  echo "SHA256SUMS missing entry for ${asset}" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "${tmpdir}/${asset}" | awk '{ print $1 }')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "${tmpdir}/${asset}" | awk '{ print $1 }')"
else
  echo "Need sha256sum or shasum to verify download." >&2
  exit 1
fi

if [[ "$actual" != "$expected" ]]; then
  echo "Checksum mismatch for ${asset}" >&2
  echo "  expected: ${expected}" >&2
  echo "  actual:   ${actual}" >&2
  exit 1
fi

install_dir="${INSTALL_DIR:-}"
if [[ -z "$install_dir" ]]; then
  if [[ -d "${HOME}/.local/bin" ]] || mkdir -p "${HOME}/.local/bin" 2>/dev/null; then
    install_dir="${HOME}/.local/bin"
  elif [[ -w /usr/local/bin ]]; then
    install_dir="/usr/local/bin"
  else
    install_dir="${HOME}/.local/bin"
    mkdir -p "$install_dir"
  fi
fi

chmod +x "${tmpdir}/${asset}"
install_path="${install_dir}/stepdown-rule"
cp "${tmpdir}/${asset}" "$install_path"
chmod +x "$install_path"

echo "Installed ${install_path}"
if ! command -v stepdown-rule >/dev/null 2>&1; then
  echo "Add to PATH: export PATH=\"${install_dir}:\$PATH\""
fi
"$install_path" --version
