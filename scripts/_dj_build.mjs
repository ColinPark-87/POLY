import pkg from 'xlsx'; import fs from 'node:fs'; import path from 'node:path'
const XLSX = pkg.default ?? pkg
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const E=loadEnv(),U=E.NEXT_PUBLIC_SUPABASE_URL,K=E.SUPABASE_SERVICE_ROLE_KEY
async function g(q){const r=await fetch(`${U}/rest/v1/${q}`,{headers:{apikey:K,Authorization:`Bearer ${K}`}});if(!r.ok)throw new Error(q+' '+r.status+await r.text());return r.json()}
const norm=s=>(s??'').toString().replace(/\s+/g,' ').trim()
const nmKey=s=>norm(s).replace(/\(.*?\)/g,'').replace(/[\s​]/g,'')
const aptTok=s=>{const m=norm(s).match(/(크로바|목련|한마루|누리|둥지|가람|경남아너스빌|탄방자이|둔산자이|센티온|산호|꿈나무|보라|햇님|샘머리|국화|향촌|녹원|무지개|푸른마을|미리내|은아|파랑새|문화마을|짚신|꿈동산|남선|갈마|월평|둔산|관저|도안|복수|괴정|용문|탄방|만년)/);return m?m[1]:''}
const dongNo=s=>{const m=norm(s).match(/(\d{1,4})\s*동/);return m?m[1]:''}
const T=v=>{ if(v==null||v==='')return''; if(v instanceof Date)return v.toISOString().slice(11,16); if(typeof v==='number'){const tot=Math.round(v*24*60);return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0')} const m=String(v).match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/); if(m)return m[1].padStart(2,'0')+':'+((m[2]||'00')).padStart(2,'0'); return String(v).trim() }
const daysOf=lbl=>{const s=norm(lbl); if(/월수금/.test(s))return['월','수','금']; if(/화목/.test(s))return['화','목']; return['월','화','수','목','금']}
// 배차표 세션라벨 -> DB 세션 추정
function guessSession(lbl){const s=norm(lbl); if(/월수금/.test(s))return'2nd Block'; if(/화목/.test(s))return'2nd Block(T,TH)'; if(/매일|3시|3:00/.test(s))return'1st Block'; return null}

// ---------- parse ----------
const dir='../Raw/0626/26년 3월 차량배차표 (대전)/'
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.xlsx'))
const recs=[]
for(const fn of files){
  if(fn.includes('셔틀이용명단'))continue
  const busM=fn.match(/\((\d+)호차\)/); const bus=busM?busM[1]+'호차':'?'
  const wb=XLSX.read(fs.readFileSync(dir+fn),{cellDates:true})
  for(const sn of wb.SheetNames){
    const grid=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true})
    const r1=norm((grid[1]||[]).filter(x=>x!=='')[0]||'')
    const sessLbl=r1||sn, days=daysOf(sessLbl||sn)
    let hr=grid.findIndex(r=>r.some(c=>/명단|성명/.test(String(c)))&&r.some(c=>/등원시간|하원시간/.test(String(c)))); if(hr<0)hr=3
    // 헤더 기반 컬럼 감지(A형/B형 등 가변 레이아웃 대응)
    const hdr=(grid[hr]||[]).map(x=>String(x))
    const find=re=>hdr.findIndex(h=>re.test(h))
    const cArrT=find(/등원시간/), cName=find(/명단|성명/), cPhone=find(/전화/), cAddr=find(/주소/), cDepT=find(/하원시간/)
    const places=hdr.map((h,i)=>/장소/.test(h)?i:-1).filter(i=>i>=0)
    const cArrL=places.find(i=>i>cArrT&&(cDepT<0||i<cDepT))
    const cDepL=cDepT>=0?places.find(i=>i>cDepT):undefined
    let aT='',aL='',dT='',dL=''
    for(let i=hr+1;i<grid.length;i++){const row=grid[i]; const name=norm(row[cName])
      if(cArrT>=0&&row[cArrT]!=='')aT=T(row[cArrT]); if(cArrL>=0&&norm(row[cArrL])!=='')aL=norm(row[cArrL])
      if(cDepT>=0&&row[cDepT]!=='')dT=T(row[cDepT]); if(cDepL>=0&&norm(row[cDepL])!=='')dL=norm(row[cDepL])
      if(!name||/명단|학생이름|성명/.test(name))continue
      // 장소 칸이 라벨('유치부 방과후' 등)이면 정류장 아님 → 주소 대체용 플래그
      const isLabel=s=>/유치부|방과후|비고/.test(s)
      const arrStop=isLabel(aL)?'':aL, depStop=isLabel(dL)?'':dL
      recs.push({src:'배차표',bus,sessLbl,days,name,addr:norm(row[cAddr]),arrTime:aT,arrStop,depTime:dT,depStop,sessGuess:guessSession(sessLbl||sn),flag:isLabel(aL)?'유치부방과후':''})
    }
  }
}
{ const fn=files.find(f=>f.includes('셔틀이용명단')); const wb=XLSX.read(fs.readFileSync(dir+fn),{cellDates:true})
  for(const sn of wb.SheetNames){const bus=sn.replace(/호$/,'')+'호차'
    const grid=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true})
    let hr=grid.findIndex(r=>r.some(c=>/승차장소|학생이름/.test(String(c)))); if(hr<0)hr=5
    const hdr=(grid[hr]||[]).map(x=>String(x)); const find=re=>hdr.findIndex(h=>re.test(h))
    const cT=find(/승차시간|탑승시간/), cL=find(/승차장소|탑승장소/), cName=find(/학생이름|명단/), cAddr=find(/주소/)
    let aT='',aL=''
    for(let i=hr+1;i<grid.length;i++){const row=grid[i]; const name=norm(row[cName>=0?cName:3])
      if(cT>=0&&row[cT]!=='')aT=T(row[cT]); if(cL>=0&&norm(row[cL])!=='')aL=norm(row[cL])
      if(!name||/학생이름|명단/.test(name))continue
      recs.push({src:'등원명단',bus,sessLbl:'유치부등원',days:['월','화','수','목','금'],name,addr:norm(row[cAddr>=0?cAddr:6]),arrTime:aT,arrStop:aL,depTime:'',depStop:'',sessGuess:'유치부'})
    }
  }
}

// ---------- DB ----------
const c=(await g('campuses?select=id,name')).find(x=>x.name.includes('대전'))
const sess=await g(`class_sessions?select=id,name,time_range&campus_id=eq.${c.id}`)
const sById=Object.fromEntries(sess.map(s=>[s.id,s.name]))
const cls=await g(`classes?select=id,session_id&session_id=in.(${sess.map(s=>s.id).join(',')})`)
const clsSess=Object.fromEntries(cls.map(x=>[x.id,sById[x.session_id]]))
const stu=await g(`campus_students?select=id,name,english_name,apartment,address,detail_address&campus_id=eq.${c.id}&limit=2000`)
let enr=[]; for(let i=0;i<cls.length;i+=30){const ch=cls.slice(i,i+30).map(x=>x.id);enr.push(...await g(`class_enrollments?select=student_id,class_id&class_id=in.(${ch.join(',')})`))}
// student -> {session: class_id}, and set of sessions
const stuSessClass={}; for(const e of enr){const sn=clsSess[e.class_id]; (stuSessClass[e.student_id]=stuSessClass[e.student_id]||{})[sn]=e.class_id}
const byName={}; for(const s of stu){(byName[nmKey(s.name)]=byName[nmKey(s.name)]||[]).push(s)}

// ---------- match ----------
function matchStudent(r){
  const cands=byName[nmKey(r.name)]||[]
  if(cands.length===1)return{m:cands[0],how:'name'}
  if(cands.length===0)return{m:null,how:'none'}
  const at=aptTok(r.addr), dn=dongNo(r.addr)
  let f=cands.filter(s=>at&&(aptTok(s.apartment)===at||aptTok(s.address)===at||aptTok(s.detail_address)===at))
  if(f.length===1)return{m:f[0],how:'name+apt'}
  if(f.length>1&&dn){const f2=f.filter(s=>dongNo(s.address)===dn||dongNo(s.detail_address)===dn); if(f2.length===1)return{m:f2[0],how:'name+apt+dong'}}
  if(f.length===0&&dn){const f3=cands.filter(s=>dongNo(s.address)===dn||dongNo(s.detail_address)===dn); if(f3.length===1)return{m:f3[0],how:'name+dong'}}
  return{m:null,how:'ambig('+cands.length+')'}
}
// target session: rowGuess if student enrolled in it, else sole enrollment, else null
function targetSession(r,sid){const enrolled=Object.keys(stuSessClass[sid]||{}); if(r.sessGuess&&enrolled.includes(r.sessGuess))return r.sessGuess; if(enrolled.length===1)return enrolled[0]; if(r.sessGuess&&enrolled.length===0)return null; return enrolled.find(e=>r.sessGuess&&e.includes(r.sessGuess.slice(0,3)))||null}

const DAYS=['월','화','수','목','금']
// per (student_id, session) accumulate per-day arr/dep
const acc={}  // key sid|session -> {class_id, arr:{day:{bus,loc,time}}, dep:{...}, names:Set}
const unmatched=[], ambiguous=[], noSession=[], conflicts=[]
let okRows=0
for(const r of recs){
  const {m,how}=matchStudent(r)
  if(!m){ (how==='none'?unmatched:ambiguous).push({...r,reason:how}); continue }
  const ses=targetSession(r,m.id)
  if(!ses){ noSession.push({...r,matchEng:m.english_name,enrolled:Object.keys(stuSessClass[m.id]||{}).join('/')}); continue }
  const cid=stuSessClass[m.id][ses]
  if(!cid){ noSession.push({...r,matchEng:m.english_name,reason:'no class for session '+ses}); continue }
  const key=m.id+'|'+ses
  acc[key]=acc[key]||{student_id:m.id,class_id:cid,session:ses,eng:m.english_name,kr:m.name,arr:{},dep:{}}
  okRows++
  for(const d of r.days){
    if(r.arrStop||r.arrTime){const ex=acc[key].arr[d]; if(ex&&ex.bus!==r.bus)conflicts.push({name:m.name,session:ses,day:d,dir:'arr',a:ex.bus,b:r.bus}); acc[key].arr[d]={bus:r.bus,loc:r.arrStop,time:r.arrTime}}
    if(r.depStop||r.depTime){const ex=acc[key].dep[d]; if(ex&&ex.bus!==r.bus)conflicts.push({name:m.name,session:ses,day:d,dir:'dep',a:ex.bus,b:r.bus}); acc[key].dep[d]={bus:r.bus,loc:r.depStop,time:r.depTime}}
  }
}
// build schedule json (collapse _time vs day_time)
function buildSched(perDay){
  const days=Object.keys(perDay); if(!days.length)return null
  const sched={}
  for(const d of days){sched[d]=perDay[d].bus; if(perDay[d].loc)sched[d+'_loc']=perDay[d].loc}
  const times=[...new Set(days.map(d=>perDay[d].time).filter(Boolean))]
  if(times.length===1&&days.every(d=>perDay[d].time))sched['_time']=times[0]
  else for(const d of days)if(perDay[d].time)sched[d+'_time']=perDay[d].time
  return sched
}
const conflictKeys=new Set(conflicts.map(x=>x.name+'|'+x.session))
const updates=[]
for(const k in acc){const a=acc[k]; const arr=buildSched(a.arr), dep=buildSched(a.dep)
  const hasConflict=conflictKeys.has(a.kr+'|'+a.session)
  // 비신뢰 시간(자정대/23:59 등) 플래그
  const allT=[...Object.values(a.arr),...Object.values(a.dep)].map(x=>x.time).filter(Boolean)
  const badTime=allT.some(t=>{const h=+t.split(':')[0];return h>=23||h<6})
  updates.push({student_id:a.student_id,class_id:a.class_id,session:a.session,kr:a.kr,eng:a.eng,arr_schedule:arr,dep_schedule:dep,hasConflict,badTime})}
const clean=updates.filter(u=>!u.hasConflict&&!u.badTime)
console.log('\n=== CLEAN SUBSET ===')
console.log('clean updates(충돌·이상시간 없음):',clean.length,'/',updates.length)
console.log('  by session:',JSON.stringify(clean.reduce((a,u)=>{a[u.session]=(a[u.session]||0)+1;return a},{})))
console.log('  problematic:',updates.length-clean.length,'(conflict:',updates.filter(u=>u.hasConflict).length,'badTime:',updates.filter(u=>u.badTime).length,')')

// buses used
const busesUsed=[...new Set(recs.map(r=>r.bus))].sort((a,b)=>parseInt(a)-parseInt(b))
// stops used (per bus+dir)
const stopSet=new Set()
for(const u of updates){for(const sc of [u.arr_schedule,u.dep_schedule]){if(!sc)continue;for(const d of DAYS){if(sc[d]&&sc[d+'_loc'])stopSet.add(sc[d]+'|'+(sc===u.arr_schedule?'arr':'dep')+'|'+sc[d+'_loc'])}}}

console.log('=== BUILD STATS ===')
console.log('parsed rows:',recs.length,' applied rows:',okRows)
console.log('enrollment updates(학생·세션):',updates.length)
console.log('  with arr:',updates.filter(u=>u.arr_schedule).length,' with dep:',updates.filter(u=>u.dep_schedule).length)
console.log('distinct students touched:',new Set(updates.map(u=>u.student_id)).size)
console.log('unmatched rows:',unmatched.length,' (distinct names:',new Set(unmatched.map(u=>u.name)).size,')')
console.log('ambiguous rows:',ambiguous.length,' (distinct:',new Set(ambiguous.map(u=>u.name)).size,')')
console.log('noSession rows:',noSession.length)
console.log('bus conflicts:',conflicts.length)
console.log('  conflicts by session:',JSON.stringify(conflicts.reduce((a,x)=>{a[x.session]=(a[x.session]||0)+1;return a},{})))
console.log('  conflict sample:',conflicts.slice(0,6).map(x=>`${x.name}/${x.session}/${x.day}/${x.dir}:${x.a}vs${x.b}`).join(' | '))
console.log('buses:',busesUsed.join(','))
console.log('distinct stops(bus+dir+loc):',stopSet.size)
console.log('\nsession update breakdown:',JSON.stringify(updates.reduce((a,u)=>{a[u.session]=(a[u.session]||0)+1;return a},{})))
console.log('\nsample updates:')
for(const u of updates.slice(0,4))console.log(' ',u.kr,u.session,'arr',JSON.stringify(u.arr_schedule),'dep',JSON.stringify(u.dep_schedule))

const out='../산출물/대전차량_2026-06-26/'
fs.mkdirSync(out,{recursive:true})
fs.writeFileSync(out+'_plan.json',JSON.stringify({campusId:c.id,updates,busesUsed,stops:[...stopSet]},null,1))
const csv=(rows,cols)=>'﻿'+[cols.join(',')].concat(rows.map(r=>cols.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))).join('\n')
fs.writeFileSync(out+'_미매칭.csv',csv(unmatched,['name','bus','sessLbl','addr','arrStop','depStop']))
fs.writeFileSync(out+'_동명이인모호.csv',csv(ambiguous,['name','reason','bus','sessLbl','addr','arrStop','depStop']))
fs.writeFileSync(out+'_세션미정.csv',csv(noSession,['name','matchEng','sessGuess','enrolled','bus','sessLbl']))
fs.writeFileSync(out+'_호차충돌.csv',csv(conflicts,['name','session','day','dir','a','b']))
console.log('\nwrote _plan.json + 4 report CSVs ->',out)
