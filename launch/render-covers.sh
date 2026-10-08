#!/usr/bin/env bash
# Renders all covers at 2x and downscales them. Usage: bash launch/render-covers.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node launch/build.mjs
OUT=launch/work/covers
mkdir -p "$OUT" launch/covers launch/itch
r() { npx tsx video/render.mjs --script "launch/scripts/$1" --out "$OUT" --fps 30 --jobs 1 --w "$2" --h "$3" --png 1 --force 1 2>&1 | grep -v ' 404' || true; }
r cover_1920x1080.json 3840 2160
r cover_800x1200.json 1600 2400
r cover_800x800.json 1600 1600
r cover_630x500.json 1260 1000
ds() { ffmpeg -loglevel error -y -i "$OUT/$1_f30.png" -vf "scale=$2:$3:flags=lanczos" -pix_fmt rgb24 "$4"; }
ds cg_landscape 1920 1080 launch/covers/crazygames_cover_landscape_1920x1080.png
ds cg_portrait 800 1200 launch/covers/crazygames_cover_portrait_800x1200.png
ds cg_square 800 800 launch/covers/crazygames_cover_square_800x800.png
ds itch_cover 630 500 launch/itch/itch_cover_630x500.png
echo covers done
