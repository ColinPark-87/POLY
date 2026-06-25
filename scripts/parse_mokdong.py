# -*- coding: utf-8 -*-
# 목동 셔틀(광명형 단일시트) → 정규화 JSON.
# 섹션 마커(매일반/월수금/화목/유치부+시간) → 호차행(N호차) → 데이터.
# 그룹열: 번호|이름|승차시간|승차장소|하차시간|하차장소|비고
import openpyxl, re, json
SRC='C:/Users/user/Desktop/Colin 작업폴더/Raw/0616/버스 적용/'
OUT='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
def cs(c):
    if c is None: return ''
    if hasattr(c,'strftime'):
        try: return c.strftime('%H:%M')
        except: return str(c)
    return str(c).replace('\n',' ').strip()
def classify(t):
    if re.search(r'유치|ECP',t,re.I): return '유치부'   # 목동 유치부 섹션은 'ECP (9:40-14:40)'로 표기
    if re.search(r'월수금|월·수·금',t): return '월수금'
    if re.search(r'화목|화·목',t): return '화목'
    if re.search(r'매일',t): return '매일반'
    return None

wb=openpyxl.load_workbook(SRC+'목동_셔틀노선현황_26학년도1학기.xlsx',data_only=True)
ws=wb['2026 1학기 셔틀']; rows=[[cs(c) for c in r] for r in ws.iter_rows(values_only=True)]
recs=[]; cur=None
def is_bus_header(r):
    line=' '.join(r)
    hpos=[j for j,c in enumerate(r) if re.search(r'\d+호차',c)]
    return (len(hpos)>=2 and '기사' in line), hpos
def is_section(r):
    line=' '.join(r); bh,_=is_bus_header(r)
    return (not bh) and classify(line) and re.search(r'\d+:\d+',line)
i=0
while i<len(rows):
    r=rows[i]; line=' '.join(r)
    if is_section(r):
        cur=classify(line); i+=1; continue
    bh,hpos=is_bus_header(r)
    if bh and cur:
        busat={j:re.search(r'(\d+)호차',r[j]).group(1)+'호차' for j in hpos}
        j=i+1
        while j<len(rows):
            rv=rows[j]
            jbh,_=is_bus_header(rv)
            if jbh or is_section(rv): break
            def clean(x):
                x=str(x or '').strip()
                if x=='-' or re.match(r'^\d+호차',x): return ''  # 크로스버스 참조/없음 → 정류장 비움
                return x
            for st in hpos:
                name=rv[st+1] if st+1<len(rv) else ''
                if not name or name in ('이름','번호'): continue
                recs.append({'classtime':cur,'hocha':busat[st],'name':name,
                    'arr':rv[st+2] if st+2<len(rv) else '',
                    'loc_arr':clean(rv[st+3] if st+3<len(rv) else ''),
                    'dep':rv[st+4] if st+4<len(rv) else '',
                    'loc_dep':clean(rv[st+5] if st+5<len(rv) else ''),
                    'address':'','dong':'',
                    'note':rv[st+6] if st+6<len(rv) else ''})
            j+=1
        i=j; continue
    i+=1
wb.close()
json.dump(recs,open(OUT+'목동_parsed.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
from collections import Counter
print(f"목동: {len(recs)}행 | classtime={dict(Counter(r['classtime'] for r in recs))}")
print("hocha:",dict(sorted(Counter(r['hocha'] for r in recs).items(),key=lambda x:int(x[0].replace('호차','')))))
print("샘플:",json.dumps(recs[0],ensure_ascii=False))
buses=sorted({r['hocha'] for r in recs},key=lambda x:int(x.replace('호차','')))
json.dump([{'name':b} for b in buses],open(OUT+'목동_buses.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('호차:',buses)
