#!/usr/bin/env bash
# 容器重启后续跑：第2批剩余 → 修正内蒙古/江苏/吉林/浙江/湖北 → 第3批
cd "$(dirname "$0")/.." || exit 1
scripts/batch-video.sh 湖南 广东 广西 海南 > output/batch-2b.log 2>&1
{
for p in 内蒙古 江苏 吉林 浙江 湖北; do
  echo "===== 修正 $p $(date +%H:%M:%S)"
  python3 scripts/pick-clips.py "$p" --force
  if node scripts/render-video.js "$p" > "output/render-$p.log" 2>&1; then echo "OK $p"; else echo "FAIL $p"; fi
  rm -f cache/clips/*.mp4
done
echo "===== FIX DONE"
} > output/batch-fix.log 2>&1
scripts/batch-video.sh 重庆 四川 贵州 云南 西藏 陕西 甘肃 青海 宁夏 新疆 > output/batch-3.log 2>&1
