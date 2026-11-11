#!/usr/bin/env python3
"""
原创配乐合成（无版权风险）：120 BPM 喜庆进行曲风电子乐 + 转场音效
用法：make-music.py cues.json out.wav
cues.json: {"duration": 80, "impacts": [8, 14, ...], "duck": [[28, 36], ...], "introEnd": 8, "outroStart": 74}
"""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(7)

cues = json.load(open(sys.argv[1]))
DUR = cues['duration']
N = int(DUR * SR) + SR
L = np.zeros(N)
R = np.zeros(N)


def t_(n):
    return np.arange(n) / SR


def lp(x, f):
    return sosfilt(butter(2, f, 'low', fs=SR, output='sos'), x)


def hp(x, f):
    return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)


def bp(x, f1, f2):
    return sosfilt(butter(2, [f1, f2], 'band', fs=SR, output='sos'), x)


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gain * (1 - max(pan, 0))
    R[i:i + len(sig)] += sig * gain * (1 + min(pan, 0))


def env(n, a=0.005, d=0.2):
    t = t_(n)
    e = np.minimum(t / a, 1.0) if a > 0 else np.ones(n)
    return e * np.exp(-t / d)


def saw(freq, n, detune=0.0):
    t = t_(n)
    ph = (t * freq * (1 + detune)) % 1.0
    return 2 * ph - 1


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


# ---------- 乐器 ----------
def kick():
    n = int(0.45 * SR)
    t = t_(n)
    f = 45 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * 1.1


def clap():
    n = int(0.25 * SR)
    x = bp(rng.standard_normal(n), 900, 4000)
    e = np.exp(-t_(n) * 22)
    for k in (0.0, 0.012, 0.024):
        e += np.exp(-np.maximum(t_(n) - k, 0) * 120) * (t_(n) >= k) * 0.6
    return x * e * 0.5


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    return hp(rng.standard_normal(n), 7000) * np.exp(-t_(n) * (18 if open_ else 70)) * 0.25


def bass_note(m, dur):
    n = int(dur * SR)
    x = saw(mtof(m), n) + 0.5 * np.sin(2 * np.pi * mtof(m - 12) * t_(n))
    return lp(x, 380) * env(n, 0.004, dur * 0.9) * 0.55


def pad(chord, dur):
    n = int(dur * SR)
    x = np.zeros(n)
    for m in chord:
        for dt in (-0.006, 0, 0.006):
            x += saw(mtof(m), n, dt)
    x = lp(x / (len(chord) * 3), 2200)
    a = np.minimum(t_(n) / 0.08, 1) * np.minimum((dur - t_(n)) / 0.1, 1)
    return x * a * 0.32


def pluck(m, dur=0.25):
    n = int(dur * SR)
    x = saw(mtof(m), n) * 0.6 + np.sin(2 * np.pi * mtof(m) * t_(n))
    return lp(x, 3500) * env(n, 0.002, 0.09) * 0.22


def brass(chord, dur=0.5):
    n = int(dur * SR)
    x = sum(saw(mtof(m), n, dt) for m in chord for dt in (-0.004, 0.004))
    cutoff_env = 600 + 3000 * np.exp(-t_(n) * 6)
    y = lp(x / (len(chord) * 2), 2600) * (cutoff_env / cutoff_env.max())
    return y * env(n, 0.01, 0.35) * 0.5


def impact():
    n = int(2.2 * SR)
    t = t_(n)
    boom = np.sin(2 * np.pi * np.cumsum(30 + 70 * np.exp(-t * 9)) / SR) * np.exp(-t * 2.2)
    crash = hp(rng.standard_normal(n), 3000) * np.exp(-t * 2.8) * 0.35
    return (boom + crash) * 0.9


def riser(dur=2.0):
    n = int(dur * SR)
    t = t_(n)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 2048
    for i in range(0, n, seg):
        f = 400 + 9000 * (i / n) ** 2
        out[i:i + seg] = bp(x[i:i + seg], f * 0.7, min(f * 1.4, SR / 2 - 100))
    return out * (t / dur) ** 2 * 0.45


def whoosh(dur=0.5):
    n = int(dur * SR)
    t = t_(n)
    return bp(rng.standard_normal(n), 600, 5000) * np.sin(np.pi * t / dur) ** 2 * 0.35


def chime(m):
    n = int(1.5 * SR)
    t = t_(n)
    x = sum(np.sin(2 * np.pi * mtof(m) * k * t) / k for k in (1, 2.01, 3.03))
    return x * np.exp(-t * 3) * 0.12


def lead(m, dur=0.42):
    # 类拨弦主音色：基音 + 泛音，快速衰减
    n = int(dur * SR)
    t = t_(n)
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 9) + 0.25 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 14)
    return x * env(n, 0.003, 0.16) * 0.3


# C 大调五声：C5=72 D5=74 E5=76 G5=79 A5=81 C6=84；每小节 8 个八分音符
MELODY = [
    [76, 79, 81, 79, 76, 74, 72, 0],   # C
    [74, 76, 79, 76, 74, 0, 67, 69],   # G
    [72, 76, 81, 79, 76, 79, 81, 0],   # Am
    [84, 81, 79, 76, 77, 0, 74, 72],   # F
    [76, 79, 84, 81, 79, 76, 79, 0],   # C
    [74, 79, 83, 79, 74, 76, 79, 0],   # G
    [81, 84, 88, 84, 81, 79, 76, 79],  # Am
    [77, 81, 84, 81, 79, 77, 76, 74],  # F
]

# ---------- 编曲 ----------
PROG = [[60, 64, 67], [55, 59, 62, 67], [57, 60, 64], [53, 57, 60, 65]]  # C G Am F
ROOT = [36, 43, 45, 41]
PENTA = [72, 74, 76, 79, 81, 84]
intro_end = cues.get('introEnd', 8)
outro = cues.get('outroStart', DUR - 6)
bar = BEAT * 4
nbars = int(np.ceil(DUR / bar))

for b in range(nbars):
    t0 = b * bar
    ci = b % 4
    if t0 >= DUR:
        break
    in_intro = t0 < intro_end
    in_outro = t0 >= outro
    add(pad(PROG[ci], bar), t0, 0.8 if in_intro else 1.0)
    if in_intro:
        for k in range(8):  # 柔和琶音
            add(pluck(PROG[ci][k % len(PROG[ci])] + 12, 0.4), t0 + k * BEAT / 2, 0.8, pan=0.3 * (-1) ** k)
        continue
    for k in range(4):
        add(kick(), t0 + k * BEAT, 0.9)
        add(hat(open_=True), t0 + k * BEAT + BEAT / 2, 0.8, pan=0.2)
        for s in range(4):
            add(hat(), t0 + k * BEAT + s * BEAT / 4, 0.5, pan=-0.2)
    add(clap(), t0 + BEAT, 1.0)
    add(clap(), t0 + 3 * BEAT, 1.0)
    for k in range(8):
        add(bass_note(ROOT[ci] + (12 if k % 2 else 0), BEAT / 2), t0 + k * BEAT / 2, 1.0)
    if not in_outro:
        # 谱好的五声音阶主旋律（8 小节一循环，8 分音符网格，0 = 休止），带一次回声
        mel = MELODY[b % len(MELODY)]
        for k, m in enumerate(mel):
            if not m:
                continue
            t = t0 + k * BEAT / 2
            add(lead(m), t, 1.0, pan=-0.1)
            add(lead(m), t + BEAT * 0.75, 0.3, pan=0.4)
        for k in range(16):  # 轻量十六分琶音铺底
            add(pluck(PROG[ci][k % len(PROG[ci])] + 12, 0.15), t0 + k * BEAT / 4, 0.35, pan=0.3 * (-1) ** k)

# 结尾长和弦
add(pad([48, 60, 64, 67, 72], 4.0), DUR - 4.2, 1.1)
add(brass([60, 64, 67, 72], 2.5), DUR - 4.2, 1.0)

# 转场：冲击 + 铜管 + 前置上升音效
for t in cues.get('impacts', []):
    add(impact(), t, 0.9)
    add(brass([60, 64, 67, 72]), t, 0.8)
    if t - 2 > 0:
        add(riser(2.0), t - 2.0, 0.6)
for t in cues.get('whoosh', []):
    add(whoosh(), t - 0.25, 1.0)
for t in cues.get('chimes', []):
    add(chime(84), t, 1.0, pan=0.2)

# 学员原声段落压低音乐
gain = np.ones(N)
for a, b in cues.get('duck', []):
    i, j = int(a * SR), int(b * SR)
    ramp = int(0.4 * SR)
    gain[i:j] = 0.18
    gain[max(i - ramp, 0):i] = np.linspace(1, 0.18, i - max(i - ramp, 0))
    gain[j:j + ramp] = np.linspace(0.18, 1, len(gain[j:j + ramp]))
L *= gain
R *= gain

# 总线：淡出、软削波、归一化
fade = int(1.5 * SR)
end = int(DUR * SR)
for ch in (L, R):
    ch[end - fade:end] *= np.linspace(1, 0, fade)
    ch[end:] = 0
mix = np.stack([L[:end], R[:end]], 1)
mix = np.tanh(mix * 1.2)
mix /= np.abs(mix).max() / 0.89
wavfile.write(sys.argv[2], SR, (mix * 32767).astype(np.int16))
print(sys.argv[2], f'{DUR:.1f}s')
