#!/usr/bin/env node
// bundang-build.mjs (DRY) — 분당 parsed → DB enrollment 매칭 → arr/dep_schedule 빌드 → 분당_dryrun.json
// 분당 포맷: 행=학생-세션1건, 명시적 요일(O), 단일 정류장, 등원(탑승시간)/하원(하차시간) 동시.
import fs from 'node:fs'
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
const parsed=JSON.parse(fs.readFileSync(A+'분당_parsed.json','utf8')).filter(r=>r.session_db && r.bus!=='개별라이딩' && !/개별라이딩/.test(r.bus||''))
const db=JSON.parse(fs.readFileSync(A+'BD_분당_enrollments.json','utf8'))

const norm=s=>(s||'').replace(/\s+/g,'').toLowerCase()
const normK=s=>(s||'').replace(/\s+/g,'')
// 호차명 매핑(DB campus_buses.name 정확일치 필요): 13/18 접미 변형
function busName(busRaw, session_db){
  const n=parseInt(String(busRaw).replace(/[^0-9]/g,''),10)
  if(n===18) return '18호차 1BLK'
  if(n===13) return session_db==='유치부' ? '13호차 ECP (오전)' : '13호차 ELE (오후)'
  return `${n}호차`
}
// AM/PM: 유치부 등원만 오전, 그 외 +12 (h<12)
function fixTime(t,isYu,dir){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);if(!m)return '';let h=+m[1];const morning=isYu&&dir==='arr';if(!morning&&h>=1&&h<12)h+=12;return String(h).padStart(2,'0')+':'+m[2]}
function cleanStop(s){return String(s||'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim()}

// DB index: session -> normK(name) -> [rows]
const bySessName={}, byName={}
for(const r of db.rows){
  (bySessName[r.session]=bySessName[r.session]||{});
  (bySessName[r.session][normK(r.name)]=bySessName[r.session][normK(r.name)]||[]).push(r);
  (byName[normK(r.name)]=byName[normK(r.name)]||[]).push(r)
}
const aptHit=(a,b)=>{if(!a||!b)return 0;const x=normK(a),y=normK(b);let s=0;const dm=x.match(/(\d+)단지/);if(dm&&y.includes(dm[1]+'단지'))s+=2;
  for(const kw of['무지개','까치','시범','효자촌','파크타운','푸른마을','양지','샛별','한양','청솔','정자','금곡','구미','서현','수내','분당','백현','판교','이매','야탑','서당','상록','한솔','매화','보람','장미','상지','까치마을','느티','목련','라이프','삼환','우성','현대','신한','건영','롯데','선경','대우']){if(x.includes(kw)&&y.includes(kw))s+=1}
  return s}

const matched={}, unmatched=[], ambiguous=[], homonymResolved=[]
for(const rec of parsed){
  const isYu=rec.session_db==='유치부'
  const a0=(rec.eng||'').toLowerCase().split(/\s+/)[0]
  // 1순위: 같은 세션 내 이름 후보
  let pool=(bySessName[rec.session_db]&&bySessName[rec.session_db][normK(rec.kor)])||[]
  let viaName=false
  if(!pool.length){ pool=byName[normK(rec.kor)]||[]; viaName=true }   // 세션 불일치 시 이름 전체 후보
  if(!pool.length){ unmatched.push({kor:rec.kor,eng:rec.eng,session:rec.session_db,apt:rec.apt}); continue }
  let chosen
  if(pool.length===1) chosen=pool[0]
  else{
    const sc=pool.map(c=>{let s=0;const tag=[]
      if(a0&&normK(c.en).toLowerCase().includes(a0)){s+=5;tag.push('eng')}
      if(c.session===rec.session_db){s+=3;tag.push('sess')}
      const ah=aptHit(rec.apt,c.apt);if(ah){s+=ah;tag.push('apt'+ah)}
      return {c,s,tag:tag.join('+')}}).sort((x,y)=>y.s-x.s)
    if(sc[0].s>sc[1].s && sc[0].s>0){chosen=sc[0].c; homonymResolved.push({kor:rec.kor,by:sc[0].tag,chose:`${chosen.en}/${chosen.apt}/${chosen.session}`})}
    else{ ambiguous.push({kor:rec.kor,eng:rec.eng,session:rec.session_db,apt:rec.apt,cands:pool.map(c=>`${c.en}/${c.apt}/${c.session}`)}); continue }
  }
  const eid=chosen.enrollment_id
  matched[eid]=matched[eid]||{db:chosen,rows:[]}; matched[eid].rows.push(rec)
}

// build schedules (한 enrollment에 복수 rec = 멀티세션/방과후 → 요일 합치고 시간 보존)
const built=[]
for(const [eid,info] of Object.entries(matched)){
  const arr={}, dep={}; const flags=[]
  const isYu=info.db.session==='유치부'
  if(info.rows.length>1) flags.push(`복수행(${info.rows.length}:${info.rows.map(r=>r.session_db).join(',')})`)
  // 등원=가장 이른 classtime row, 하원=가장 늦은 classtime row 기준 (블록 통합)
  const sorted=[...info.rows].sort((a,b)=>(a.classtime||'').localeCompare(b.classtime||''))
  for(const rec of info.rows){
    const baseBus=busName(rec.bus, rec.session_db)
    const aBus=rec.bus_arr?busName(rec.bus_arr,rec.session_db):baseBus  // 방향별 호차 오버라이드
    const dBus=rec.bus_dep?busName(rec.bus_dep,rec.session_db):baseBus
    const sArr=cleanStop(rec.stop_arr||rec.stop_dep)
    const sDep=cleanStop(rec.stop_dep||rec.stop_arr)
    const at=fixTime(rec.arr_time,isYu,'arr'), dt=fixTime(rec.dep_time,isYu,'dep')
    for(const d of rec.days){
      // 등원: 이른 블록 우선(이미 있으면 유지)
      if(at){ if(!arr[d]){arr[d]=aBus; if(sArr)arr[d+'_loc']=sArr} }
      // 하원: 늦은 블록 우선(덮어쓰기 — 더 늦은 하원 시간/호차로)
      if(dt){ dep[d]=dBus; if(sDep)dep[d+'_loc']=sDep }
    }
  }
  // _time: 등원=이른 classtime의 등원시간, 하원=늦은 classtime의 하원시간
  const earl=sorted[0], late=sorted[sorted.length-1]
  const at0=fixTime(earl.arr_time,isYu,'arr'), dt0=fixTime(late.dep_time,isYu,'dep')
  if(at0 && Object.keys(arr).length) arr['_time']=at0
  if(dt0 && Object.keys(dep).length) dep['_time']=dt0
  built.push({enrollment_id:eid,student:info.db.name,en:info.db.en,session:info.db.session,
    classtime:earl.classtime, arr, dep, flag:flags.join(' | ')})
}
const matchedIds=new Set(Object.keys(matched))
const noShuttle=db.rows.filter(r=>!matchedIds.has(r.enrollment_id)).map(n=>({name:n.name,en:n.en,session:n.session,apt:n.apt}))
const withSched=built.filter(b=>Object.keys(b.arr).length||Object.keys(b.dep).length)

console.log('=== 분당 BUILD DRY-RUN ===')
console.log(`parsed(유효) ${parsed.length} | 매칭 enrollment ${Object.keys(matched).length} | 스케줄있음 ${withSched.length} | 미매칭 ${unmatched.length} | 모호 ${ambiguous.length} | 동명이인해결 ${homonymResolved.length} | 미이용(재원생-엑셀없음) ${noShuttle.length}`)
console.log('\n--- 미매칭(엑셀엔 있으나 재원생 매칭 실패, 상위20) ---'); unmatched.slice(0,20).forEach(u=>console.log(`  ${u.kor}(${u.eng}) [${u.session}] ${u.apt}`))
console.log('\n--- 모호(상위15) ---'); ambiguous.slice(0,15).forEach(a=>console.log(`  ${a.kor}(${a.eng}) [${a.session}] :: ${a.cands.join(' | ')}`))
console.log('\n--- 샘플 빌드(3) ---'); built.slice(0,3).forEach(b=>console.log(`  ${b.student}/${b.en} [${b.session}] arr=${JSON.stringify(b.arr)} dep=${JSON.stringify(b.dep)}`))
fs.writeFileSync(A+'분당_dryrun.json',JSON.stringify({built,unmatched,ambiguous,homonymResolved,noShuttle},null,1),'utf8')
console.log('\nwrote 분당_dryrun.json')
