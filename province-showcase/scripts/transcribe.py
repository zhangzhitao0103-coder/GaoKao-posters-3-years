#!/usr/bin/env python3
"""学员视频转文字（带时间戳），用于挑选“提分/感谢”精彩片段。用法：transcribe.py <mp4>... 输出同名 .json"""
import json
import sys
from pathlib import Path

import subprocess

import numpy as np
from faster_whisper import WhisperModel


def load_audio(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0

model = WhisperModel('small', device='cpu', compute_type='int8')
for f in sys.argv[1:]:
    out = Path(f).with_suffix('.json')
    if out.exists():
        continue
    segs, _ = model.transcribe(load_audio(f), language='zh', vad_filter=True, initial_prompt='以下是普通话的句子，有道领世，高考，提分，老师。')
    data = [{'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip()} for s in segs]
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print(f, len(data), flush=True)
