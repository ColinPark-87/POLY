import fs from 'node:fs'
const r=JSON.parse(fs.readFileSync('../산출물/대전차량_2026-06-26/_coords_result.json','utf8'))
const pick=['크로바 108동 앞','목련202동 앞','한마루104동 앞','센트럴2단지 스쿨버스정류장','엑스포 4','우성A','어린이 승차장']
for(const p of pick){const o=r.ok.find(x=>x.stop_name===p);console.log(p,'->',o?(o.lat.toFixed(4)+','+o.lng.toFixed(4)+' via '+o.via+' q='+o.q):'(fail)')}
const m={};for(const o of r.ok){const k=o.lat.toFixed(3)+','+o.lng.toFixed(3);m[k]=(m[k]||0)+1}
console.log('\n좌표중복 top:',JSON.stringify(Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,6)))
console.log('시청쏠림(±0.002):',r.ok.filter(o=>Math.abs(o.lat-36.3504)<0.002&&Math.abs(o.lng-127.3845)<0.002).length)
console.log('lat범위',Math.min(...r.ok.map(o=>o.lat)).toFixed(3),'~',Math.max(...r.ok.map(o=>o.lat)).toFixed(3),' lng',Math.min(...r.ok.map(o=>o.lng)).toFixed(3),'~',Math.max(...r.ok.map(o=>o.lng)).toFixed(3))
