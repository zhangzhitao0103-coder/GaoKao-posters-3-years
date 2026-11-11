#!/usr/bin/env python3
"""把 data/provinces/*.json 导出为 31 省学员信息汇总 Excel（内部使用）。"""
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'output' / '31省优秀学员信息汇总.xlsx'
summary = json.loads((ROOT / 'data' / 'summary.json').read_text())
provs = [json.loads((ROOT / 'data' / 'provinces' / f"{s['province']}.json").read_text()) for s in summary]

HEAD_FILL = PatternFill('solid', fgColor='B71C1C')
HEAD_FONT = Font(bold=True, color='FFFFFF')

wb = Workbook()


def sheet(title, headers, rows, widths=None):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for c in ws[1]:
        c.fill, c.font = HEAD_FILL, HEAD_FONT
        c.alignment = Alignment(horizontal='center', vertical='center')
    for r in rows:
        ws.append(r)
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(i)].width = (widths or {}).get(h, max(8, len(h) * 2 + 2))
    return ws


hl = lambda x: '、'.join(x.get('highlights') or [])

wb.remove(wb.active)
sheet('各省汇总',
      ['省份', '状元', '清北', '名校(含状元)', '600分以上', '总分高分', '单科高分', '高考提分', '日常提分', '日常提分老师数', '学员视频'],
      [[s['province'], s['champion'], s['qingbei'], s['school'], s['high600'], s['total'], s['single'], s['improve'],
        s['daily'], s['dailyTeachers'], s['videos']] for s in summary])

rows = lambda key: [(p['province'], x) for p in provs for x in p['gaokao'][key]]

sheet('状元', ['省份', '年份', '状元称号', '姓名(打码)', '原始姓名', '高考成绩', '录取大学', '单科亮点'],
      [[p, x['year'], x['title'], x['name'], x['rawName'], x['scoreText'], x['school'], hl(x)] for p, x in rows('champion')],
      {'状元称号': 22, '录取大学': 18, '单科亮点': 20})
sheet('名校录取', ['省份', '年份', '姓名(打码)', '原始姓名', '录取大学', '高考总分', '单科亮点', '省排名'],
      [[p, x['year'], x['name'], x['rawName'], x['school'], x.get('totalScore'), hl(x), x.get('rank')] for p, x in rows('school')],
      {'录取大学': 20, '单科亮点': 20})
sheet('总分高分', ['省份', '年份', '姓名(打码)', '原始姓名', '高考总分', '单科亮点', '省排名', '科类'],
      [[p, x['year'], x['name'] or '（无姓名）', x['rawName'], x['totalScore'], hl(x), x.get('rank'), x.get('stream')] for p, x in rows('total')],
      {'单科亮点': 20})
sheet('单科高分', ['省份', '年份', '姓名(打码)', '原始姓名', '学科', '单科成绩', '高考总分', '省排名'],
      [[p, x['year'], x['name'] or '（无姓名）', x['rawName'], x['subject'], x['score'], x.get('totalScore'), x.get('rank')] for p, x in rows('single')])
sheet('高考提分', ['省份', '年份', '学科', '提分前', '提分后', '提升分数', '原始描述'],
      [[p, x['year'], x.get('subject'), x.get('fromText') or x.get('from'), x.get('to'), x.get('delta'), x['text']] for p, x in rows('improve')],
      {'原始描述': 36})
sheet('日常提分', ['省份', '学科', '主讲老师', '学员(打码)', '分数段', '提分前', '提分后', '提升分数', '原始描述', '省份来源'],
      [[p['province'], x['subject'], x['teacher'], x.get('student'), x['band'], x.get('fromText') or x.get('from'), x.get('to'), x.get('delta'), x['text'], x.get('provinceFrom') or '原数据']
       for p in provs for x in p['daily']],
      {'原始描述': 24})
sheet('学员视频', ['省份', '年份', '姓名(打码)', '原始姓名', '高考总分', '录取大学', '单科成绩', '成绩变化', '视频标题', '类型', '老师', '视频链接'],
      [[p['province'], x['year'], x['name'], x['rawName'], x['score'], x['school'], '、'.join(f"{s['subject']}{s['score']}" for s in x.get('singles') or []), x.get('change'), x['title'], x['category'], x['teacher'], x['url']]
       for p in provs for x in p['videos']],
      {'视频标题': 40, '录取大学': 18, '视频链接': 28})

rep_file = ROOT / 'data' / 'extra' / 'merge-report.json'
if rep_file.exists():
    sheet('补充表合并情况', ['补充项', '条数'], [[k, v] for k, v in json.loads(rep_file.read_text()).items()], {'补充项': 30})

note = wb.create_sheet('说明')
for line in [
    '数据来源：高考喜报库（2024-2026）、日常提分案例库、学霸视频库',
    '“押题学员反馈”不纳入；日常提分中未标注省份的案例无法归属，未纳入',
    '同一学员（同省同年、姓名首末字相同）跨类别只保留最高一档：状元 > 名校 > 总分高分 > 单科高分，低档信息合并到“单科亮点/高考总分”列',
    '“姓名(打码)”为海报/视频对外展示用；“原始姓名”仅限内部核对，请勿外传',
    '已合并三张补充表（喜报OCR档案、日常提分学员、学霸视频学员）：补充省排名、单科成绩、姓名、日常案例省份与学员等，见“补充表合并情况”',
    'OCR识别的姓名只采用海报脱敏格式且姓氏常见的；超过满分或低于30的单科分视为误识别已剔除',
]:
    note.append([line])
note.column_dimensions['A'].width = 110

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print(OUT)
