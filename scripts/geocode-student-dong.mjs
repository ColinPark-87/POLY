#!/usr/bin/env node
// geocode-student-dong.mjs <campus> [--commit]
// 학생 apartment → Kakao 지오코딩 → 행정동 추출 → detail_address="(동, 아파트)" + address=도로명 채움.
// 캠퍼스 중심 반경(RADKM) 내만 채택(먼 곳/오류주소는 미설정=대시보드 '기타'). 기본 DRY. update만(덮어쓰기는 빈 값일 때만).
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
const CAMP=process.argv[2]; const COMMIT=process.argv.includes('--commit')
const RADKM=Number((process.argv.find(a=>a.startsWith('--rad='))||'').split('=')[1]||12)
if(!CAMP){console.error('usage: geocode-student-dong.mjs <campus> [--commit] [--rad=12]');process.exit(1)}
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv(); const KEY=ENV.KAKAO_REST_API_KEY
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'

const {data:cs}=await sb.from('campuses').select('*'); const c=cs.find(x=>x.name===CAMP)
const {data:sc0}=await sb.from('campus_stop_coords').select('*').eq('campus_id',c.id)
const center=sc0.find(s=>s.stop_name===CAMP)||sc0[0]
if(!center){console.error('센터 좌표 없음 — 먼저 geocode-campus-stops 필요');process.exit(1)}
const CX=center.lng, CY=center.lat
const distKm=(la,ln)=>{const R=6371,dLa=(la-CY)*Math.PI/180,dLn=(ln-CX)*Math.PI/180,a=Math.sin(dLa/2)**2+Math.cos(CY*Math.PI/180)*Math.cos(la*Math.PI/180)*Math.sin(dLn/2)**2;return 2*R*Math.asin(Math.sqrt(a))}

let st=[];for(let f=0;;f+=1000){const{data}=await sb.from('campus_students').select('id,name,apartment,address,detail_address').eq('campus_id',c.id).order('name').range(f,f+999);st.push(...data);if(data.length<1000)break}

// 아파트명 정제 (★/차/등하/동-호 제거)
function cleanApt(a){return String(a||'')
  .replace(/[★*].*/,'').replace(/\([^)]*\)/g,' ')
  .split('/')[0]                           // '/등원:.../' 메모 절단
  .split(/->|승하차|등하원|등원|하원|승차|하차/)[0]
  .replace(/\b\d{2,4}[-]\d{1,4}\b/g,' ')   // 111-401 동호
  .replace(/\s*\d{1,4}동.*$/,' ')          // 끝 N동~
  .replace(/\s+(등|하|차|셔틀|새싹|정류장|관리실|관리사무소|정문|후문|쪽|앞).*$/,' ')
  .replace(/\s+/g,' ').trim()}
// 행정동 추출: 구/시 다음 토큰 중 동/가로 끝나는 것
function dongOf(addrName){const toks=String(addrName).split(/\s+/);let gi=toks.findIndex(t=>/(구|시)$/.test(t));for(let i=Math.max(gi+1,0);i<toks.length;i++){if(/[가-힣].*동$/.test(toks[i])||/동\d*가$/.test(toks[i]))return toks[i]}
  const m=String(addrName).match(/([가-힣]+동)(\d+가)?/);return m?m[1]+(m[2]||''):''}
async function kakao(q){const url=`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&x=${CX}&y=${CY}&radius=${Math.round(RADKM*1000)}&sort=accuracy`
  const r=await fetch(url,{headers:{Authorization:`KakaoAK ${KEY}`}});if(!r.ok)return null;const j=await r.json();const d=(j.documents||[])[0];if(!d)return null
  return {lat:+d.y,lng:+d.x,addr:d.address_name||'',road:d.road_address_name||d.place_name||''}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

// distinct apt → geocode (캐시)
const aptList=[...new Set(st.map(s=>cleanApt(s.apartment)).filter(Boolean))]
const aptMap={}; let okN=0,deferN=0
for(const apt of aptList){
  const hit=await kakao(apt); await sleep(110)
  if(hit){const d=distKm(hit.lat,hit.lng); if(d<=RADKM){const dong=dongOf(hit.addr); if(dong){aptMap[apt]={dong,addr:hit.addr,road:hit.road,distKm:+d.toFixed(2)};okN++;continue}}}
  aptMap[apt]=null; deferN++
}
console.log(`=== ${CAMP} 학생 동 ${COMMIT?'[COMMIT]':'[DRY]'} (반경 ${RADKM}km) ===`)
console.log(`distinct 아파트 ${aptList.length} | 동확정 ${okN} | 보류 ${deferN}`)
// 동 분포
const dongCount={}
let upd=0
for(const s of st){
  const ca=cleanApt(s.apartment); const info=ca?aptMap[ca]:null
  if(!info)continue
  dongCount[info.dong]=(dongCount[info.dong]||0)+1
}
console.log('동 분포:',Object.entries(dongCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}(${v})`).join(', '))

if(COMMIT){
  for(const s of st){
    const ca=cleanApt(s.apartment); const info=ca?aptMap[ca]:null
    if(!info)continue
    const detail=`(${info.dong}, ${ca})`
    const patch={}
    if(!(s.detail_address&&s.detail_address.trim())) patch.detail_address=detail
    if(!(s.address&&s.address.trim())&&info.road) patch.address=info.road
    if(!Object.keys(patch).length)continue
    const {error}=await sb.from('campus_students').update(patch).eq('id',s.id)
    if(error)console.error(' upd',s.name,error.message); else upd++
  }
  console.log('업데이트 학생:',upd)
}else console.log('(DRY: --commit 으로 적용)')
fs.writeFileSync(A+`${c.code}_dong.json`,JSON.stringify({center:{CX,CY},aptMap,dongCount},null,1),'utf8')
console.log('wrote',`${c.code}_dong.json`)
