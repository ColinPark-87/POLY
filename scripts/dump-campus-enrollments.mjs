#!/usr/bin/env node
// dump-campus-enrollments.mjs <campusName>  (읽기전용)
// 캠퍼스의 enrollment를 학생명·세션·반과 함께 덤프 + 동명이인 탐지.
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const NAME=process.argv[2]||'목동매그넷'
async function all(table,campusId,order){const out=[];for(let f=0;;f+=1000){const{data,error}=await sb.from(table).select('*').eq('campus_id',campusId).order(order).range(f,f+999);if(error){console.error(table,error.message);break}out.push(...(data||[]));if(!data||data.length<1000)break}return out}
const {data:cs}=await sb.from('campuses').select('*')
const c=cs.find(x=>x.name===NAME); if(!c){console.error('no campus',NAME);process.exit(1)}
const students=await all('campus_students',c.id,'name')
const sessions=await all('class_sessions',c.id,'name')
const classes=await all('classes',c.id,'id')
const enr=await all('class_enrollments',c.id,'id')
const sById=Object.fromEntries(students.map(s=>[s.id,s]))
const clById=Object.fromEntries(classes.map(x=>[x.id,x]))
const sessById=Object.fromEntries(sessions.map(x=>[x.id,x]))
const rows=enr.map(e=>{const st=sById[e.student_id]||{};const cl=clById[e.class_id]||{};const se=sessById[cl.session_id]||{};return{enrollment_id:e.id,student_id:e.student_id,name:st.name,en:st.english_name,grade:st.grade,apt:st.apartment,school:st.school,session:se.name,month:se.month,level:cl.level,is_waitlist:e.is_waitlist}})
// homonyms: same name multiple students
const byName={}; for(const s of students){(byName[s.name]=byName[s.name]||[]).push(s)}
const homonyms=Object.entries(byName).filter(([n,a])=>a.length>1)
console.log(`=== ${NAME} (${c.id}) ===`)
console.log(`students:${students.length} enrollments:${enr.length} sessions:${sessions.length}`)
console.log('session list:',sessions.map(s=>`${s.name}[${s.month}]`).join(' | '))
console.log(`\n동명이인(같은 한글이름 복수 student): ${homonyms.length}건`)
for(const[n,a] of homonyms) console.log(`  ${n}: `+a.map(s=>`${s.english_name||'-'}/${s.apartment||'-'}/${s.grade||'-'}(${s.id.slice(0,8)})`).join('  ||  '))
const OUT='C:/Users/user/Desktop/Colin 작업폴더/산출물/버스적용_2026-06-16/_분석/'
fs.writeFileSync(OUT+`${c.code}_${NAME}_enrollments.json`,JSON.stringify({campus:c,rows,homonyms:homonyms.map(([n,a])=>({name:n,students:a}))},null,1),'utf8')
console.log('\nwrote',`${c.code}_${NAME}_enrollments.json`)
