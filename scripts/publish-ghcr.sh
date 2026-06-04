#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REGISTRY="${REGISTRY:-ghcr.io}"
OWNER="${OWNER:-yoonhero}"
IMAGE_NAME="${IMAGE_NAME:-kicearena}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
PLATFORM="${PLATFORM:-linux/amd64}"
IMAGE="${IMAGE:-$REGISTRY/$OWNER/$IMAGE_NAME}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running or not reachable." >&2
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required." >&2
  exit 1
fi

echo "Publishing $IMAGE:$TAG and $IMAGE:latest for $PLATFORM"
echo "If needed, log in first: echo \"\$GHCR_TOKEN\" | docker login ghcr.io -u \"$OWNER\" --password-stdin"

docker buildx build \
  --platform "$PLATFORM" \
  --tag "$IMAGE:$TAG" \
  --tag "$IMAGE:latest" \
  --push \
  .
