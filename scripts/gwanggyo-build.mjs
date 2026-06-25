#!/usr/bin/env node
// gwanggyo-build.mjs (DRY) — 광교 parsed(섹션별 등원/하원) → 학생별 arr/dep 결합 → DB 매칭 → 광교_dryrun.json
import fs from 'node:fs'
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
const parsed=JSON.parse(fs.readFileSync(A+'광교_parsed.json','utf8'))
const db=JSON.parse(fs.readFileSync(A+'GG_광교_enrollments.json','utf8'))
const normK=s=>(s||'').replace(/\s+/g,'')
const a0f=s=>(s||'').toLowerCase().split(/\s+/)[0]
function fixTime(t,isYu,dir){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);if(!m)return '';let h=+m[1];const morning=isYu&&dir==='arr';if(!morning&&h>=1&&h<12)h+=12;return String(h).padStart(2,'0')+':'+m[2]}
function cleanStop(s){return String(s||'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim()}
const sessCat=s=>{s=s||'';if(/유치/.test(s))return '유';if(/1st|매일/.test(s))return '1';if(/MWF|월수금/.test(s))return 'mwf';if(/TTH|화목/.test(s))return 'tth';return '?'}
// 영문 게이트: 둘 다 영문 있으면 first-token 겹쳐야 동일인 (동명이인 오배정 방지)
const engOK=(ge,ce)=>{const a=a0f(ge),b=a0f(ce);if(!a||!b)return true;return normK(ce).toLowerCase().includes(a)||normK(ge).toLowerCase().includes(b)}

// group parsed by (kor,eng,session_db)
const groups={}
for(const r of parsed){const k=`${r.kor}|${r.eng}|${r.session_db}`;(groups[k]=groups[k]||{kor:r.kor,eng:r.eng,session_db:r.session_db,arr:[],dep:[]})[r.dir].push(r)}

// DB index
const byName={}
for(const r of db.rows){(byName[normK(r.name)]=byName[normK(r.name)]||[]).push(r)}

const matched={},unmatched=[],ambiguous=[],homonymResolved=[]
for(const g of Object.values(groups)){
  const cat=sessCat(g.session_db)
  const a0=a0f(g.eng)
  let pool=byName[normK(g.kor)]||[]
  if(!pool.length){unmatched.push({kor:g.kor,eng:g.eng,session:g.session_db});continue}
  // 1) 세션 카테고리 일치 우선
  let cands=pool.filter(c=>sessCat(c.session)===cat)
  if(!cands.length)cands=pool
  let chosen
  if(cands.length===1)chosen=cands[0]
  else{
    const sc=cands.map(c=>{let s=0;const tag=[]
      if(a0&&normK(c.en).toLowerCase().includes(a0)){s+=5;tag.push('eng')}
      if(sessCat(c.session)===cat){s+=3;tag.push('sess')}
      return {c,s,tag:tag.join('+')}}).sort((x,y)=>y.s-x.s)
    if(sc[0].s>sc[1].s&&sc[0].s>0){chosen=sc[0].c;homonymResolved.push({kor:g.kor,by:sc[0].tag,chose:`${chosen.en}/${chosen.session}`})}
    else{ambiguous.push({kor:g.kor,eng:g.eng,session:g.session_db,cands:cands.map(c=>`${c.en}/${c.session}`)});continue}
  }
  // 영문 게이트: 선택된 후보의 영문이 엑셀과 불일치하면 동명이인 오배정 → 미적용(검토)
  if(!engOK(g.eng,chosen.en)){ambiguous.push({kor:g.kor,eng:g.eng,session:g.session_db,note:'eng불일치',cands:pool.map(c=>`${c.en}/${c.session}`)});continue}
  const eid=chosen.enrollment_id
  matched[eid]=matched[eid]||{db:chosen,groups:[]}; matched[eid].groups.push(g)
}

const built=[]
for(const[eid,info]of Object.entries(matched)){
  const arr={},dep={}; const flags=[]
  const isYu=/유치/.test(info.db.session)
  if(info.groups.length>1)flags.push(`복수섹션(${info.groups.map(x=>x.session_db).join(',')})`)
  for(const g of info.groups){
    for(const r of g.arr){const bn=r.bus,st=cleanStop(r.stop),t=fixTime(r.time,isYu,'arr')
      for(const d of r.days){if(!arr[d]){arr[d]=bn;if(st)arr[d+'_loc']=st}}
      if(t&&!arr['_time'])arr['_time']=t}
    for(const r of g.dep){const bn=r.bus,st=cleanStop(r.stop),t=fixTime(r.time,isYu,'dep')
      for(const d of r.days){dep[d]=bn;if(st)dep[d+'_loc']=st}
      if(t&&!dep['_time'])dep['_time']=t}
  }
  built.push({enrollment_id:eid,student:info.db.name,en:info.db.en,session:info.db.session,classtime:'',arr,dep,flag:flags.join(' | ')})
}
const matchedIds=new Set(Object.keys(matched))
const noShuttle=db.rows.filter(r=>!matchedIds.has(r.enrollment_id)).map(n=>({name:n.name,en:n.en,session:n.session,apt:n.apt}))
const withSched=built.filter(b=>Object.keys(b.arr).length||Object.keys(b.dep).length)
console.log('=== 광교 BUILD DRY-RUN ===')
console.log(`그룹(학생×세션) ${Object.keys(groups).length} | 매칭 enrollment ${Object.keys(matched).length} | 스케줄있음 ${withSched.length} | 미매칭 ${unmatched.length} | 모호 ${ambiguous.length} | 동명이인해결 ${homonymResolved.length} | 미이용 ${noShuttle.length}`)
console.log('\n--- 미매칭(상위20) ---'); unmatched.slice(0,20).forEach(u=>console.log(`  ${u.kor}(${u.eng}) [${u.session}]`))
console.log('\n--- 모호(상위15) ---'); ambiguous.slice(0,15).forEach(a=>console.log(`  ${a.kor}(${a.eng}) [${a.session}] :: ${a.cands.join(' | ')}`))
console.log('\n--- 샘플(3) ---'); built.slice(0,3).forEach(b=>console.log(`  ${b.student}/${b.en} [${b.session}] arr=${JSON.stringify(b.arr)} dep=${JSON.stringify(b.dep)}`))
fs.writeFileSync(A+'광교_dryrun.json',JSON.stringify({built,unmatched,ambiguous,homonymResolved,noShuttle},null,1),'utf8')
console.log('\nwrote 광교_dryrun.json')
