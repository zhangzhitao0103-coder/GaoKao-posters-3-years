#!/usr/bin/env bash
# 批量生成省份视频：挑原声 → 渲染 → 删除原始学员视频（只保留转写结果，节省磁盘）
# 用法：scripts/batch-video.sh 北京 天津 ...
cd "$(dirname "$0")/.." || exit 1
for p in "$@"; do
  echo "===== $p $(date +%H:%M:%S)"
  python3 scripts/pick-clips.py "$p"
  if node scripts/render-video.js "$p" > "output/render-$p.log" 2>&1; then
    echo "OK $p $(ffprobe -v error -show_entries format=duration -of csv=p=0 "output/videos/$p.mp4")s"
  else
    echo "FAIL $p (see output/render-$p.log)"
    tail -3 "output/render-$p.log"
  fi
  # 原始学员视频用完即删（转写 json 保留），避免占满磁盘
  rm -f cache/clips/*.mp4
done
echo "===== ALL DONE $(date +%H:%M:%S)"
