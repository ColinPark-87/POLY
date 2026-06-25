#!/usr/bin/env node
// gwangmyeong-cleanup.mjs [--commit]
// 광명 광교-import 잔재(비재원 + 광교신호) 정리. 재원생(360)·연결데이터 보존. 백업 후 삭제.
// 정리대상 = 비재원(enrollment 0건) AND (★표기 OR 광교/수원키워드 OR 거리>20km OR 아파트빈값/잡음).
// 보존 = 비재원이어도 광명권 정상아파트(★없고 키워드없고 근거리)는 제외+리포트.
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
const COMMIT=process.argv.includes('--commit')
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const A='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
const classify=JSON.parse(fs.readFileSync(A+'GM_cleanup_classify.json','utf8'))
const nearIds=new Set(classify.near.map(s=>s.id))   // 광명권(거리<=20, 키워드없음)

const {data:cs}=await sb.from('campuses').select('*'); const c=cs.find(x=>x.name==='광명')
let st=[];for(let f=0;;f+=1000){const{data}=await sb.from('campus_students').select('*').eq('campus_id',c.id).order('name').range(f,f+999);st.push(...data);if(data.length<1000)break}
let enr=[];for(let f=0;;f+=1000){const{data}=await sb.from('class_enrollments').select('student_id,id').eq('campus_id',c.id).order('id').range(f,f+999);enr.push(...data);if(data.length<1000)break}
const enrolled=new Set(enr.map(e=>e.student_id))
let ov=[];for(let f=0;;f+=1000){const{data}=await sb.from('pickup_overrides').select('student_id').eq('campus_id',c.id).order('id').range(f,f+999);if(!data)break;ov.push(...data);if(data.length<1000)break}
const hasOv=new Set(ov.map(o=>o.student_id))

// 사용자 지시(2026-06-16): 재원생 360만 남기고 비재원 전체 삭제.
const nonEnr=st.filter(s=>!enrolled.has(s.id))
const delSet=nonEnr, keepSet=[]
// 안전: 정리대상 중 재원/override 충돌
const conflict=delSet.filter(s=>enrolled.has(s.id)||hasOv.has(s.id))
console.log(`=== 광명 정리 ${COMMIT?'[COMMIT]':'[DRY]'} ===`)
console.log(`전체 ${st.length} | 재원 ${enrolled.size}(보존) | 비재원 ${nonEnr.length}`)
console.log(`  정리대상(삭제): ${delSet.length}`)
console.log(`  비재원이나 보존(광명권 추정/검토): ${keepSet.length}`)
console.log(`  [안전] 삭제대상 중 재원/차량 충돌: ${conflict.length} (0이어야 함)`)
console.log('\n보존(검토) 목록:',keepSet.map(s=>`${s.name}/${(s.apartment||'(빈값)').slice(0,18)}`).join(' | '))
if(conflict.length){console.error('\n⚠️ 충돌 있음 — 중단');process.exit(1)}

// 백업
const stamp='2026-06-16'
const bdir=path.resolve('_archive','backups',`gwangmyeong-cleanup-${stamp}`)
fs.mkdirSync(bdir,{recursive:true})
fs.writeFileSync(path.join(bdir,'deleted_students.json'),JSON.stringify(delSet,null,1),'utf8')
fs.writeFileSync(path.join(bdir,'kept_nonenrolled.json'),JSON.stringify(keepSet,null,1),'utf8')
console.log('\n백업:',bdir)

if(COMMIT){
  let del=0
  for(let i=0;i<delSet.length;i+=100){
    const ids=delSet.slice(i,i+100).map(s=>s.id)
    const {error}=await sb.from('campus_students').delete().in('id',ids).eq('campus_id',c.id)
    if(error)console.error(' del',error.message); else del+=ids.length
  }
  console.log('삭제 완료:',del)
}else console.log('(DRY: --commit 으로 삭제)')
