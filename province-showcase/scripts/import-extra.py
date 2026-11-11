#!/usr/bin/env python3
"""
导入人工/OCR 整理的三张补充表，输出 data/extra/extra.json，供 build-data.js 合并：
  data/extra/高考喜报学员档案.xlsx  —— 喜报图片 OCR 档案（按“记录ID”与喜报库一一对应）
  data/extra/日常提分学员.xlsx      —— 日常提分案例学员（学科 + 成绩变化 + 省份 + 脱敏姓名）
  data/extra/学霸视频学员.xlsx      —— 学霸视频学员（省份 + 高考总分/单科 + 成绩变化）
"""
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
X = ROOT / 'data' / 'extra'
SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理']


def rows(name, sheet):
    ws = openpyxl.load_workbook(X / name, read_only=True, data_only=True)[sheet]
    it = ws.iter_rows(values_only=True)
    head = next(it)
    return [dict(zip(head, r)) for r in it]


# 常见姓氏（用于过滤 OCR 噪声，如“全国”“和YEELU”被识别成“全*”“和*”）
SURNAMES = set('王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤常温康施文牛樊葛邢安齐易乔伍庞颜倪庄聂章鲁岳翟殷詹申欧耿关兰焦俞左柳甘祝包宁尚符舒阮柯纪梅童凌毕单季裴霍涂成苗谷盛曲翁冉骆蓝路游辛靳管柴蒙鲍华喻祁蒲房滕屈饶解牟艾尤阳时穆农司卓古吉缪简车项连芦麦褚娄窦戚岑景党宫费卜冷晏席卫米柏宗瞿桂全佟应臧闵苟邬边卞姬师和仇栾隋商刁沙荣巫寇桑郎甄丛仲虞敖巩明佘池查麻苑迟邝官封谈匡鞠惠荆乐冀郁胥南班储原栗燕楚鄢劳谌奚皮粟冼蔺楼盘满闻位厉伊仝区郜海阚花权强帅屠豆朴盖练廉禹井祖漆巴丰支卿国狄平计索宣晋相初门云容敬来扈晁芮都普阙浦戈伏鹿薄邸雍辜羊阿乌母裘亓修邰赫杭况那宿鲜印逯隆茹诸战慕危玉银亢嵇公哈湛宾戎勾茅利於呼居揭干但尉冶斯元束檀衣信展阴昝智幸奉植衡富尧闭由')
OCR_NOISE_FIRST = set('全和国元贡昌习从')


def ok(v):
    return v not in (None, '', '待确认')


def singles(text):
    """'语文114分、数学120分、化学83分' / '高考总分：699分；物理：98分' -> [{subject, score}]
    超过满分或低于 30 的视为 OCR 误识别（多为文综/理综总分），丢弃"""
    out = []
    for s, v in re.findall(r'(语文|数学|英语|物理|化学|生物|政治|历史|地理)[：:\s]*(\d{2,3}(?:\.\d)?)分?', str(text or '')):
        score = float(v) if '.' in v else int(v)
        full = 150 if s in ('语文', '数学', '英语') else 100
        if score > full or score < 30:
            continue
        if not any(o['subject'] == s for o in out):
            out.append({'subject': s, 'score': score})
    return out


def num(v):
    m = re.search(r'\d{2,3}(?:\.\d)?', str(v or ''))
    return (float(m[0]) if '.' in m[0] else int(m[0])) if m else None


# ---------- 1. 喜报 OCR 档案 ----------
gaokao = {}
for r in rows('高考喜报学员档案.xlsx', '全量学员明细'):
    name = r['姓名'] if ok(r['姓名']) else None
    src = r['姓名来源'] or ''
    # OCR 识别的姓名只接受海报上的脱敏格式（含 *），避免把 OCR 噪声当作人名；文件名来源的姓名直接采用
    if name and not src.startswith('原始文件名') and not re.search(r'[*＊]', name):
        name = None
    if name and (not re.fullmatch(r'[一-龥*＊xX]{2,5}', name) or name.startswith(('*', '＊'))):
        name = None
    if name and not src.startswith('原始文件名') and (name[0] not in SURNAMES or name[0] in OCR_NOISE_FIRST):
        name = None
    rank = re.search(r'(\d+)', str(r['省排名'])) if ok(r['省排名']) else None
    gaokao[r['记录ID']] = {
        'province': r['省份'] if ok(r['省份']) and r['省份'] != '香港' else None,
        'name': name,
        'nameSource': src if name else None,
        'total': num(r['高考总分数值']) if ok(r['高考总分数值']) else None,
        'singles': singles(r['单科成绩']) if ok(r['单科成绩']) else [],
        'rank': int(rank[1]) if rank else None,
        'stream': r['科类'] if ok(r['科类']) else None,
        'school': r['录取院校'] if ok(r['录取院校']) else None,
        'before': num(r['高考前成绩']) if ok(r['高考前成绩']) else None,
        'gain': num(r['总分提升']) if ok(r['总分提升']) else None,
        'confidence': r['信息识别置信度'],
    }

# ---------- 2. 日常提分学员 ----------
daily = []
for r in rows('日常提分学员.xlsx', '学员信息'):
    m = re.match(r'(\d{1,3})[^\d→]*→(\d{1,3})', str(r['成绩变化'] or ''))
    name = r['学生姓名'] if r['学生姓名'] and not str(r['学生姓名']).startswith('*') else None
    daily.append({
        'subject': r['科目'], 'province': r['省份'], 'name': name,
        'from': int(m[1]) if m else None, 'to': int(m[2]) if m else None, 'text': r['成绩变化'],
    })

# ---------- 3. 学霸视频学员 ----------
video = []
for r in rows('学霸视频学员.xlsx', '学员信息'):
    tot = re.search(r'高考总分[：:]\s*(\d{3})', str(r['分数'] or ''))
    video.append({
        'name': r['学生姓名'], 'province': r['省份'], 'subjects': r['科目'],
        'total': int(tot[1]) if tot else None, 'singles': singles(r['分数']), 'change': r['成绩变化'],
    })

out = X / 'extra.json'
out.write_text(json.dumps({'gaokao': gaokao, 'daily': daily, 'video': video}, ensure_ascii=False))
print(out, len(gaokao), len(daily), len(video))
