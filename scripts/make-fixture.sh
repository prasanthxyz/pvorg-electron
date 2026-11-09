#!/usr/bin/env bash
# Builds a synthetic pvorg library for visual QA and the Playwright tour. Requires ffmpeg.
#   scripts/make-fixture.sh /tmp/pvorg-desktop-fixture
# It contains 21 valid videos (one with a very long title), an .mkv (Chromium plays it),
# an .avi (Chromium can't: the unplayable state), a damaged .mp4 (no contact sheet), two
# badly named files, eight galleries plus an empty one, stale config entries, and an old
# Electron library (pvorg.yml) for the import. Nothing outside <dir> is touched.
set -euo pipefail

DEST="${1:?usage: make-fixture.sh <destination-dir>}"
VID="$DEST/videos"
GAL="$DEST/galleries"

rm -rf "$DEST"
mkdir -p "$VID" "$GAL"

ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

videos=(
  "acme-jane_doe-harbor_lights"
  "acme-jane_doe-john_roe-mountain_pass"
  "acme-alex_kim-city_at_night"
  "globex-sam_lee-desert_road"
  "globex-maria_garcia-rainy_window"
  "globex-li_wei-priya_nair-summer_house"
  "initech-omar_haddad-coastline"
  "initech-jane_doe-night_train"
  "initech-alex_kim-golden_hour"
  "umbrella-priya_nair-river_bend"
  "umbrella-john_roe-winter_cabin"
  "umbrella-sam_lee-market_day"
  "hooli-li_wei-neon_alley"
  "hooli-maria_garcia-quiet_forest"
  "hooli-omar_haddad-alex_kim-open_road"
  "vandelay-jane_doe-sunrise_ridge"
  "vandelay-priya_nair-lakeside"
  "vandelay-john_roe-old_town"
  "acme-sam_lee-skyline"
  "globex-jane_doe-the_long_weekend"
  "initech-maria_garcia-a_very_long_title_that_should_truncate_gracefully_in_every_layout"
)

i=0
for name in "${videos[@]}"; do
  hue=$(( (i * 37) % 360 ))
  # Durations and sizes vary, so the video details and the Sort menu have something to show.
  seconds=$(( 6 + (i * 7) % 19 ))
  if (( i % 3 == 0 )); then size="1280x720"; else size="640x360"; fi
  ff -f lavfi -i "testsrc2=s=${size}:r=24:d=${seconds}" -vf "hue=h=${hue}:s=1.4" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$VID/$name.mp4"
  i=$((i + 1))
done

ff -f lavfi -i "testsrc=s=640x360:r=24:d=6" -c:v libx264 -preset ultrafast \
  -pix_fmt yuv420p "$VID/vandelay-omar_haddad-import_export.mkv"
ff -f lavfi -i "testsrc2=s=640x360:r=24:d=5" -c:v mpeg4 "$VID/hooli-sam_lee-old_camcorder.avi"
# Not a video at all: ffprobe fails, so it has no contact sheet or details.
head -c 4096 /dev/urandom > "$VID/umbrella-li_wei-damaged_tape.mp4"

ff -f lavfi -i "testsrc2=s=320x180:r=24:d=2" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$VID/Bad Name.mp4"
ff -f lavfi -i "testsrc2=s=320x180:r=24:d=2" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$VID/nodashes.mp4"

galleries=("Autumn Leaves" "Beach Days" "City Lights" "Mountain Trails" "Portraits" "Studio Sessions" "Vintage Film" "Wildlife")
g=0
for gallery in "${galleries[@]}"; do
  mkdir -p "$GAL/$gallery"
  count=$(( 5 + (g * 3) % 9 ))
  for n in $(seq 1 "$count"); do
    hue=$(( (g * 45 + n * 23) % 360 ))
    if (( n % 2 == 0 )); then size="800x1200"; else size="1200x800"; fi
    ff -f lavfi -i "mandelbrot=s=${size}:start_scale=$((2 + n % 4)):end_pts=1" -frames:v 1 \
      -vf "hue=h=${hue}:s=1.2" "$GAL/$gallery/image_$(printf '%02d' "$n").jpg"
  done
  g=$((g + 1))
done
mkdir -p "$GAL/Empty Gallery"

cat >"$DEST/pvorg.json" <<JSON
{
  "galleriesPath": "$GAL",
  "tags": ["4k", "classic", "favorites", "night", "outdoor", "travel"],
  "videoRelations": {
    "acme-jane_doe-harbor_lights.mp4": {
      "excludedGalleries": ["Portraits", "Wildlife"],
      "excludedTags": ["night"],
      "galleries": ["Beach Days", "City Lights"],
      "tags": ["outdoor", "travel"]
    },
    "globex-sam_lee-desert_road.mp4": {
      "excludedGalleries": ["Autumn Leaves", "Beach Days", "City Lights", "Empty Gallery", "Portraits", "Studio Sessions", "Vintage Film", "Wildlife"],
      "excludedTags": [],
      "galleries": ["Mountain Trails"],
      "tags": ["4k"]
    },
    "oldstudio-someone-deleted_clip.mp4": {
      "excludedGalleries": [],
      "excludedTags": [],
      "galleries": ["Portraits"],
      "tags": []
    },
    "oldstudio-someone-another_removed_clip.mp4": {
      "excludedGalleries": ["Wildlife"],
      "excludedTags": [],
      "galleries": [],
      "tags": ["classic"]
    }
  },
  "videosPath": "$VID"
}
JSON

# The old Electron app's library, as it stored it: absolute paths from another machine.
OLD_VID="/Users/someone/Movies/pvorg"
OLD_GAL="/Users/someone/Pictures/pvorg"
cat >"$DEST/pvorg.yml" <<YML
galleries:
  - $OLD_GAL/Beach Days
  - $OLD_GAL/City Lights
  - $OLD_GAL/Portraits
  - $OLD_GAL/Wildlife
  - $OLD_GAL/Old Holidays
tags:
  - outdoor
  - Night
  - drone
videoGalleries:
  - - $OLD_VID/acme-alex_kim-city_at_night.mp4
    - $OLD_GAL/City Lights
  - - $OLD_VID/acme-alex_kim-city_at_night.mp4
    - $OLD_GAL/Portraits
  - - $OLD_VID/hooli-li_wei-neon_alley.mp4
    - $OLD_GAL/City Lights
  - - $OLD_VID/umbrella-priya_nair-river_bend.mp4
    - $OLD_GAL/Wildlife
  - - $OLD_VID/umbrella-priya_nair-river_bend.mp4
    - $OLD_GAL/Beach Days
videoTags:
  - - $OLD_VID/acme-alex_kim-city_at_night.mp4
    - Night
  - - $OLD_VID/hooli-li_wei-neon_alley.mp4
    - Night
  - - $OLD_VID/umbrella-priya_nair-river_bend.mp4
    - outdoor
  - - $OLD_VID/umbrella-priya_nair-river_bend.mp4
    - drone
videos:
  - filePath: $OLD_VID/acme-alex_kim-city_at_night.mp4
    width: 640
    height: 360
    bitRate: 1500000
    duration: 0.25
    frameRate: 24
    quality: 4166666
  - filePath: $OLD_VID/hooli-li_wei-neon_alley.mp4
    width: 1280
    height: 720
    bitRate: 2500000
    duration: 0.4
    frameRate: 24
    quality: 25000000
  - filePath: $OLD_VID/umbrella-priya_nair-river_bend.mp4
    width: 640
    height: 360
    bitRate: 1100000
    duration: 0.3
    frameRate: 24
    quality: 3055555
  - filePath: $OLD_VID/oldstudio-gone-lost_reel.mp4
    width: 640
    height: 480
    bitRate: 900000
    duration: 1.2
    frameRate: 30
    quality: 900000
YML

echo "Fixture library created at $DEST"
