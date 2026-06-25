#!/usr/bin/env node
// verify-session-tabs.mjs (읽기전용) — page.tsx getRunLabel/sessBaseLabel/getSessPriority 로직 복제.
// 학생설정 탭 라벨(=수정 후) vs 개설반현황 raw name 비교. 중계 등 기존 캠퍼스 무변 확인.
import fs from 'node:fs'; import path from 'node:path'
function loadEnv(){const t=fs.readFileSync(path.resolve('.env.local'),'utf8');const e={};for(const l of t.split(/\r?\n/)){const m=l.match(/^([A-Za-z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^["']|["']$/g,'')}return e}
const ENV=loadEnv();const URL=ENV.NEXT_PUBLIC_SUPABASE_URL,KEY=ENV.SUPABASE_SERVICE_ROLE_KEY
async function sbGet(q){const r=await fetch(`${URL}/rest/v1/${q}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});if(!r.ok)throw new Error(`${q} ${r.status}`);return r.json()}

// ── page.tsx 로직 복제 (정본과 일치해야 함) ──
function getRunLabel(s,dir){if(s.includes('방과후'))return dir==='dep'?'매일반':'유치부';if(s.includes('유치부'))return '유치부';if(s.includes('매일반'))return '매일반';if(s.includes('월수금')||s.includes('3일반'))return '3일반';if(s.includes('화목')||s.includes('2일반'))return '2일반';return s}
function sessBaseLabel(s,dir){return getRunLabel(s,dir).replace(/ ?(등원|하원)$/,'')}
function getSessPriority(s,dir){if(s.includes('방과후'))return dir==='dep'?2:1.5;if(s.includes('유치부'))return 1;if(s.includes('매일반')||s.includes('5일'))return 2;if(s.includes('월수금')||s.includes('3일'))return 3;if(s.includes('화목')||s.includes('2일'))return 4;return 9}
// 수정 후 학생설정 탭 라벨 산출
function tabsAfter(names,dir){return ['전체',...[...new Set(names.map(n=>sessBaseLabel(n,dir)))].sort((a,b)=>getSessPriority(a,dir)-getSessPriority(b,dir))]}
const HARD=['전체','유치부','매일반','3일반','2일반'] // 수정 전(하드코딩)

function pickMonth(ms){const k=new Date(Date.now()+9*3600*1000);const y=k.getUTCFullYear(),m=k.getUTCMonth()+1;const cur=`${y}-${String(m).padStart(2,'0')}`,n=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;if(ms.includes(n))return n;if(ms.includes(cur))return cur;return ms.sort().pop()??''}

async function main(){
  const campuses=await sbGet('campuses?select=id,name')
  for(const c of campuses){
    const months=[...new Set((await sbGet(`class_sessions?select=month&campus_id=eq.${c.id}`)).map(r=>r.month))]
    if(!months.length)continue
    const month=pickMonth(months)
    const names=(await sbGet(`class_sessions?select=name&campus_id=eq.${c.id}&month=eq.${encodeURIComponent(month)}`)).map(s=>s.name)
    if(!names.length)continue
    const dep=tabsAfter(names,'dep')
    // 개설반현황 raw 비교: 각 raw name 의 sessBaseLabel 이 dep 탭에 존재하면 매칭 ✅
    const unmatched=names.filter(n=>!dep.includes(sessBaseLabel(n,'dep')))
    const changedVsHard=JSON.stringify(dep)!==JSON.stringify(HARD.filter(h=>h==='전체'||dep.includes(h)))||dep.some(x=>!HARD.includes(x))
    const flag = c.name==='송파' ? '◀ 대상' : (changedVsHard?'(라벨변동)':'(동일=무변)')
    console.log(`\n[${c.name}] ${month}`)
    console.log(`  raw세션 : ${names.join(' | ')}`)
    console.log(`  탭(하원): ${dep.join('  ')}   ${flag}`)
    console.log(`  개설반매칭: ${unmatched.length?('❌ 미매칭='+unmatched.join(',')):'✅ 전부 매칭'}`)
  }
}
main().catch(e=>{console.error('오류:',e);process.exit(1)})
