#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: gh-release.sh <version> <notes>}"
NOTES="${2:?Usage: gh-release.sh <version> <notes>}"

ASSETS=()
while IFS= read -r f; do
  ASSETS+=("$f")
done < <(find target/release/bundle \
  \( -name "*.dmg" -o -name "*.msi" -o -name "*.exe" -o -name "*.deb" -o -name "*.AppImage" \) \
  2>/dev/null)

if [[ ${#ASSETS[@]} -eq 0 ]]; then
  echo "Error: no release assets found in target/release/bundle/" >&2
  exit 1
fi

echo "Attaching ${#ASSETS[@]} asset(s):"
printf '  %s\n' "${ASSETS[@]}"

gh release create "$VERSION" \
  --title "$VERSION" \
  --notes "$NOTES" \
  "${ASSETS[@]}"
