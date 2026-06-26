import pkg from 'xlsx'; import fs from 'node:fs'; import path from 'node:path'
const XLSX = pkg.default ?? pkg
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const E=loadEnv(),U=E.NEXT_PUBLIC_SUPABASE_URL,K=E.SUPABASE_SERVICE_ROLE_KEY
async function g(q){const r=await fetch(`${U}/rest/v1/${q}`,{headers:{apikey:K,Authorization:`Bearer ${K}`}});if(!r.ok)throw new Error(q+' '+r.status+await r.text());return r.json()}
const norm=s=>(s??'').toString().replace(/\s+/g,' ').trim()
const nmKey=s=>norm(s).replace(/\(.*?\)/g,'').replace(/\s/g,'')
const aptTok=s=>{const m=norm(s).match(/(크로바|목련|한마루|누리|둥지|가람|경남아너스빌|탄방자이|둔산자이|센티온|산호|꿈나무|보라|햇님|샘머리|국화|향촌|녹원|무지개|푸른마을|미리내|은아|파랑새|문화마을|짚신|꿈동산|남선|갈마|월평|둔산|관저|도안|복수|괴정|용문|탄방|만년)/);return m?m[1]:''}
const T=v=>{ if(v==null||v==='')return''; if(v instanceof Date)return v.toISOString().slice(11,16); if(typeof v==='number'){const tot=Math.round(v*24*60);return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0')} const m=String(v).match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/); if(m)return m[1].padStart(2,'0')+':'+((m[2]||'00')).padStart(2,'0'); return String(v).trim() }
const daysOf=lbl=>{const s=norm(lbl); if(/월수금/.test(s))return['월','수','금']; if(/화목/.test(s))return['화','목']; if(/매일|월화수목금/.test(s))return['월','화','수','목','금']; return['월','화','수','목','금']}

const dir='../Raw/0626/26년 3월 차량배차표 (대전)/'
const recs=[]
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.xlsx'))

for(const fn of files){
  if(fn.includes('셔틀이용명단'))continue
  const busM=fn.match(/\((\d+)호차\)/); const busFile=busM?busM[1]+'호차':'?'
  const wb=XLSX.read(fs.readFileSync(dir+fn),{cellDates:true})
  for(const sn of wb.SheetNames){
    const grid=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true})
    const r0=norm((grid[0]||[]).filter(x=>x!=='')[0]||'')
    const r1=norm((grid[1]||[]).filter(x=>x!=='')[0]||'')
    const sessLbl=r1||sn
    const days=daysOf(sessLbl||sn)
    let hr=grid.findIndex(r=>r.some(c=>/명단/.test(String(c)))&&r.some(c=>/등원시간|하원시간/.test(String(c))))
    if(hr<0)hr=3
    let aT='',aL='',dT='',dL=''
    for(let i=hr+1;i<grid.length;i++){
      const row=grid[i]; const name=norm(row[3])
      if(row[1]!=='')aT=T(row[1]); if(norm(row[2])!=='')aL=norm(row[2])
      if(row[6]!=='')dT=T(row[6]); if(norm(row[7])!=='')dL=norm(row[7])
      if(!name||/명단|학생이름/.test(name))continue
      recs.push({src:'배차표',file:fn,busFile,r0bus:r0,session:sessLbl,sheet:sn,days:days.join(''),name,phone:norm(row[4]),addr:norm(row[5]),arrTime:aT,arrStop:aL,depTime:dT,depStop:dL})
    }
  }
}
{
  const fn=files.find(f=>f.includes('셔틀이용명단'))
  const wb=XLSX.read(fs.readFileSync(dir+fn),{cellDates:true})
  for(const sn of wb.SheetNames){
    const bus=sn.replace(/호$/,'')+'호차'
    const grid=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true})
    let hr=grid.findIndex(r=>r.some(c=>/승차장소|학생이름/.test(String(c))))
    if(hr<0)hr=5
    let aT='',aL=''
    for(let i=hr+1;i<grid.length;i++){
      const row=grid[i]; const name=norm(row[3])
      if(row[1]!=='')aT=T(row[1]); if(norm(row[2])!=='')aL=norm(row[2])
      if(!name||/학생이름/.test(name))continue
      recs.push({src:'등원명단',file:fn,busFile:bus,r0bus:bus,session:'등원명단',sheet:sn,days:'월화수목금',name,phone:norm(row[4]),addr:norm(row[6]),arrTime:aT,arrStop:aL,depTime:'',depStop:''})
    }
  }
}
console.log('parsed rows:',recs.length,' 배차표:',recs.filter(r=>r.src==='배차표').length,' 등원명단:',recs.filter(r=>r.src==='등원명단').length)

const c=(await g('campuses?select=id,name')).find(x=>x.name.includes('대전'))
const sess=await g(`class_sessions?select=id,name&campus_id=eq.${c.id}`)
const sById=Object.fromEntries(sess.map(s=>[s.id,s.name]))
const cls=await g(`classes?select=id,session_id&session_id=in.(${sess.map(s=>s.id).join(',')})`)
const clsSess=Object.fromEntries(cls.map(x=>[x.id,sById[x.session_id]]))
const stu=await g(`campus_students?select=id,name,english_name,apartment,school,address,detail_address&campus_id=eq.${c.id}&limit=2000`)
let enr=[]; for(let i=0;i<cls.length;i+=30){const ch=cls.slice(i,i+30).map(x=>x.id);enr.push(...await g(`class_enrollments?select=student_id,class_id&class_id=in.(${ch.join(',')})`))}
const stuSess={}; for(const e of enr){(stuSess[e.student_id]=stuSess[e.student_id]||new Set()).add(clsSess[e.class_id])}
const byName={}; for(const s of stu){(byName[nmKey(s.name)]=byName[nmKey(s.name)]||[]).push(s)}

let matched=0,ambig=0,none=0
const mapCount={}
for(const r of recs){
  const cands=byName[nmKey(r.name)]||[]
  let m=null,method=''
  if(cands.length===1){m=cands[0];method='name'}
  else if(cands.length>1){
    const at=aptTok(r.addr)
    const byApt=cands.filter(s=>at&&(aptTok(s.apartment)===at||aptTok(s.address)===at||aptTok(s.detail_address)===at))
    if(byApt.length===1){m=byApt[0];method='name+apt'}
    else {ambig++; r.matchSession='(동명이인 '+cands.length+')'; r.method='ambig'; continue}
  }
  if(!m){none++; r.method='none'; continue}
  matched++
  const dbs=[...(stuSess[m.id]||[])].join('/')||'(enrollment없음)'
  r.matchId=m.id; r.matchEng=m.english_name; r.matchSession=dbs; r.method=method
  mapCount[r.session]=mapCount[r.session]||{}; mapCount[r.session][dbs]=(mapCount[r.session][dbs]||0)+1
}
console.log(`\n매칭: 성공 ${matched} / 동명이인모호 ${ambig} / 미매칭 ${none}`)
console.log('\n=== 배차표세션 -> DB세션 분포 ===')
for(const [bs,m] of Object.entries(mapCount)){
  const parts=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`)
  console.log(`  '${bs}' -> ${parts.join(', ')}`)
}
console.log('\n=== 미매칭 이름(distinct, 최대40) ===')
console.log([...new Set(recs.filter(r=>r.method==='none').map(r=>r.name))].slice(0,40).join(', '))
console.log('\n=== 동명이인 모호(distinct, 최대25) ===')
console.log([...new Set(recs.filter(r=>r.method==='ambig').map(r=>r.name))].slice(0,25).join(', '))

const cols=['src','busFile','r0bus','session','days','name','matchEng','matchSession','method','arrTime','arrStop','depTime','depStop','phone','addr']
const csv=[cols.join(',')].concat(recs.map(r=>cols.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))).join('\n')
fs.mkdirSync('../산출물/대전차량_2026-06-26',{recursive:true})
fs.writeFileSync('../산출물/대전차량_2026-06-26/_검토_파싱매칭.csv','﻿'+csv)
console.log('\n검토 CSV -> 산출물/대전차량_2026-06-26/_검토_파싱매칭.csv  (rows '+recs.length+')')
