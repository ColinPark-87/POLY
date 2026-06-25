#!/usr/bin/env node
// geocode-campus-stops.mjs <campusName> [--commit]
// 캠퍼스 enrollment 스케줄의 정류장명을 Kakao로 지오코딩 → 센터 8km 이내만 campus_stop_coords upsert.
// 실패/8km밖은 보류(요구10). 기본 DRY.
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
const NAME=process.argv[2]||'목동매그넷'
const COMMIT=process.argv.includes('--commit')
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const KEY=ENV.KAKAO_REST_API_KEY
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'

const {data:cs}=await sb.from('campuses').select('*'); const c=cs.find(x=>x.name===NAME)
const {data:sc0}=await sb.from('campus_stop_coords').select('*').eq('campus_id',c.id)
const center=sc0.find(s=>s.stop_name===NAME)||sc0[0]
if(!center){console.error('센터 좌표 없음');process.exit(1)}
const CX=center.lng, CY=center.lat
const haveCoord=new Set(sc0.map(s=>s.stop_name))
function distKm(la,ln){const R=6371,dLa=(la-CY)*Math.PI/180,dLn=(ln-CX)*Math.PI/180,a=Math.sin(dLa/2)**2+Math.cos(CY*Math.PI/180)*Math.cos(la*Math.PI/180)*Math.sin(dLn/2)**2;return 2*R*Math.asin(Math.sqrt(a))}

// 스케줄에서 정류장 수집
let enr=[];for(let f=0;;f+=1000){const{data}=await sb.from('class_enrollments').select('arr_schedule,dep_schedule').eq('campus_id',c.id).order('id').range(f,f+999);enr.push(...data);if(data.length<1000)break}
const stops=new Set()
for(const e of enr)for(const s of[e.arr_schedule,e.dep_schedule])if(s)for(const k of Object.keys(s))if(k.endsWith('_loc')&&s[k])stops.add(s[k])

// 검색어 정제: 괄호/요일프리픽스/날짜 제거, 방향어(건너편/앞/후문/정문/횡단) 제거하되 핵심 보존
function cleanQuery(name){
  let q=String(name).replace(/\([^)]*\)/g,' ').replace(/^[월화수목금,\/\s]*[:：]/,'').replace(/\d+월[~]?/g,' ')
  q=q.replace(/(건너편|맞은편|사잇길|횡단보도|횡단|버스정류장|정류장|입구|앞|뒤|옆|후문|정문|상가)/g,' ')
  return q.replace(/\s+/g,' ').trim()
}
async function kakao(query,mode){ // mode: keyword|address
  const url=mode==='address'
    ? `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`
    : `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&x=${CX}&y=${CY}&radius=8000&sort=accuracy`
  const r=await fetch(url,{headers:{Authorization:`KakaoAK ${KEY}`}})
  if(!r.ok)return null
  const j=await r.json(); const d=(j.documents||[])[0]; if(!d)return null
  return {lat:+(d.y),lng:+(d.x),addr:d.address_name||d.road_address_name||d.place_name}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

const results=[]; let okN=0,deferN=0,skipHave=0
for(const name of stops){
  if(haveCoord.has(name)){skipHave++;continue}
  const q=cleanQuery(name); if(!q){results.push({name,status:'defer:empty'});deferN++;continue}
  let hit=await kakao(q,'keyword'); let how='kw'
  if(!hit){hit=await kakao('목동 '+q,'keyword');how='kw목동'}
  if(!hit){hit=await kakao(q,'address');how='addr'}
  await sleep(120)
  if(hit){const d=distKm(hit.lat,hit.lng); if(d<=8){results.push({name,q,...hit,distKm:+d.toFixed(2),how});okN++}else{results.push({name,q,status:`defer:${d.toFixed(1)}km`,cand:hit.addr});deferN++}}
  else{results.push({name,q,status:'defer:nohit'});deferN++}
}
console.log(`=== ${NAME} geocode ${COMMIT?'[COMMIT]':'[DRY]'} ===`)
console.log(`정류장 ${stops.size} | 이미좌표 ${skipHave} | 8km내 해결 ${okN} | 보류 ${deferN}`)
const upserts=results.filter(r=>r.lat).map(r=>({campus_id:c.id,stop_name:r.name,lat:r.lat,lng:r.lng}))
if(COMMIT&&upserts.length){
  // 청크 upsert
  for(let i=0;i<upserts.length;i+=200){const {error}=await sb.from('campus_stop_coords').upsert(upserts.slice(i,i+200),{onConflict:'campus_id,stop_name'});if(error)console.error('upsert',error.message)}
  console.log(`upserted ${upserts.length} stop_coords`)
}
fs.writeFileSync(A+`${c.code}_geocode.json`,JSON.stringify(results,null,1),'utf8')
console.log('wrote',`${c.code}_geocode.json`)
console.log('\n보류 샘플:',results.filter(r=>!r.lat).slice(0,20).map(r=>r.name).join(' | '))
