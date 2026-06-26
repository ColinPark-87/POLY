import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const c=(await sb.from('campuses').select('id,name')).data.find(x=>x.name==='목동')
const {data:u}=await sb.from('users').select('*').eq('campus_id',c.id).ilike('name','%이수빈%')
for(const r of u){
  console.log('name=['+r.name+'] len='+r.name.length+' codes='+[...r.name].map(ch=>ch.charCodeAt(0)).join(','))
  console.log('email=['+r.email+']')
  console.log('role='+r.role+' position='+r.position+' is_active='+r.is_active)
  console.log('전체 컬럼:', JSON.stringify(r))
}
// 동명이인 체크: name eq exact '이수빈'
const {data:exact}=await sb.from('users').select('id,name').eq('campus_id',c.id).eq('name','이수빈')
console.log('\n.eq("name","이수빈") 정확매칭 결과 수:', exact?.length||0)
