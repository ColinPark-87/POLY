// 캠퍼스별 학교/아파트를 캠퍼스중심 기준 지오코딩 → 반경 내만 남겨 lib/data/campus-geo-filter.json 생성.
// 반경: 광교·광명 11km(겹침방지), 그 외 15km. 중심편향(x/y/radius) 검색으로 동명학교 지역혼동 방지.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env={};for(const l of readFileSync(new URL('../.env.local',import.meta.url),'utf8').split('\n')){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m)env[m[1]]=m[2].replace(/^["']|["']$/g,'')}
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const KEY=env.KAKAO_REST_API_KEY
const RADIUS={ '광교':11, '광명':11 }
const norm=(s)=>{let v=(s??'').replace(/[★☆◆●▶•]/g,' ').replace(/\s+/g,' ').trim();if(!v)return '';return v.replace(/\s*\d{1,4}\s*-\s*\d{1,4}\s*$/,'').replace(/\s*\d{1,4}\s*동(\s*\d{1,4}\s*호)?\s*$/,'').replace(/\s*\d{1,4}\s*호\s*$/,'').trim()}
async function pa(t,s,b){let f=0,o=[];for(;;){const{data}=await b(db.from(t).select(s)).range(f,f+999);if(!data?.length)break;o.push(...data);if(data.length<1000)break;f+=1000}return o}
const sleep=(ms)=>new Promise(z=>setTimeout(z,ms))
async function kk(q,ctr,radM){let u=`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`;if(ctr)u+=`&x=${ctr.lng}&y=${ctr.lat}&radius=${radM}&sort=distance`;const r=await fetch(u,{headers:{Authorization:`KakaoAK ${KEY}`}});if(!r.ok)return[];const d=await r.json();return(d.documents??[]).map(x=>({name:x.place_name,cat:x.category_name||'',lat:+x.y,lng:+x.x}))}
const hav=(a,b)=>{const R=6371,t=Math.PI/180,dx=(b.lat-a.lat)*t,dy=(b.lng-a.lng)*t;const h=Math.sin(dx/2)**2+Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin(dy/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
const {data:campuses}=await db.from('campuses').select('id,name')
const targets=['광교','광명','대전','목동매그넷','송도','송파','수지','운정','분당']
const out={}
for(const key of targets){
  const c=campuses.find(x=>x.name===key)||campuses.find(x=>x.name.includes(key));if(!c)continue
  const {data:coords}=await db.from('campus_stop_coords').select('stop_name,lat,lng').eq('campus_id',c.id)
  const ctr=(coords||[]).find(x=>x.stop_name===c.name)||(coords||[])[0];if(!ctr)continue
  const rad=RADIUS[c.name]??15, biasM=Math.round((rad+1)*1000)
  const studs=await pa('campus_students','school,apartment',q=>q.eq('campus_id',c.id).eq('is_active',true))
  const sc={};for(const s of studs){const v=(s.school||'').replace(/\s+/g,' ').trim();if(v&&v!=='없음'&&v!=='미입력'&&/초등학교|초$/.test(v))sc[v]=(sc[v]||0)+1}
  const schools=[]
  for(const [name,count] of Object.entries(sc)){
    const r=await kk(name,ctr,biasM);const hit=r.find(d=>/초등학교|학교/.test(d.name))||null
    const dist=hit?+hav(ctr,hit).toFixed(2):null
    schools.push({name,count,lat:hit?.lat??null,lng:hit?.lng??null,dist,within:dist!==null&&dist<=rad});await sleep(70)
  }
  const ap={};for(const s of studs){const v=norm(s.apartment);if(v&&v!=='없음'&&v!=='미입력')ap[v]=(ap[v]||0)+1}
  const apts=[]
  for(const [name,count] of Object.entries(ap).sort((a,b)=>b[1]-a[1]).slice(0,30)){
    const r=await kk(name,ctr,biasM);const hit=r.find(d=>/아파트|단지/.test(d.name))||r[0]||null
    const dist=hit?+hav(ctr,hit).toFixed(2):null
    apts.push({name,count,lat:hit?.lat??null,lng:hit?.lng??null,dist,within:dist!==null&&dist<=rad});await sleep(70)
  }
  out[c.name]={center:{lat:ctr.lat,lng:ctr.lng},radiusKm:rad,schools:schools.sort((a,b)=>b.count-a.count),apartments:apts.sort((a,b)=>b.count-a.count)}
  const inS=schools.filter(s=>s.within).sort((a,b)=>b.count-a.count), exN=schools.filter(s=>!s.within).reduce((n,s)=>n+s.count,0)
  console.log(`${c.name.padEnd(6)}(${rad}km): 반경내학교 ${inS.length}종/${inS.reduce((n,s)=>n+s.count,0)}명, 제외 ${schools.length-inS.length}종/${exN}명 · top:${inS.slice(0,5).map(s=>s.name.replace('초등학교','초')+s.count).join(',')}`)
}
writeFileSync(new URL('../lib/data/campus-geo-filter.json',import.meta.url), JSON.stringify(out,null,1))
console.log('✅ lib/data/campus-geo-filter.json 생성')
