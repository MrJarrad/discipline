#!/usr/bin/env bash
# Rehomed here in 1.79.0 from the archived fleet-scripts sibling; the body is
# byte-identical to that copy — pure git/rsync, no editor or payload dependency.
#
# Clone (or convert) a GitHub repo into the JHD container template:
#   $dest/.bare/                 gitdir
#   $dest/main/                  default-branch worktree
#   $dest/worktrees/<slug>/      extra worktrees
#
# Git cannot nest worktrees inside a working tree — add the main worktree only
# after $dest is at its final path (never mv a registered worktree).
#
# Usage:
#   jhd-container-clone.sh MrJarrad/jhd-vault ~/JHD/vault
#   jhd-container-clone.sh MrJarrad/jhd-vault ~/JHD/vault main
#   jhd-container-clone.sh jhd-vault ~/JHD/vault
set -euo pipefail

RAW="${1:?usage: jhd-container-clone.sh owner/name dest [branch]}"
DEST="${2:?usage: jhd-container-clone.sh owner/name dest [branch]}"
BRANCH="${3:-}"
if [[ "$RAW" == */* ]]; then
  NWO="$RAW"
else
  NWO="MrJarrad/$RAW"
fi
REMOTE_BASE="${JHD_FLEET_REMOTE_BASE:-https://github.com}"
URL="$REMOTE_BASE/$NWO.git"

mkdir -p "$(dirname "$DEST")"

overlay_main() {
  local overlay="$1" main="$2"
  [ -d "$overlay" ] || return 0
  rsync -a \
    --exclude .git \
    --exclude node_modules \
    --exclude .next \
    --exclude .build \
    --exclude dist \
    "$overlay/" "$main/"
  rm -rf "$overlay"
}

# Already a container?
if [ -d "$DEST/.bare" ] && { [ -f "$DEST/main/.git" ] || [ -d "$DEST/main/.git" ]; }; then
  echo "==> container exists: $DEST"
  git --git-dir="$DEST/.bare" fetch --prune origin 2>/dev/null || true
  git -C "$DEST/main" pull --ff-only 2>/dev/null \
    || echo "    WARNING: could not fast-forward $DEST/main"
  exit 0
fi

has_branch() {
  git --git-dir="$1" rev-parse --verify "$2" >/dev/null 2>&1 \
    || git --git-dir="$1" rev-parse --verify "origin/$2" >/dev/null 2>&1
}

default_branch() {
  local gitdir="$1"
  local br
  br="$(git --git-dir="$gitdir" symbolic-ref --short HEAD 2>/dev/null || true)"
  if [ -n "$br" ] && has_branch "$gitdir" "$br"; then
    echo "$br"
    return 0
  fi
  for cand in main master; do
    if has_branch "$gitdir" "$cand"; then
      echo "$cand"
      return 0
    fi
  done
  echo ""
}

finish_main() {
  local dest="$1"
  local branch="${2:-}"
  mkdir -p "$dest/worktrees"
  if [ -z "$branch" ]; then
    branch="$(default_branch "$dest/.bare")"
  fi
  if [ -z "$branch" ] || ! has_branch "$dest/.bare" "$branch"; then
    echo "==> empty remote parked as bare-only: $dest"
    return 0
  fi
  git --git-dir="$dest/.bare" worktree add "$dest/main" "$branch"
  git -C "$dest/main" branch -u "origin/$branch" 2>/dev/null || true
  echo "==> ready $dest/main ($branch)"
}

# Incomplete container (bare present, main missing) — finish or park empty.
if [ -d "$DEST/.bare" ]; then
  echo "==> completing container $DEST"
  git --git-dir="$DEST/.bare" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
  git --git-dir="$DEST/.bare" fetch origin 2>/dev/null || true
  finish_main "$DEST" "$BRANCH"
  exit 0
fi

# Flat checkout at dest — convert in place (working tree copied onto main).
if [ -d "$DEST/.git" ]; then
  echo "==> converting flat clone $DEST -> container"
  TMP="${DEST}.container-new"
  BAK="${DEST}.flat-bak"
  rm -rf "$TMP"
  mkdir -p "$TMP/worktrees"
  git clone --bare "$URL" "$TMP/.bare"
  git --git-dir="$TMP/.bare" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
  git --git-dir="$TMP/.bare" fetch origin
  # Copy the live tree aside; do not register a worktree until DEST is final.
  mkdir -p "$TMP/main-overlay"
  rsync -a --exclude .git "$DEST/" "$TMP/main-overlay/"
  mv "$DEST" "$BAK"
  mv "$TMP" "$DEST"
  finish_main "$DEST" "$BRANCH"
  overlay_main "$DEST/main-overlay" "$DEST/main"
  echo "==> converted $DEST (flat backup: $BAK)"
  exit 0
fi

if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
  echo "ERROR: $DEST exists and is not a git clone or container" >&2
  exit 1
fi

echo "==> cloning $NWO -> $DEST (container)"
mkdir -p "$DEST/worktrees"
git clone --bare "$URL" "$DEST/.bare"
git --git-dir="$DEST/.bare" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git --git-dir="$DEST/.bare" fetch origin 2>/dev/null || true
finish_main "$DEST" "$BRANCH"
