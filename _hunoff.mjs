import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: before } = await sb.from('classrooms').select('display_name,force_popup_class_id').eq('id','classroom_hungary')
console.log('해제 전 Hungary:', before)
const { error } = await sb.from('classrooms').update({ force_popup_class_id: null }).eq('id','classroom_hungary')
console.log(error ? ('ERR '+error.message) : '✅ Hungary force_popup 해제됨')
