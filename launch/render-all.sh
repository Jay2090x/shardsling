#!/usr/bin/env bash
# Renders every store asset from launch/scripts (see launch/build.mjs). Resumable: finished stages are skipped
# unless FORCE=1. Usage: nohup bash launch/render-all.sh > launch/work/render-all.log 2>&1 &
set -euo pipefail
cd "$(dirname "$0")/.."
node launch/build.mjs
W=launch/work
mkdir -p $W launch/crazygames launch/itch/screenshots
R() { # script outdir w h fps [png]
  npx tsx video/render.mjs --script "launch/scripts/$1" --out "$W/$2" --fps "$5" --jobs "${JOBS:-3}" --w "$3" --h "$4" ${6:+--png 1} --force 1 2>&1 | grep -v ' 404' || true
}
need() { [ -n "${FORCE:-}" ] || [ ! -s "$1" ]; }
ds() { ffmpeg -loglevel error -y -i "$1" -vf "scale=$2:$3:flags=lanczos" -pix_fmt rgb24 "$4"; }

echo "== covers $(date +%T)"
if need launch/crazygames/crazygames_cover_landscape_1920x1080.png; then
  R cover_1920x1080.json covers 3840 2160 30 png
  R cover_800x1200.json covers 1600 2400 30 png
  R cover_800x800.json covers 1600 1600 30 png
  R cover_630x500.json covers 1260 1000 30 png
  ds $W/covers/cg_landscape_f0.png 1920 1080 launch/crazygames/crazygames_cover_landscape_1920x1080.png
  ds $W/covers/cg_portrait_f0.png 800 1200 launch/crazygames/crazygames_cover_portrait_800x1200.png
  ds $W/covers/cg_square_f0.png 800 800 launch/crazygames/crazygames_cover_square_800x800.png
  ds $W/covers/itch_cover_f0.png 630 500 launch/itch/itch_cover_630x500.png
  # itch "click to play" background (16:9, no text needed: itch draws its own Play button over it)
  ds $W/covers/cg_landscape_f0.png 1280 720 launch/itch/itch_embed_background_1280x720.png
fi

echo "== screenshots $(date +%T)"
if need launch/itch/screenshots/shardsling_04_boss.png; then
  R screenshots.json shots 1920 1080 30 png
  i=1
  for s in ss_swing ss_combo ss_enemies ss_boss; do
    n=$(printf %02d $i)
    case $s in ss_swing) name=swing;; ss_combo) name=combo;; ss_enemies) name=enemies;; ss_boss) name=boss;; esac
    ffmpeg -loglevel error -y -i $W/shots/${s}_f0.png -pix_fmt rgb24 launch/itch/screenshots/shardsling_${n}_${name}.png
    i=$((i+1))
  done
fi

# clips come out of the JPEG pipe as full-range BT.601; deliver standard limited-range BT.709 (most compatible)
TV="scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p"
TAGS="-color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709"
xf() { # out a b c  (shots 6.6/6.0/6.0 s, 0.3 s cross-fades -> 18.0 s), silent H.264 MP4
  ffmpeg -loglevel error -y -i "$2" -i "$3" -i "$4" -filter_complex \
    "[0:v][1:v]xfade=transition=fade:duration=0.3:offset=6.3[a];[a][2:v]xfade=transition=fade:duration=0.3:offset=12.0,$TV[v]" \
    -map "[v]" -an -c:v libx264 -preset slow -crf 18 -profile:v high -r 60 $TAGS -movflags +faststart "$1"
}
echo "== preview landscape $(date +%T)"
if need launch/crazygames/crazygames_preview_landscape_1920x1080.mp4; then
  R preview_landscape.json pv_landscape 1920 1080 60
  xf launch/crazygames/crazygames_preview_landscape_1920x1080.mp4 $W/pv_landscape/pv_landscape_{1,2,3}.mp4
fi
echo "== preview portrait $(date +%T)"
if need launch/crazygames/crazygames_preview_portrait_1080x1620.mp4; then
  R preview_portrait.json pv_portrait 1080 1620 60
  xf launch/crazygames/crazygames_preview_portrait_1080x1620.mp4 $W/pv_portrait/pv_portrait_{1,2,3}.mp4
fi
echo "== trailer $(date +%T)"
if need launch/itch/itch_trailer_1920x1080.mp4; then
  R trailer.json trailer 1920 1080 60
  npx tsx video/assemble.mjs --script launch/scripts/trailer.json --clips $W/trailer --out launch/itch/itch_trailer_1920x1080.mp4 --fps 60 2>&1 | grep -v ' 404' || true
  rm -f launch/itch/itch_trailer_1920x1080.raw.wav launch/itch/itch_trailer_1920x1080.video.mp4
  mv launch/itch/itch_trailer_1920x1080.mp4 $W/trailer_fullrange.mp4
  ffmpeg -loglevel error -y -i $W/trailer_fullrange.mp4 -vf "$TV" -c:v libx264 -preset slow -crf 18 -profile:v high $TAGS -c:a copy -movflags +faststart launch/itch/itch_trailer_1920x1080.mp4
fi
echo "== all done $(date +%T)"
