#!/usr/bin/env bash
# 质检：从成片各场景中点抽帧，拼成一张总览图。用法：scripts/qa-sheet.sh 北京 out.jpg
cd "$(dirname "$0")/.." || exit 1
p="$1"; out="$2"; tmp=$(mktemp -d)
node -e '
const s=require("./output/video-work/'"$p"'/schedule.json");
console.log(s.scenes.map(x=>(x.name.startsWith("clip")?(x.start+1.2):(x.start+(x.end-x.start)*0.72)).toFixed(2)).join(" "))' > "$tmp/t"
i=0; for t in $(cat "$tmp/t"); do ffmpeg -v error -y -ss "$t" -i "output/videos/$p.mp4" -frames:v 1 -vf scale=216:-1 "$tmp/$(printf %02d $i).jpg"; i=$((i+1)); done
python3 - "$tmp" "$out" <<'PY'
import sys, glob
from PIL import Image
fs = sorted(glob.glob(sys.argv[1] + '/*.jpg'))
c = Image.new('RGB', (len(fs) * 219, 384), 'white')
for i, f in enumerate(fs): c.paste(Image.open(f), (i * 219, 0))
c.save(sys.argv[2], quality=85)
PY
rm -rf "$tmp"
