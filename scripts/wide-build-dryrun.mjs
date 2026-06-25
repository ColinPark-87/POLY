#!/usr/bin/env node
// wide-build-dryrun.mjs <송도|송파>  (DRY-RUN)
// 가로형(호차 컬럼그룹×학생) 엑셀 파싱본 → DB enrollment 매칭 → arr/dep_schedule 빌드.
import fs from 'node:fs'
const CAMP=process.argv[2]||'송도'
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
const parsed=JSON.parse(fs.readFileSync(A+`${CAMP}_parsed.json`,'utf8'))
const dbf=fs.readdirSync(A).find(f=>f.endsWith(`_${CAMP}_enrollments.json`))
const db=JSON.parse(fs.readFileSync(A+dbf,'utf8'))

const norm=s=>(s||'').replace(/\s+/g,'')
const splitName=raw=>{const noParen=String(raw).replace(/\([^)]*\)/g,' ');const ko=(noParen.match(/[가-힣]/g)||[]).join('');const am=noParen.match(/[A-Za-z][A-Za-z .]*/);return{ko:ko||String(raw).trim(),alias:am?am[0].trim():''}}
const daysFromToken=tok=>{const ds=[];for(const ch of tok)if('월화수목금'.includes(ch))ds.push(ch);return ds}
// classtime → {division, days}
function classInfo(ct){
  const isYu=/유치/.test(ct)
  let days
  if(/매일|5일/.test(ct)||isYu) days=['월','화','수','목','금']
  else if(/월수금|3일/.test(ct)) days=['월','수','금']
  else if(/화목|2일/.test(ct)) days=['화','목']
  else if(/월수/.test(ct)) days=['월','수']
  else if(/^월\b|^월\s/.test(ct)) days=['월']
  else days=['월','화','수','목','금']
  return {isYu,days}
}
// 시간 정규화 (맥락별 AM/PM). 유치부 등원만 오전 유지, 나머지 +12(h<12)
function fixTime(t,isYu,dir){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);if(!m)return '';let h=+m[1];const morning=isYu&&dir==='arr';if(!morning&&h>=1&&h<12)h+=12;return String(h).padStart(2,'0')+':'+m[2]}
// 셀 해석: time | N호 | X | 방과후 | 기타
function cell(v){const s=String(v||'').trim();if(!s)return{kind:'empty'};if(/방과후/.test(s))return{kind:'afterschool'};const bm=s.match(/(\d+)\s*호/);if(/^[X×]/.test(s)||(/[X×]/.test(s)&&bm))return bm?{kind:'crossbus_x',bus:bm[1]+'호차'}:{kind:'skip'};if(bm)return{kind:'crossbus',bus:bm[1]+'호차'};if(/^\d{1,2}:\d{2}/.test(s)||/^\d{1,2}:\d{2}/.test(s.replace(/[^\d:]/g,'')))return{kind:'time',t:s};if(/대기|등원|이사|편도|안탄|^\d+\/\d+|~/.test(s))return{kind:'skip'};const tm=s.match(/(\d{1,2}):(\d{2})/);if(tm)return{kind:'time',t:s};return{kind:'skip'}}
// 정류장명 정제
function cleanLoc(loc){
  let s=String(loc||'')
    .replace(/\([^)]*\)/g,' ')          // (메모) 제거
    .split(/등\s*[:：]|하\s*[:：]|승\s*[:：]|[*★]/)[0]  // 등:/하:/승:/* 이후 메모 절단
    .replace(/\d+\/\d+\s*~?/g,' ')       // 날짜
    .split('/')[0]
    .replace(/[)(]/g,' ')
    .replace(/[,]/g,' ')
    .replace(/\s+/g,' ').trim()
  return s
}

// DB index by division
const dbBy={} // div -> name -> [rows]
for(const r of db.rows){const div=/유치/.test(r.session)?'유':'초';(dbBy[div]=dbBy[div]||{});(dbBy[div][norm(r.name)]=dbBy[div][norm(r.name)]||[]).push(r)}
const aptHit=(loc,apt)=>{if(!loc||!apt)return 0;const p=norm(loc),a=norm(apt);let s=0;const dm=p.match(/(\d+)단지/);if(dm&&a.includes(dm[1]+'단지'))s+=2;const dong=p.match(/(\d{3,4})동/);if(dong&&a.includes(dong[1]))s+=1;
  for(const kw of['헬리오','파크리오','자이하버뷰','하버뷰','그린워크','그린애비뉴','센트럴파크','센트럴시티','퍼스트파크','퍼스트월드','마리나베이','힐스테이트','레이크','SK','써밋','호반','베르디움','글로벌','푸르지오','아이파크','래미안','올림픽','훼밀리','선수촌','선수기자촌','쌍용','현대','대림','코오롱','한양','트리지움','엘스','리센츠','파인탑','롯데캐슬','크리스탈오션','자이더스타','마스터뷰','프라임뷰','아크베이','센트레빌','감일','문정','가락','오금','장미','해동','방이','잠실','미륭','금호','우성','삼환','극동','한일','포웰시티','이편한','e편한','웰카운티','센터니얼','프라우','더테라스','레이크팰리스','파크팰리스','삼성래미안','한강삼성','코아','상떼빌']){if(p.includes(kw)&&a.includes(kw))s+=2}
  return s}

const matched={},unmatched=[],homonymResolved=[],ambiguous=[]
for(const rec of parsed){
  const {isYu,days}=classInfo(rec.classtime)
  const {ko,alias}=splitName(rec.name)
  const arrC=cell(rec.arr), depC=cell(rec.dep)
  // 둘 다 미탑승이면 스킵
  if(['empty','skip'].includes(arrC.kind)&&['empty','skip','afterschool'].includes(depC.kind)&&!(arrC.kind==='time'||depC.kind==='time')) {/*완전 미탑승*/ }
  const div=isYu?'유':'초'
  const recLoc=rec.loc_arr||rec.loc||rec.loc_dep||''
  const cands=(dbBy[div]&&dbBy[div][norm(ko)])||[]
  // 폴백: 반대 division에도 찾기
  let pool=cands
  if(!pool.length){const other=isYu?'초':'유';pool=(dbBy[other]&&dbBy[other][norm(ko)])||[]}
  if(!pool.length){unmatched.push({name:ko,alias,div,loc:recLoc,classtime:rec.classtime});continue}
  let chosen
  if(pool.length===1)chosen=pool[0]
  else{
    // 통합 점수: 영문별칭(+5) + 섹션↔세션(+3) + 주소(+s)
    const a0=alias?alias.toLowerCase().split(/\s+/)[0]:''
    const sessMatch=(ct,sn)=>{sn=sn||'';
      if(/유치/.test(ct)&&/유치/.test(sn))return true;
      if(/매일|5회|5일/.test(ct)&&/(1st|매일|주5|MTWT)/i.test(sn))return true;
      if(/월수금/.test(ct)&&/(월수금|MWF|M\/W\/F)/i.test(sn))return true;
      if(/화목/.test(ct)&&/(화목|TTH|T\/TH|TTh)/i.test(sn))return true;
      return false}
    const sc=pool.map(c=>{let s=0;const tag=[];
      if(a0&&(c.en||'').toLowerCase().includes(a0)){s+=5;tag.push('alias')}
      if(sessMatch(rec.classtime,c.session)){s+=3;tag.push('sess')}
      const ah=aptHit(recLoc,c.apt);if(ah){s+=ah;tag.push('addr'+ah)}
      return {c,s,tag:tag.join('+')}
    }).sort((a,b)=>b.s-a.s)
    if(sc[0].s>sc[1].s&&sc[0].s>0){chosen=sc[0].c;homonymResolved.push({name:ko,by:sc[0].tag,chose:`${chosen.en}/${chosen.apt}`})}
    else{ambiguous.push({name:ko,alias,div,loc:recLoc,cands:pool.map(c=>`${c.en}/${c.apt}/${c.session}`)});continue}
  }
  const k=chosen.enrollment_id; matched[k]=matched[k]||{db:chosen,rows:[]}; matched[k].rows.push({rec,isYu,days,arrC,depC,alias})
}

const built=[],flags=[]
for(const[eid,info]of Object.entries(matched)){
  const arr={},dep={}; let fr=[]
  if(info.rows.length>1)fr.push(`다중행(${info.rows.length})`)
  for(const it of info.rows){
    const {rec,isYu,days,arrC,depC}=it
    const groupBus=rec.hocha
    const locArr=cleanLoc(rec.loc_arr||rec.loc||'')
    const locDep=cleanLoc(rec.loc_dep||rec.loc||rec.loc_arr||'')
    const loc=locArr||locDep
    // 등원
    let aBus=null
    if(arrC.kind==='time')aBus=groupBus
    else if(arrC.kind==='crossbus'||arrC.kind==='crossbus_x')aBus=arrC.bus
    if(aBus&&arrC.kind!=='skip'&&arrC.kind!=='empty'&&arrC.kind!=='afterschool'&&!(arrC.kind==='crossbus_x')){
      const t=arrC.kind==='time'?fixTime(arrC.t,isYu,'arr'):''
      for(const d of days){arr[d]=aBus;if(locArr)arr[d+'_loc']=locArr}
      if(t)arr['_time']=arr['_time']||t
    } else if(arrC.kind==='crossbus'){ for(const d of days){arr[d]=arrC.bus;if(locArr)arr[d+'_loc']=locArr} }
    // 하원
    let dBus=null
    if(depC.kind==='time')dBus=groupBus
    else if(depC.kind==='crossbus')dBus=depC.bus
    if(depC.kind==='time'){const t=fixTime(depC.t,isYu,'dep');for(const d of days){dep[d]=groupBus;if(locDep)dep[d+'_loc']=locDep}if(t)dep['_time']=dep['_time']||t}
    else if(depC.kind==='crossbus'){for(const d of days){dep[d]=depC.bus;if(locDep)dep[d+'_loc']=locDep}}
    // afterschool/X/empty → 하원 미탑승
    if(/방과후|6\/|~|이사|대기/.test(rec.arr+rec.dep))fr.push('비고:'+(rec.arr||rec.dep).slice(0,16))
  }
  const classtime=info.rows[0]?.rec?.classtime||''
  built.push({enrollment_id:eid,student:info.db.name,en:info.db.en,session:info.db.session,classtime,arr,dep,flag:fr.join(' | ')})
  if(fr.length)flags.push({student:info.db.name,en:info.db.en,reason:fr.join(' | ')})
}
const matchedIds=new Set(Object.keys(matched))
const noShuttle=db.rows.filter(r=>!matchedIds.has(r.enrollment_id))
console.log(`=== ${CAMP} WIDE DRY-RUN ===`)
console.log(`엑셀행 ${parsed.length} | 매칭 ${Object.keys(matched).length} | 미매칭 ${unmatched.length} | 모호 ${ambiguous.length} | 미이용 ${noShuttle.length} | 플래그 ${flags.length}`)
console.log('\n--- 미매칭(상위20) ---'); unmatched.slice(0,20).forEach(u=>console.log(`  ${u.name}/${u.alias} [${u.div}] ${u.loc} | ${u.classtime}`))
console.log('\n--- 모호(상위15) ---'); ambiguous.slice(0,15).forEach(a=>console.log(`  ${a.name}/${a.alias} [${a.div}] ${a.loc} :: ${a.cands.join(' | ')}`))
console.log('\n--- 동명이인 해결('+homonymResolved.length+') ---'); homonymResolved.slice(0,30).forEach(h=>console.log(`  ${h.name} ${h.by} → ${h.chose}`))
const withSched=built.filter(b=>Object.keys(b.arr).length||Object.keys(b.dep).length)
console.log('\n스케줄 있음:',withSched.length)
fs.writeFileSync(A+`${CAMP}_dryrun.json`,JSON.stringify({built,unmatched,ambiguous,homonymResolved,noShuttle:noShuttle.map(n=>({name:n.name,en:n.en,session:n.session,apt:n.apt}))},null,1),'utf8')
console.log('wrote',`${CAMP}_dryrun.json`)
