#!/usr/bin/env python
# parse_bundang.py (READ-ONLY) — 분당 셔틀 엑셀 → 정규화 레코드 JSON
# 시트 '★2026 2분기 셔틀데이터': 한 행 = 학생-세션 1건. 등원(탑승시간)+하원(하차시간) 동시 보유.
import openpyxl, json, re, sys
SRC=r'C:/Users/user/Desktop/Colin 작업폴더/Raw/0616/버스 적용/분당_2026 유치부 & 초등부 셔틀문서.xlsx'
OUT=r'C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/분당_parsed.json'

def norm(s): return re.sub(r'\s+','',str(s or ''))
def split_name(s):
    s=str(s or '').strip()
    m=re.match(r'^(.*?)\s*\(([^)]*)\)\s*$', s)
    if m: return m.group(1).strip(), m.group(2).strip()
    return s, ''

def map_session(raw):
    n=norm(raw)
    if '유치부' in n:  # 유치부/유치부방과후 모두 유치부 세션
        return '유치부', ('방과후' if '방과후' in n else '정규')
    mwf = ('월수금' in n)
    tth = ('화목' in n)
    first = ('2시55' in n) or ('2:55' in n)
    second = ('5시10' in n) or ('5:10' in n) or ('5시05' in n)
    if mwf and first: return 'MWF 1st Block','정규'
    if mwf and second: return 'MWF 2nd Block','정규'
    if tth and first: return 'TTH 1st Block','정규'
    if tth and second: return 'TTH 2nd Block','정규'
    return None, 'UNKNOWN:'+n

def hhmm(v):
    if v is None or str(v).strip()=='' : return None
    s=str(v)
    m=re.search(r'(\d{1,2}):(\d{2})', s)
    if not m: return None
    return f"{int(m.group(1)):02d}:{m.group(2)}"

def _extract_bus(x):
    bm=re.search(r'\(?\s*(\d+)\s*호\)?', x)
    bus=bm.group(1) if bm else None
    x2=re.sub(r'\(?\s*\d+\s*호\)?','',x).replace('\n',' ').strip(' :：')
    x2=re.sub(r'\s+',' ',x2).strip()
    return (x2 or None), bus

def parse_stop(raw):
    # 반환: 등원정류장, 하원정류장, 등원호차오버라이드, 하원호차오버라이드
    s=str(raw or '').strip()
    if not s: return None,None,None,None
    if '승차' in s or '하차' in s:
        m=re.search(r'승차\s*[:：]?\s*(.*?)\s*하차\s*[:：]?\s*(.*)$', s, re.S)
        a,d=(m.group(1).strip(), m.group(2).strip()) if m else (s,s)
    else:
        a=d=s
    sa,ba=_extract_bus(a); sd,bd=_extract_bus(d)
    return sa,sd,ba,bd

wb=openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws=wb['★2026 2분기 셔틀데이터']
recs=[]; skipped=0
for row in ws.iter_rows(min_row=3, values_only=True):
    hak=row[1]; nm=row[2]; bus=row[8]; sess_raw=row[9]
    if not nm or not bus: skipped+=1; continue
    kor,eng=split_name(nm)
    if not kor: skipped+=1; continue
    days=[d for d,i in [('월',11),('화',12),('수',13),('목',14),('금',15)] if str(row[i] or '').strip().upper()=='O']
    sess_db,kind=map_session(sess_raw)
    busname=f"{int(float(bus))}호차" if re.match(r'^\d+(\.0)?$', str(bus).strip()) else str(bus).strip()
    sa,sd,ba,bd=parse_stop(row[16])
    recs.append({
        'hakbeon': str(hak).split('.')[0] if hak else None,
        'kor':kor,'eng':eng,
        'classname':row[4],'phone':row[5],
        'addr':row[6],'apt':row[7],
        'bus':busname,
        'session_raw':str(sess_raw),'session_db':sess_db,'kind':kind,
        'classtime':hhmm(row[10]),
        'days':days,
        'stop_arr':sa,'stop_dep':sd,        # 등원/하원 정류장 분리(승차/하차)
        'bus_arr':(f"{ba}호차" if ba else None),'bus_dep':(f"{bd}호차" if bd else None),  # 방향별 호차 오버라이드
        'arr_time':hhmm(row[17]),  # 탑승시간 = 등원
        'dep_time':hhmm(row[18]),  # 하차시간 = 하원
    })
wb.close()
import os; os.makedirs(os.path.dirname(OUT),exist_ok=True)
json.dump(recs, open(OUT,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
# summary
from collections import Counter
sc=Counter(r['session_db'] for r in recs)
unk=[r for r in recs if r['session_db'] is None]
print(f"parsed {len(recs)} rows, skipped {skipped}")
print("session_db dist:", dict(sc))
print("unmapped sessions:", Counter(r['session_raw'] for r in unk).most_common())
print("no-days rows:", sum(1 for r in recs if not r['days']))
print("sample:", json.dumps(recs[0], ensure_ascii=False))
