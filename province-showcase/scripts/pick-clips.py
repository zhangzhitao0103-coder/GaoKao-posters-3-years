#!/usr/bin/env python3
"""
自动为某省挑选学员原声片段，写入 data/clips.json（已有人工配置的省份不覆盖，除非 --force）。
用法：pick-clips.py 北京 [--force]

步骤：
  1. 从该省学霸视频中选候选：单人录制优先、有分数/院校优先、每人只取一条，最多下载 4 条
  2. 语音转文字（scripts/transcribe.py，结果缓存为同名 .json）
  3. 给每句打分：
       时段1「成绩/录取」：含“高考/总分/录取/考入/大学”且有分数
       时段2「感谢/提分」：含“感谢”，或“提升/提高/进步/补回/从…到”
     每个时段最多取 2 句，尽量来自不同学员，单句 1.8–6 秒
  4. 输出两个时段的快剪配置；画面字幕使用视频自带字幕，底部文字用统一说明（不引用识别文本，避免错字）
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLIPS = ROOT / 'cache' / 'clips'
province = sys.argv[1]
force = '--force' in sys.argv

clips_file = ROOT / 'data' / 'clips.json'
conf = json.loads(clips_file.read_text())
d = json.loads((ROOT / 'data' / 'provinces' / f'{province}.json').read_text())
videos = d['videos']

if province in conf and not force:
    # 已有人工配置：只确保用到的视频文件在本地
    ids = {c['id'] for slot in conf[province] for c in (slot if isinstance(slot, list) else [slot])}
    for v in videos:
        f = CLIPS / f"{v['id']}.mp4"
        if v['id'] in ids and not (f.exists() and f.stat().st_size > 100000):
            CLIPS.mkdir(parents=True, exist_ok=True)
            subprocess.run(['curl', '-sSL', '-m', '600', '-o', str(f), v['url'].replace('https:', 'http:')], check=False)
    print(f'{province}: 使用已有配置，视频已就绪')
    sys.exit(0)


def rank(v):
    return (
        0 if v.get('category') == '单人录制' else 1,
        0 if v.get('score') else 1,
        0 if v.get('school') else 1,
        -(v.get('score') or 0),
    )


seen, cands = set(), []
for v in sorted(videos, key=rank):
    who = v.get('rawName') or v['id']
    # 同一学员常有多条视频（姓名写法可能不同），再按 分数+院校 去重
    same = (v.get('score'), v.get('school')) if v.get('score') and v.get('school') else None
    if who in seen or (same and same in seen):
        continue
    seen.add(who)
    if same:
        seen.add(same)
    cands.append(v)
    if len(cands) >= 4:
        break

CLIPS.mkdir(parents=True, exist_ok=True)
ready = []
for v in cands:
    f = CLIPS / f"{v['id']}.mp4"
    j = CLIPS / f"{v['id']}.json"
    if not j.exists() and not (f.exists() and f.stat().st_size > 100000):
        subprocess.run(['curl', '-sSL', '-m', '600', '-o', str(f), v['url'].replace('https:', 'http:')], check=False)
    if not j.exists() and f.exists() and f.stat().st_size > 100000:
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'transcribe.py'), str(f)], check=False)
    if j.exists() and f.exists():
        ready.append(v)

A_RE = re.compile(r'(高考|总分|录取|考入|考上|大学)')
SCORE_RE = re.compile(r'\d{3}|1[0-4]\d|分')
THANK_RE = re.compile(r'感谢|谢谢')
UP_RE = re.compile(r'提升|提高|进步|补回|突破|从.{0,6}到|逆袭')


def segments(v):
    segs = json.loads((CLIPS / f"{v['id']}.json").read_text())
    out = []
    # 「学员都考去哪了」系列开头是旁白+姓名字卡（会露出完整姓名），跳过旁白部分
    narrated = bool(segs) and '考去哪' in segs[0]['text']
    for i, s in enumerate(segs):
        dur = s['end'] - s['start']
        text = s['text']
        if narrated and (s['start'] < 8 or '认识' in text):
            continue
        # 太短的句子和下一句合并
        if dur < 1.8 and i + 1 < len(segs) and segs[i + 1]['end'] - s['start'] <= 6:
            text += segs[i + 1]['text']
            dur = segs[i + 1]['end'] - s['start']
        if not 1.8 <= dur <= 6:
            continue
        a = (3 if A_RE.search(text) else 0) + (2 if SCORE_RE.search(text) else 0)
        b = (4 if THANK_RE.search(text) else 0) + (2 if UP_RE.search(text) else 0)
        out.append({'v': v, 'start': s['start'], 'dur': dur, 'a': a if a >= 4 else 0, 'b': b})
    return out


allsegs = [s for v in ready for s in segments(v)]


def pick(key, n=2, avoid=()):
    chosen, used = [], set(avoid)
    for s in sorted(allsegs, key=lambda s: (-s[key], s['dur'])):
        if s[key] <= 0 or len(chosen) >= n:
            break
        who = s['v']['id']
        if who in used:
            continue
        used.add(who)
        chosen.append(s)
    return chosen


def cut(s):
    v = s['v']
    label = ' · '.join(x for x in [f"{v['score']}分" if v.get('score') else '', v.get('school') or ''] if x)
    return {'id': v['id'], 'ss': round(max(0, s['start'] - 0.1), 2), 'dur': round(s['dur'] + 0.25, 2), 'label': label or None}


slot1 = pick('a')
slot2 = pick('b', avoid=[s['v']['id'] for s in slot1]) or pick('b')
slots = [[cut(s) for s in sl] for sl in (slot1, slot2) if sl]
conf = json.loads(clips_file.read_text())
conf[province] = slots
clips_file.write_text(json.dumps(conf, ensure_ascii=False, indent=2))
print(f'{province}: 候选 {len(cands)} 条，可用 {len(ready)} 条，时段 {[len(x) for x in slots]}')
