#!/usr/bin/env bash
# 第3批结束后：日常提分去重影响到的已出片省份重新渲染（原声配置不变）
cd "$(dirname "$0")/.." || exit 1
until grep -q "ALL DONE" output/batch-3.log 2>/dev/null; do sleep 30; done
scripts/batch-video.sh 山东 安徽 山西 江西 河北 福建 辽宁 > output/batch-redo.log 2>&1
