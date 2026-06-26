// 대전 정류장 좌표 배치 — 카카오 지오코딩 → campus_stop_coords (대전 campus_id만, upsert).
import pkg from 'xlsx'; import fs from 'node:fs'; import path from 'node:path'
const XLSX=pkg.default??pkg
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const E=loadEnv(),U=E.NEXT_PUBLIC_SUPABASE_URL,K=E.SUPABASE_SERVICE_ROLE_KEY,KAKAO=E.KAKAO_REST_API_KEY
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json'}
async function get(q){const r=await fetch(`${U}/rest/v1/${q}`,{headers:H});if(!r.ok)throw new Error('GET '+q+' '+r.status);return r.json()}
async function getAll(t,q){const o=[];for(let f=0;;f+=1000){const r=await fetch(`${U}/rest/v1/${t}?${q}`,{headers:{...H,Range:`${f}-${f+999}`}});if(!r.ok)throw new Error('GET '+t+' '+r.status);const rows=await r.json();o.push(...rows);if(rows.length<1000)break}return o}
const norm=s=>(s??'').toString().replace(/\s+/g,' ').trim()
// 대전 bbox (대략): lat 36.1~36.55, lng 127.2~127.55
const inDJ=(lat,lng)=>lat>36.05&&lat<36.6&&lng>127.15&&lng<127.6
const CX=127.3845,CY=36.3504 // 대전시청 bias

// ---- 정류장 -> 대표 주소 매핑 (원본 재파싱) ----
const T=v=>{ if(v==null||v==='')return''; if(v instanceof Date)return v.toISOString().slice(11,16); if(typeof v==='number'){const tot=Math.round(v*24*60);return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0')} const m=String(v).match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/); if(m)return m[1].padStart(2,'0')+':'+((m[2]||'00')).padStart(2,'0'); return String(v).trim() }
const dir='../Raw/0626/26년 3월 차량배차표 (대전)/'
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.xlsx'))
const stopAddr={} // stop_name -> {addr:count}
function addStop(stop,addr){if(!stop)return; const s=norm(stop); if(!s)return; stopAddr[s]=stopAddr[s]||{}; const a=norm(addr); if(a)stopAddr[s][a]=(stopAddr[s][a]||0)+1; else stopAddr[s]['']=(stopAddr[s]['']||0)+1}
for(const fn of files){ if(fn.includes('셔틀이용명단'))continue
  const wb=XLSX.read(fs.readFileSync(dir+fn),{cellDates:true})
  for(const sn of wb.SheetNames){const grid=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true})
    let hr=grid.findIndex(r=>r.some(c=>/명단|성명/.test(String(c)))&&r.some(c=>/등원시간|하원시간/.test(String(c)))); if(hr<0)hr=3
    const hdr=(grid[hr]||[]).map(x=>String(x)); const find=re=>hdr.findIndex(h=>re.test(h))
    const cName=find(/명단|성명/),cAddr=find(/주소/),cArrT=find(/등원시간/),cDepT=find(/하원시간/)
    const places=hdr.map((h,i)=>/장소/.test(h)?i:-1).filter(i=>i>=0)
    const cArrL=places.find(i=>i>cArrT&&(cDepT<0||i<cDepT)), cDepL=cDepT>=0?places.find(i=>i>cDepT):undefined
    let aL='',dL=''
    const isLabel=s=>/유치부|방과후|비고/.test(s)
    for(let i=hr+1;i<grid.length;i++){const row=grid[i]; const name=norm(row[cName])
      if(cArrL>=0&&norm(row[cArrL])!=='')aL=norm(row[cArrL]); if(cDepL>=0&&norm(row[cDepL])!=='')dL=norm(row[cDepL])
      if(!name||/명단|학생이름|성명/.test(name))continue
      const addr=norm(row[cAddr]); if(!isLabel(aL))addStop(aL,addr); if(!isLabel(dL))addStop(dL,addr)
    }
  }
}
{ const fn=files.find(f=>f.includes('셔틀이용명단')); const wb=XLSX.read(fs.readFileSync(dir+fn),{cellDates:true})
  for(const sn of wb.SheetNames){const grid=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true})
    let hr=grid.findIndex(r=>r.some(c=>/승차장소|학생이름/.test(String(c)))); if(hr<0)hr=5
    const hdr=(grid[hr]||[]).map(x=>String(x)); const find=re=>hdr.findIndex(h=>re.test(h))
    const cL=find(/승차장소|탑승장소/),cName=find(/학생이름|명단/),cAddr=find(/주소/)
    let aL=''
    for(let i=hr+1;i<grid.length;i++){const row=grid[i]; const name=norm(row[cName>=0?cName:3])
      if(cL>=0&&norm(row[cL])!=='')aL=norm(row[cL])
      if(!name||/학생이름|명단/.test(name))continue
      addStop(aL,norm(row[cAddr>=0?cAddr:6]))
    }
  }
}
function bestAddr(stop){const m=stopAddr[stop]||{}; const e=Object.entries(m).filter(([a])=>a).sort((x,y)=>y[1]-x[1]); return e[0]?e[0][0]:''}

// ---- kakao ----
async function kakao(type,q){const url=`https://dapi.kakao.com/v2/local/search/${type}.json?query=${encodeURIComponent(q)}&size=5`+(type==='keyword'?`&x=${CX}&y=${CY}&radius=20000&sort=distance`:'')
  const r=await fetch(url,{headers:{Authorization:`KakaoAK ${KAKAO}`}}); if(!r.ok)return[]; const d=await r.json()
  return (d.documents??[]).map(x=>({lat:parseFloat(x.y),lng:parseFloat(x.x),name:x.place_name||x.address_name}))}
const cleanStop=s=>norm(s).replace(/\s*(앞|뒤|건너편|맞은편|입구|정문|후문|횡단보도|승강장|승차장|정류장|스쿨버스|놀이터|상가|약국|앞쪽)\s*/g,' ').replace(/\d+동.*$/,'').trim()
async function geocodeStop(stop){
  const addr=bestAddr(stop)
  const tries=[]
  if(addr){ if(/(로|길)\s*\d|[가-힣]+시\s|[가-힣]+구\s/.test(addr))tries.push(['address',addr]); tries.push(['keyword',addr+' 대전']); tries.push(['keyword',addr]) }
  const cs=cleanStop(stop); if(cs)tries.push(['keyword',cs+' 대전']); tries.push(['keyword',stop+' 대전'])
  for(const [type,q] of tries){ const res=await kakao(type,q); const hit=res.find(r=>inDJ(r.lat,r.lng)); if(hit)return{...hit,q,type,addr} }
  return null
}

// ---- run ----
const c=(await get('campuses?select=id,name')).find(x=>x.name.includes('대전'))
const regs=await getAll('campus_registered_stops',`select=stop_name&campus_id=eq.${c.id}`)
const existing=new Set((await getAll('campus_stop_coords',`select=stop_name&campus_id=eq.${c.id}`)).map(x=>x.stop_name))
const stops=[...new Set(regs.map(r=>norm(r.stop_name)))]
console.log('대전 정류장',stops.length,' 기존좌표',existing.size)
const ONLY_NEW=process.argv.includes('--only-new')
const DRY=process.argv.includes('--dry')
const ok=[],fail=[]
for(const s of stops){
  if(ONLY_NEW&&existing.has(s)){continue}
  let g=null; try{g=await geocodeStop(s)}catch(e){}
  if(g){ok.push({stop_name:s,lat:g.lat,lng:g.lng,via:g.type,q:g.q})}
  else fail.push({stop_name:s,addr:bestAddr(s)})
  await new Promise(r=>setTimeout(r,60))
}
console.log('geocoded ok',ok.length,' fail',fail.length)
console.log('fail 샘플:',fail.slice(0,15).map(f=>f.stop_name).join(' | '))
const out='../산출물/대전차량_2026-06-26/'
fs.writeFileSync(out+'_coords_result.json',JSON.stringify({ok,fail},null,1))
fs.writeFileSync(out+'_좌표실패.csv','﻿'+['stop_name,addr'].concat(fail.map(f=>`"${f.stop_name}","${f.addr}"`)).join('\n'))
if(DRY){console.log('DRY — no DB write. result -> _coords_result.json');process.exit(0)}
// upsert
const rows=ok.map(o=>({campus_id:c.id,stop_name:o.stop_name,lat:o.lat,lng:o.lng,updated_at:new Date().toISOString(),updated_by:'Colin'}))
for(let i=0;i<rows.length;i+=200){const r=await fetch(`${U}/rest/v1/campus_stop_coords?on_conflict=campus_id,stop_name`,{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows.slice(i,i+200))});if(!r.ok){console.log('upsert FAIL',r.status,await r.text());process.exit(1)}}
console.log('campus_stop_coords upserted:',rows.length,'(대전만)')
console.log('실패',fail.length,'건 -> _좌표실패.csv (수동 핀 필요)')
