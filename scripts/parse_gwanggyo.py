#!/usr/bin/env python
# parse_gwanggyo.py (READ-ONLY) — 광교 '2026 차량' 시트 → 정규화 레코드 + 호차 메타.
# 구조: 8섹션(유치부/매일반/월수금반/화목반 × 등원/하원), 각 섹션에 5개 호차 컬럼그룹.
#   그룹 시작열 0/7/14/21/28 → 호차 1/2/3/5/6. 그룹내: +0 시간, +2 이름(영문), +4 승차위치.
import openpyxl, json, re, os
SRC=r'C:/Users/user/Desktop/Colin 작업폴더/Raw/0616/버스 적용/광교_셔틀노선_06162026xlsx.xlsx'
OUTD=r'C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
GROUPS=[(0,'1호차'),(7,'2호차'),(14,'3호차'),(21,'5호차'),(28,'6호차')]
SECT={  # 섹션라벨 키워드 → (session_db, days)
 '유치부':('유치부',['월','화','수','목','금']),
 '매일반':('1st Block',['월','화','수','목','금']),
 '월수금반':('2nd Block (MWF)',['월','수','금']),
 '화목반':('2nd Block (TTH)',['화','목']),
}
def split_name(s):
    s=str(s or '').strip()
    m=re.match(r'^(.*?)\s*\(([^)]*)\)\s*$', s)
    if m: return m.group(1).strip(), m.group(2).strip()
    ko=''.join(re.findall(r'[가-힣]',s))
    return (ko or s), ''
def hhmm(v):
    if v is None: return None
    m=re.search(r'(\d{1,2}):(\d{2})', str(v))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None
def is_name(s):
    s=str(s or '').strip()
    if not s: return False
    if not re.search(r'[가-힣]', s): return False
    if re.search(r'등원|하원|호차|승차|위치|시간|번호|개별|기사|선생|방과후|월수금|화목|매일|까지|파리|바게트|반$', s): return False
    if not re.search(r'\(', s) and len(re.findall(r'[가-힣]', s))>5: return False  # 긴 한글=노트
    return True

wb=openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws=wb['2026 차량']
rows=list(ws.iter_rows(values_only=True))
wb.close()

# 1) 섹션 헤더행 탐지: '등원'/'하원' + (유치부/매일반/월수금반/화목반)
sec_rows=[]
for ri,row in enumerate(rows):
    txt=' '.join(str(c) for c in row if c)
    mlabel=None
    for key in SECT:
        if key in txt and ('등원' in txt or '하원' in txt):
            mlabel=key; break
    if mlabel:
        direction='arr' if '등원' in txt else 'dep'
        sec_rows.append((ri,mlabel,direction))
# section data ranges
secs=[]
for i,(ri,label,direction) in enumerate(sec_rows):
    end=sec_rows[i+1][0] if i+1<len(sec_rows) else len(rows)
    secs.append((ri+1,end,label,direction))

recs=[]
for (start,end,label,direction) in secs:
    session_db,days=SECT[label]
    for ri in range(start,end):
        row=rows[ri]
        for (gc,bus) in GROUPS:
            nm = row[gc+2] if gc+2<len(row) else None
            if not is_name(nm): continue
            kor,eng=split_name(nm)
            stop=row[gc+4] if gc+4<len(row) else None
            tm=hhmm(row[gc+0])
            recs.append({'kor':kor,'eng':eng,'label':label,'session_db':session_db,
                'dir':direction,'days':days,'bus':bus,
                'stop':(str(stop).replace('\n',' ').strip() if stop else None),'time':tm})

# 2) 호차 메타(기사/안전) — R0 기사, R1 안전
def bus_meta():
    meta={}
    r0=rows[0]; r1=rows[1]
    for (gc,bus) in GROUPS:
        d=str(r0[gc] or ''); s=str(r1[gc] or '')
        dm=re.search(r'([가-힣]{2,4})\s*기사', d)
        sm=re.search(r'([가-힣]{2,4})\s*선생', s) or re.search(r'(Ms\.?\s*\w+)', s)
        meta[bus]={'name':bus,'driver':(dm.group(1)+' 기사님') if dm else None,
                   'safety':(sm.group(1) if sm else None)}
    return [meta[b] for _,b in GROUPS]

os.makedirs(OUTD,exist_ok=True)
json.dump(recs, open(OUTD+'광교_parsed.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(bus_meta(), open(OUTD+'광교_buses.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print('records',len(recs))
print('by section:',dict(Counter((r['label'],r['dir']) for r in recs)))
print('distinct students:',len(set((r['kor'],r['eng']) for r in recs)))
print('buses:',json.dumps(bus_meta(),ensure_ascii=False))
print('sample:',json.dumps(recs[0],ensure_ascii=False))
