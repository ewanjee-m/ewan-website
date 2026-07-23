#!/bin/bash
# Rebuild every character GLB from the approved illustrations.
#
# The pipeline is:
#   1. key the green plate out of tmp/imagegen/*.png
#   2. generate a 3D body per character with TripoSR
#   3. convert to the engine axes, prune artefacts and decimate to the budget
#   4. crop each face out of the illustrations
#   5. rig, skin and export the shipped GLBs
#
# Steps 1-3 need Python with torch, trimesh, scikit-image and Pillow, plus a
# checkout of TripoSR. Point PYTHON and TRIPOSR at them. Steps 4-5 need only
# Node, so `--skip-sculpt` rebuilds the GLBs from the sculpts already in
# assets/sculpt/ without any Python at all.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-python3}"
TRIPOSR="${TRIPOSR:-}"
WORK="${WORK:-$REPO/.cache/character-build}"
SKIP_SCULPT=0

for argument in "$@"; do
  case "$argument" in
    --skip-sculpt) SKIP_SCULPT=1 ;;
    *) echo "unknown option: $argument" >&2; exit 2 ;;
  esac
done

# identity:source image:marching-cubes resolution
#
# The resolution no longer has to land on the triangle budget: convert-sculpt.py
# decimates to the target afterwards. It is set high so the isosurface carries
# real surface detail into the decimation, which reads better than extracting a
# coarse surface directly.
CHARACTERS=(
  "player-female:tmp/imagegen/player-female-chroma.png:256"
  "player-male:tmp/imagegen/player-male-chroma.png:256"
  "npc-airport-traveler:tmp/imagegen/npcs/airport-traveler-chroma.png:192"
  "npc-gyukatsu-chef:tmp/imagegen/npcs/gyukatsu-chef-chroma.png:208"
  "npc-sakura-visitor:tmp/imagegen/npcs/sakura-visitor-chroma.png:208"
  "npc-hanabi-yukata:tmp/imagegen/npcs/hanabi-yukata-chroma.png:208"
)

cd "$REPO"

if [ "$SKIP_SCULPT" -eq 0 ]; then
  if [ -z "$TRIPOSR" ]; then
    echo "TRIPOSR is not set. Clone https://github.com/VAST-AI-Research/TripoSR" >&2
    echo "and export TRIPOSR=/path/to/TripoSR, or pass --skip-sculpt." >&2
    exit 2
  fi
  mkdir -p "$WORK/keyed" "$REPO/assets/sculpt"

  for entry in "${CHARACTERS[@]}"; do
    identity="${entry%%:*}"
    rest="${entry#*:}"
    source_image="${rest%%:*}"
    resolution="${rest##*:}"

    echo "== $identity"
    "$PYTHON" scripts/prepare-chroma.py \
      --input "$source_image" --output "$WORK/keyed/$identity.png"

    mkdir -p "$WORK/$identity/0"
    (cd "$TRIPOSR" && "$PYTHON" run.py "$WORK/keyed/$identity.png" \
      --output-dir "$WORK/$identity" --device cpu --no-remove-bg \
      --mc-resolution "$resolution" --model-save-format glb >/dev/null)

    "$PYTHON" scripts/convert-sculpt.py \
      --input "$WORK/$identity/0/mesh.glb" \
      --output "$REPO/assets/sculpt/$identity.glb"
  done
fi

"$PYTHON" scripts/extract-face-crops.py
node scripts/generate-character-models.mjs

echo
echo "Rebuilt. Run 'npx vitest run tests/rpg-character-model-contract.test.ts"
echo "tests/rpg-character-native-height.test.ts' to check the model contract."
