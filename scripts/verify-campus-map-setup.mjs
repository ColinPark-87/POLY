#!/usr/bin/env node
// verify-campus-map-setup.mjs  (READ-ONLY — DB에 일절 쓰지 않음)
// 캠퍼스별 지도 마킹 "세팅 여부"를 점검한다:
//   1) 학생 아파트/학교 데이터가 있는가 (집계 원천)
//   2) 센터 좌표가 있는가 (campus_stop_coords 중 stop_name === 캠퍼스명, 또는 임의 stop)
//      → 없으면 RouteMapView가 if(!center) return 으로 지오코딩 자체를 안 함 → 마킹 0
//   3) 수동 place-spot 오버라이드(campus_place_spots)가 있는가 (HQ에서도 뜨는 경로)
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const NOISE=new Set(['','없음','미입력',null,undefined])
async function all(table,campusId,cols,order){const out=[];for(let f=0;;f+=1000){let q=sb.from(table).select(cols).eq('campus_id',campusId).range(f,f+999);if(order)q=q.order(order);const{data,error}=await q;if(error){console.error(table,error.message);break}out.push(...(data||[]));if(!data||data.length<1000)break}return out}

const {data:campuses,error}=await sb.from('campuses').select('id,name,code').order('name')
if(error){console.error(error.message);process.exit(1)}

const rows=[]
for(const c of campuses){
  const students=await all('campus_students',c.id,'apartment,school,is_active')
  const active=students.filter(s=>s.is_active!==false)
  const aptN=active.filter(s=>!NOISE.has((s.apartment||'').trim())).length
  const schN=active.filter(s=>!NOISE.has((s.school||'').trim())).length
  const coords=await all('campus_stop_coords',c.id,'stop_name,lat,lng')
  const nameTrim=(c.name||'').replace(/\s+/g,'').trim()
  const centerByName=coords.find(r=>(r.stop_name||'').replace(/\s+/g,'').trim()===nameTrim && Number.isFinite(r.lat)&&Number.isFinite(r.lng))
  const anyCoord=coords.find(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lng))
  const spots=await all('campus_place_spots',c.id,'kind,name,lat,lng,hidden')
  const spotCoord=spots.filter(s=>!s.hidden&&Number.isFinite(s.lat)&&Number.isFinite(s.lng)).length
  rows.push({
    name:c.name, code:c.code,
    active:active.length, apt:aptN, sch:schN,
    coordRows:coords.length,
    centerByName:!!centerByName,
    centerFallback:!centerByName&&!!anyCoord,  // 캠퍼스명 매칭은 없지만 임의 stop 좌표는 있음
    noCenter:!anyCoord,                         // 좌표가 아예 없음 → 지오코딩 0
    placeSpots:spotCoord,
  })
}

// 출력
const pad=(s,n)=>String(s).padEnd(n)
const padL=(s,n)=>String(s).padStart(n)
console.log('\n=== 캠퍼스별 지도 마킹 세팅 점검 (READ-ONLY) ===\n')
console.log(pad('캠퍼스',12)+pad('code',7)+padL('활성',5)+padL('아파트',7)+padL('학교',6)+padL('좌표行',7)+'  센터        place_spots')
console.log('-'.repeat(78))
for(const r of rows){
  const center = r.centerByName ? '✅이름매칭' : r.centerFallback ? '⚠️폴백(임의stop)' : '❌없음(마킹0)'
  console.log(pad(r.name,12)+pad(r.code,7)+padL(r.active,5)+padL(r.apt,7)+padL(r.sch,6)+padL(r.coordRows,7)+'  '+pad(center,16)+padL(r.placeSpots,4))
}
console.log('-'.repeat(78))
const noCenter=rows.filter(r=>r.noCenter)
const fallback=rows.filter(r=>r.centerFallback)
const hasData=rows.filter(r=>r.apt+r.sch>0)
console.log(`\n요약: 전체 ${rows.length}개 캠퍼스`)
console.log(`  - 아파트/학교 데이터 있음: ${hasData.length}개`)
console.log(`  - 센터좌표 이름매칭: ${rows.filter(r=>r.centerByName).length}개`)
console.log(`  - 센터좌표 폴백(임의stop): ${fallback.length}개  ${fallback.map(r=>r.name).join(', ')}`)
console.log(`  - 센터좌표 아예없음(지오코딩 0): ${noCenter.length}개  ${noCenter.map(r=>r.name).join(', ')}`)
const dataNoCenter=rows.filter(r=>r.apt+r.sch>0 && r.noCenter)
console.log(`\n⚠️ 데이터는 있는데 센터좌표가 없어 마킹 0인 캠퍼스: ${dataNoCenter.length}개`)
for(const r of dataNoCenter) console.log(`   - ${r.name}(${r.code}): 아파트${r.apt}·학교${r.sch}명 있으나 센터좌표 없음`)
