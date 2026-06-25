#!/usr/bin/env node
// mokdong-fix-timerange.mjs [--commit]
// 목동매그넷 세션 time_range 채움 (차량관리 timeGroups 렌더 조건). 개설반/재원생 불변.
import fs from 'node:fs'; import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
const COMMIT=process.argv.includes('--commit')
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv()
const sb=createClient(ENV.NEXT_PUBLIC_SUPABASE_URL,ENV.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const {data:cs}=await sb.from('campuses').select('*'); const c=cs.find(x=>x.name==='목동매그넷')
const RANGES={'1st Block':'14:30~16:00','2nd Block(MWF)':'16:05~18:00','2nd Block(TTH)':'16:05~18:45','3rd Block(MW)':'18:05~20:15'}
const {data:sessions}=await sb.from('class_sessions').select('*').eq('campus_id',c.id)
console.log(`=== 목동매그넷 time_range ${COMMIT?'[COMMIT]':'[DRY]'} ===`)
for(const s of sessions){
  const tr=RANGES[s.name]
  console.log(`  ${s.name} [${s.month}]: 현재='${s.time_range||''}' → '${tr||'(매핑없음)'}'`)
  if(COMMIT&&tr&&s.time_range!==tr){const {error}=await sb.from('class_sessions').update({time_range:tr}).eq('id',s.id);if(error)console.error('   err',error.message);else console.log('   updated')}
}
