#!/bin/bash

# ============================================================
#  Rashmi Rao — Auto Compress & Upload Images to GitHub
#  Usage: bash upload-images.sh
# ============================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGES_DIR="$REPO_DIR/images"
COMPRESS_QUALITY=60          # JPEG quality (60 = great quality, smaller size)
MAX_SIZE_BYTES=4000000       # Compress images larger than 4MB
BATCH_SIZE=5                 # Number of images per git commit/push

echo ""
echo "🖼️  Rashmi Rao — Image Compress & GitHub Upload"
echo "================================================"
echo ""

cd "$REPO_DIR"

# ── Step 1: Find new/modified images not yet committed ─────────────────────────
echo "🔍 Scanning for new or modified images..."

NEW_IMAGES=()

# Get list of untracked and modified image files
while IFS= read -r -d '' file; do
  NEW_IMAGES+=("$file")
done < <(git ls-files --others --modified --exclude-standard -- 'images/*.jpg' 'images/*.jpeg' 'images/*.JPG' 'images/*.JPEG' 'images/*.png' 'images/*.PNG' -z 2>/dev/null)

if [ ${#NEW_IMAGES[@]} -eq 0 ]; then
  echo "✅ No new or modified images found. Everything is up to date!"
  echo ""
  exit 0
fi

echo "📂 Found ${#NEW_IMAGES[@]} new/modified image(s):"
for img in "${NEW_IMAGES[@]}"; do
  size=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
  size_mb=$(echo "scale=1; $size/1048576" | bc)
  echo "   → $img (${size_mb}MB)"
done
echo ""

# ── Step 2: Compress images that are too large ────────────────────────────────
echo "🗜️  Compressing large images (>${MAX_SIZE_BYTES} bytes → quality ${COMPRESS_QUALITY})..."

COMPRESSED_COUNT=0
for img in "${NEW_IMAGES[@]}"; do
  size=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
  if [ "$size" -gt "$MAX_SIZE_BYTES" ]; then
    size_before_mb=$(echo "scale=1; $size/1048576" | bc)
    sips -s formatOptions "$COMPRESS_QUALITY" "$img" --out "$img" > /dev/null 2>&1
    size_after=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
    size_after_mb=$(echo "scale=1; $size_after/1048576" | bc)
    echo "   ✅ $(basename "$img"): ${size_before_mb}MB → ${size_after_mb}MB"
    COMPRESSED_COUNT=$((COMPRESSED_COUNT + 1))
  else
    echo "   ⏭️  $(basename "$img"): small enough, skipping compression"
  fi
done

if [ "$COMPRESSED_COUNT" -gt 0 ]; then
  echo ""
  echo "   🎉 Compressed $COMPRESSED_COUNT image(s)."
fi
echo ""

# ── Step 3: Push to GitHub in batches ────────────────────────────────────────
echo "🚀 Pushing to GitHub in batches of $BATCH_SIZE..."
echo ""

TOTAL=${#NEW_IMAGES[@]}
PUSHED=0
BATCH_NUM=1

while [ $PUSHED -lt $TOTAL ]; do
  BATCH=("${NEW_IMAGES[@]:$PUSHED:$BATCH_SIZE}")
  BATCH_END=$((PUSHED + ${#BATCH[@]}))

  echo "   📦 Batch $BATCH_NUM: images $((PUSHED+1))–$BATCH_END of $TOTAL"

  # Stage this batch
  for img in "${BATCH[@]}"; do
    git add "$img"
  done

  # Commit
  TIMESTAMP=$(date "+%Y-%m-%d %H:%M")
  git commit -m "Add/update images — batch $BATCH_NUM ($TIMESTAMP)" > /dev/null 2>&1
  echo "   ✅ Committed batch $BATCH_NUM"

  # Push
  if git push origin HEAD:main 2>&1; then
    echo "   ✅ Pushed batch $BATCH_NUM to GitHub"
  else
    echo "   ❌ Push failed for batch $BATCH_NUM. Check your internet connection."
    echo "      You can retry by running: bash upload-images.sh"
    exit 1
  fi

  PUSHED=$((PUSHED + ${#BATCH[@]}))
  BATCH_NUM=$((BATCH_NUM + 1))
  echo ""
done

# ── Done ──────────────────────────────────────────────────────────────────────
echo "================================================"
echo "🎉 All $TOTAL image(s) compressed & uploaded to GitHub!"
echo "🔗 https://github.com/aashaythakkar2018/Rashmirao"
echo "================================================"
echo ""
