#!/usr/bin/env node
// mokdong-build-dryrun.mjs  (DRY-RUN, DB 미수정)
// 목동매그넷 버스 엑셀 파싱본 → DB enrollment 매칭 → arr/dep_schedule 빌드 → 리뷰 리포트.
import fs from 'node:fs'; import path from 'node:path'
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
const parsed=JSON.parse(fs.readFileSync(A+'목동_parsed.json','utf8'))
const db=JSON.parse(fs.readFileSync(A+'MM_목동매그넷_enrollments.json','utf8'))

const BLOCK_OF=(t)=>/매일반/.test(t)?'1st Block':/월수금/.test(t)?'2nd Block(MWF)':/화목/.test(t)?'2nd Block(TTH)':/4학년 월수|월수\(/.test(t)?'3rd Block(MW)':null
const DAYS_OF={'1st Block':['월','화','수','목','금'],'2nd Block(MWF)':['월','수','금'],'2nd Block(TTH)':['화','목'],'3rd Block(MW)':['월','수']}
const ALLDAYS=['월','화','수','목','금']
const busOf=t=>{const m=t.match(/(\d+)호차/);return m?m[1]+'호차':null}
const norm=s=>(s||'').replace(/\s+/g,'')
// 목동은 전부 오후 픽업(최소 13:46). h<9 는 PM 오기입 → +12 (예 03:36→15:36)
const HHMM=t=>{const m=String(t||'').match(/(\d{1,2}):(\d{2})/);if(!m)return '';let h=+m[1];if(h>=1&&h<9)h+=12;return String(h).padStart(2,'0')+':'+m[2]}
// 이름 → {ko, alias}
function splitName(raw){const parts=String(raw).split(/[\n\r]+/).map(s=>s.trim()).filter(Boolean);let ko='',alias='';for(const p of parts){if(/[가-힣]/.test(p)&&!ko)ko=p.replace(/[A-Za-z].*$/,'').trim();else if(/^[A-Za-z]/.test(p))alias=p}
  if(!ko){const m=String(raw).match(/[가-힣]+/);ko=m?m[0]:String(raw).trim()}
  const am=String(raw).match(/[A-Za-z][A-Za-z .]+/);if(!alias&&am)alias=am[0].trim();return{ko,alias}}
// 요일토큰 추출: "월,금"/"수/금"/"화수목" → ['월',...]
function daysFromToken(tok){const ds=[];for(const ch of tok){if('월화수목금'.includes(ch))ds.push(ch)}return ds}
// 장소 요일분리 파싱: text → {day:loc} (defaultDays에 대해)
function parseDaySplit(text,defaultDays){
  const out={}; if(!text||text==='-')return out
  const lines=String(text).split(/[\n\r]+/).map(s=>s.trim()).filter(Boolean)
  let fallback=null, anyPrefixed=false
  for(const ln of lines){const m=ln.match(/^([월화수목금][월화수목금,\/\s]*)\s*[:：]\s*(.+)$/)
    if(m){anyPrefixed=true;const ds=daysFromToken(m[1]);const loc=m[2].trim();for(const d of ds)out[d]=loc}
    else fallback=ln.replace(/^[-\s]+/,'')}
  // 요일프리픽스가 있는데 fallback(비프리픽스 줄)이 없으면, 미지정 요일은 비워둠(잘못된 곳 누수 방지)
  for(const d of defaultDays) if(!(d in out)){ if(fallback!==null) out[d]=fallback; else if(!anyPrefixed&&lines.length===1) out[d]=lines[0] }
  for(const d of Object.keys(out)) if(out[d]==null||out[d]==='-') delete out[d]
  return out
}
// 비고에서 요일별 호차/제외 추출 (콜론/순서 변형 견고화)
function parseNote(note){
  const o={arrBusByDay:{},depBusByDay:{},arrDropDays:[],depDropDays:[],depAllBus:null,arrAllBus:null,arrOnly:false,depOnly:false,raw:note,unparsed:[]}
  if(!note)return o
  const segs=String(note).split(/[\n,()]+/).map(s=>s.trim()).filter(Boolean)
  for(const s of segs){
    if(/자율하원|동의|미동의/.test(s))continue
    if(/만차|쌍둥이|아침돌봄|^외|^조모|^조부|^외조|길\s*건너|돌봄/.test(s))continue
    const days=daysFromToken(s)                 // 세그먼트 내 모든 요일
    const isArr=/등원/.test(s), isDep=/하원/.test(s)
    const busM=s.match(/(\d+)\s*호/)             // N호
    const isX=/[X×]|개별/.test(s)
    if(/등원만/.test(s)){o.arrOnly=true;continue}
    if(/하원만/.test(s)){o.depOnly=true;continue}
    if(isArr&&busM){if(days.length)for(const d of days)o.arrBusByDay[d]=busM[1]+'호차';else o.arrAllBus=busM[1]+'호차';continue}
    if(isDep&&busM){if(days.length)for(const d of days)o.depBusByDay[d]=busM[1]+'호차';else o.depAllBus=busM[1]+'호차';continue}
    if(isArr&&isX){if(days.length)o.arrDropDays.push(...days);else o.arrOnly=false;continue}
    if(isDep&&isX){if(days.length)o.depDropDays.push(...days);else o.depOnly=false;continue}
    // 방향 불명 + N호: 다중시트 보조정보 → 무시(시트 호차 우선)
    if(busM&&!isArr&&!isDep)continue
    o.unparsed.push(s)
  }
  return o
}

// DB index
const dbBy={}; for(const r of db.rows){(dbBy[norm(r.name)]=dbBy[norm(r.name)]||[]).push(r)}
const aptHit=(place,apt)=>{if(!place||!apt)return 0;const p=norm(place),a=norm(apt);let s=0;const dm=p.match(/(\d+)단지/);if(dm&&a.includes(dm[1]+'단지'))s+=3;const dong=p.match(/(\d{3,4})동/);if(dong&&a.includes(dong[1]))s+=2;for(const kw of['우성','한신청구','현대','하이페리온','부영','성원','트윈빌','센트레빌','센트럴','아이파크','힐스테이트','목동','트라움','신시가지'])if(p.includes(kw)&&a.includes(kw))s+=1;return s}

const matched={}, unmatched=[], homonymResolved=[], ambiguous=[]
for(const rec of parsed){
  const {ko,alias}=splitName(rec.name); rec._ko=ko; rec._alias=alias
  const block=BLOCK_OF(rec.title)
  const cands=dbBy[norm(ko)]||[]
  if(!cands.length){unmatched.push({name:ko,alias,sheet:rec.sheet,place:rec.board_place});continue}
  let pool=cands.filter(c=>c.session===block); if(!pool.length)pool=cands
  let chosen
  if(pool.length===1)chosen=pool[0]
  else{
    // 1) 영문별칭으로
    let byAlias=alias?pool.filter(c=>norm(c.en).toLowerCase().includes(norm(alias).toLowerCase().split(' ')[0])||norm(alias).toLowerCase().includes((norm(c.en).toLowerCase().match(/^[a-z]+/)||[''])[0])):[]
    if(alias){const a0=alias.toLowerCase().split(/\s+/)[0];byAlias=pool.filter(c=>(c.en||'').toLowerCase().includes(a0))}
    if(byAlias.length===1){chosen=byAlias[0];homonymResolved.push({name:ko,by:'alias '+alias,chose:`${chosen.en}/${chosen.apt}`})}
    else{
      const scored=pool.map(c=>({c,score:Math.max(aptHit(rec.board_place,c.apt),aptHit(rec.alight_place,c.apt))})).sort((a,b)=>b.score-a.score)
      if(scored[0].score>scored[1].score&&scored[0].score>0){chosen=scored[0].c;homonymResolved.push({name:ko,by:'addr '+rec.board_place,chose:`${chosen.en}/${chosen.apt}`,score:scored[0].score})}
      else{ambiguous.push({name:ko,alias,sheet:rec.sheet,place:rec.board_place,cands:pool.map(c=>`${c.en}/${c.apt}/${c.session}`)});continue}
    }
  }
  const k=chosen.enrollment_id; matched[k]=matched[k]||{db:chosen,block,rows:[]}; matched[k].rows.push(rec)
}

const built=[], flags=[]
for(const[eid,info]of Object.entries(matched)){
  const days=DAYS_OF[info.block]||[]
  const arr={}, dep={}; let notes=[], unparsedNote=[]
  const multi=info.rows.length>1
  for(const rec of info.rows){
    const sheetBus=busOf(rec.title), bt=HHMM(rec.board_time), at=HHMM(rec.alight_time)
    const np=parseNote(rec.note); if(np.unparsed.length)unparsedNote.push(...np.unparsed)
    const arrLoc=parseDaySplit(rec.board_place,days)
    const depLoc=parseDaySplit(rec.alight_place,days)
    const hasArr=!!bt && !(rec.board_place==='-'||rec.board_place===''), hasDep=!!at && !(rec.alight_place==='-'||rec.alight_place==='')
    for(const d of days){
      // 등원
      if(hasArr && !np.depOnly && !np.arrDropDays.includes(d)){
        const b=np.arrBusByDay[d]||np.arrAllBus||sheetBus
        // 다중시트: 이미 다른 시트가 이 요일을 채웠으면 비고기반만 덮음
        if(!(d in arr)||np.arrBusByDay[d]||np.arrAllBus){arr[d]=b; if(arrLoc[d])arr[d+'_loc']=arrLoc[d]}
      }
      // 하원
      if(hasDep && !np.arrOnly && !np.depDropDays.includes(d)){
        const b=np.depBusByDay[d]||np.depAllBus||sheetBus
        if(!(d in dep)||np.depBusByDay[d]||np.depAllBus){dep[d]=b; if(depLoc[d])dep[d+'_loc']=depLoc[d]}
      }
    }
    if(bt)arr['_time']=arr['_time']||bt
    if(at)dep['_time']=dep['_time']||at
  }
  const flagReason=[]
  if(multi)flagReason.push(`다중시트(${info.rows.length})`)
  if(unparsedNote.length)flagReason.push('비고미해석:'+unparsedNote.join(';').slice(0,50))
  built.push({enrollment_id:eid,student:info.db.name,en:info.db.en,session:info.block,arr,dep,flag:flagReason.join(' | ')})
  if(flagReason.length)flags.push({student:info.db.name,en:info.db.en,reason:flagReason.join(' | ')})
}

const matchedIds=new Set(Object.keys(matched))
const noShuttle=db.rows.filter(r=>!matchedIds.has(r.enrollment_id))
console.log('=== 목동매그넷 DRY-RUN v2 ===')
console.log('엑셀행',parsed.length,'| 매칭',Object.keys(matched).length,'| 미매칭',unmatched.length,'| 모호',ambiguous.length,'| 미이용',noShuttle.length,'| 플래그',flags.length)
console.log('\n--- 미매칭 ---'); unmatched.forEach(u=>console.log(`  ${u.name}${u.alias?'/'+u.alias:''} [${u.sheet}] ${u.place}`))
console.log('\n--- 모호 ---'); ambiguous.forEach(a=>console.log(`  ${a.name}/${a.alias} [${a.sheet}] ${a.place} :: ${a.cands.join(' | ')}`))
console.log('\n--- 동명이인 해결('+homonymResolved.length+') ---'); homonymResolved.forEach(h=>console.log(`  ${h.name} ${h.by} → ${h.chose}`))
console.log('\n--- 플래그(검토) ---'); flags.forEach(f=>console.log(`  ${f.student}/${f.en}: ${f.reason}`))
fs.writeFileSync(A+'목동_dryrun.json',JSON.stringify({built,unmatched,ambiguous,homonymResolved,noShuttle:noShuttle.map(n=>({name:n.name,en:n.en,session:n.session,apt:n.apt})),flags},null,1),'utf8')
console.log('\nwrote 목동_dryrun.json')
