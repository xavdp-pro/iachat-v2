#!/usr/bin/env bash
# Create a public GitHub repo (via gh) and push main, or push if origin already exists.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Not logged in. Run first:"
  echo "  gh auth login"
  exit 1
fi

REPO_NAME="${1:-iachat-v1}"

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote origin already set. Pushing main..."
  git push -u origin main
else
  echo "Creating public repo '${REPO_NAME}' and pushing..."
  gh repo create "${REPO_NAME}" --public --source=. --remote=origin --push
fi

echo "Done. Repo: $(gh repo view --json url -q .url 2>/dev/null || echo '(check GitHub)')"
