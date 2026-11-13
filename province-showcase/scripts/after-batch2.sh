#!/usr/bin/env bash
# 第2批结束后：重做内蒙古、江苏、吉林的原声片段（修正露出姓名/重复片段），再跑第3批
cd "$(dirname "$0")/.." || exit 1
until grep -q "ALL DONE" output/batch-2.log; do sleep 30; done
{
for p in 内蒙古 江苏 吉林; do
  echo "===== 修正 $p $(date +%H:%M:%S)"
  python3 scripts/pick-clips.py "$p" --force
  if node scripts/render-video.js "$p" > "output/render-$p.log" 2>&1; then echo "OK $p"; else echo "FAIL $p"; fi
  rm -f cache/clips/*.mp4
done
echo "===== FIX DONE"
} > output/batch-fix.log 2>&1
scripts/batch-video.sh 重庆 四川 贵州 云南 西藏 陕西 甘肃 青海 宁夏 新疆 > output/batch-3.log 2>&1
