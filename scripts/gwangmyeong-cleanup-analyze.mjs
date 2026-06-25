#!/usr/bin/env node
// gwangmyeong-cleanup-analyze.mjs  (읽기전용 분석)
// 광명 비재원 학생을 아파트 거리로 분류 → 광교/수원 잔재(far) vs 광명권(near) vs 불명.
// 재원생/연결데이터(enrollment·override) 충돌 확인. 삭제 안 함.
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv(); const KEY=ENV.KAKAO_REST_API_KEY
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'

const {data:cs}=await sb.from('campuses').select('*'); const c=cs.find(x=>x.name==='광명')
const {data:sc0}=await sb.from('campus_stop_coords').select('*').eq('campus_id',c.id)
const center=sc0.find(s=>s.stop_name==='광명')||sc0[0]
const CX=center.lng, CY=center.lat
const distKm=(la,ln)=>{const R=6371,dLa=(la-CY)*Math.PI/180,dLn=(ln-CX)*Math.PI/180,a=Math.sin(dLa/2)**2+Math.cos(CY*Math.PI/180)*Math.cos(la*Math.PI/180)*Math.sin(dLn/2)**2;return 2*R*Math.asin(Math.sqrt(a))}

let st=[];for(let f=0;;f+=1000){const{data}=await sb.from('campus_students').select('*').eq('campus_id',c.id).order('name').range(f,f+999);st.push(...data);if(data.length<1000)break}
let enr=[];for(let f=0;;f+=1000){const{data}=await sb.from('class_enrollments').select('student_id').eq('campus_id',c.id).order('id').range(f,f+999);enr.push(...data);if(data.length<1000)break}
const enrolled=new Set(enr.map(e=>e.student_id))
let ov=[];for(let f=0;;f+=1000){const{data}=await sb.from('pickup_overrides').select('student_id').eq('campus_id',c.id).order('id').range(f,f+999);if(!data)break;ov.push(...data);if(data.length<1000)break}
const hasOverride=new Set(ov.map(o=>o.student_id))

const dongCache=JSON.parse(fs.readFileSync(A+'GM_dong.json','utf8')).aptMap||{}
const cleanApt=a=>String(a||'').replace(/[★*].*/,'').replace(/\([^)]*\)/g,' ').split('/')[0].split(/->|승하차|등하원|등원|하원|승차|하차/)[0].replace(/\b\d{2,4}[-]\d{1,4}\b/g,' ').replace(/\s*\d{1,4}동.*$/,' ').replace(/\s+(등|하|차|셔틀|새싹|정류장|관리실|관리사무소|정문|후문|쪽|앞).*$/,' ').replace(/\s+/g,' ').trim()
const farKw=/광교|수원|영통|동탄|화서|성복|상현|청명|용인|기흥|반정|봉담|광주|호매실|망포/
async function kakao(q){const url=`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&sort=accuracy`;const r=await fetch(url,{headers:{Authorization:`KakaoAK ${KEY}`}});if(!r.ok)return null;const j=await r.json();const d=(j.documents||[])[0];if(!d)return null;return {lat:+d.y,lng:+d.x,addr:d.address_name||''}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

const nonEnr=st.filter(s=>!enrolled.has(s.id))
const far=[],near=[],nogeo=[]
for(const s of nonEnr){
  const ca=cleanApt(s.apartment)
  let dist=null, addr=''
  if(farKw.test(s.apartment||'')){far.push({...s,_d:'kw',_addr:''});continue}
  const cached=ca&&dongCache[ca]
  if(cached){dist=cached.distKm;addr=cached.addr}
  else if(ca){const hit=await kakao(ca);await sleep(110);if(hit){dist=distKm(hit.lat,hit.lng);addr=hit.addr}}
  if(dist==null)nogeo.push({...s,_addr:addr})
  else if(dist>20)far.push({...s,_d:dist.toFixed(1),_addr:addr})
  else near.push({...s,_d:dist.toFixed(1),_addr:addr})
}
// 충돌 확인
const farConflict=far.filter(s=>enrolled.has(s.id)||hasOverride.has(s.id))
console.log('=== 광명 정리 분석 (삭제 안 함) ===')
console.log(`전체 ${st.length} | 재원 ${enrolled.size} | 비재원 ${nonEnr.length}`)
console.log(`\n[비재원 분류]`)
console.log(`  광교/수원권(far, 정리대상): ${far.length}`)
console.log(`  광명권(near, 보존): ${near.length}`)
console.log(`  지오코딩불가(nogeo, 검토): ${nogeo.length}`)
console.log(`\n[안전 확인] 정리대상 중 재원생/override 충돌: ${farConflict.length} (0이어야 함)`)
console.log('\nfar 샘플:',far.slice(0,8).map(s=>`${s.name}/${(s.apartment||'').slice(0,16)}`).join(' | '))
console.log('near 샘플(보존):',near.slice(0,8).map(s=>`${s.name}/${(s.apartment||'').slice(0,16)}`).join(' | '))
console.log('nogeo 샘플:',nogeo.slice(0,8).map(s=>`${s.name}/${(s.apartment||'').slice(0,14)}`).join(' | '))
fs.writeFileSync(A+'GM_cleanup_classify.json',JSON.stringify({far,near,nogeo,farConflict},null,1),'utf8')
console.log('\nwrote GM_cleanup_classify.json')
