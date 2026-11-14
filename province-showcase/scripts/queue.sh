#!/usr/bin/env bash
# 可断点续跑的视频队列：完成一个记一笔（output/queue-done.txt），容器重启后重新执行本脚本即可接着跑
# 任务格式：省份 或 省份:force（重新挑原声）
cd "$(dirname "$0")/.." || exit 1
JOBS="内蒙古:force2 江苏:force2 吉林:force2 浙江:force2 湖北:force2 陕西 甘肃 青海 宁夏 新疆 广西:redo 山东:redo 安徽:redo 山西:redo 江西:redo 河北:redo 福建:redo 辽宁:redo"
touch output/queue-done.txt
for job in $JOBS; do
  grep -qx "$job" output/queue-done.txt && continue
  p="${job%%:*}"; flag=""; case "${job#*:}" in force*) flag="--force";; esac
  echo "===== $job $(date +%H:%M:%S)"
  python3 scripts/pick-clips.py "$p" $flag
  if node scripts/render-video.js "$p" > "output/render-$p.log" 2>&1; then
    echo "OK $p $(ffprobe -v error -show_entries format=duration -of csv=p=0 "output/videos/$p.mp4")s"
    echo "$job" >> output/queue-done.txt
  else
    echo "FAIL $p"; tail -3 "output/render-$p.log"
    echo "$job" >> output/queue-done.txt
  fi
  rm -f cache/clips/*.mp4
done
echo "===== QUEUE DONE $(date +%H:%M:%S)"
