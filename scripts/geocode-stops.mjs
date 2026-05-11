import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const KAKAO_KEY = 'e7dde41afe5b4b75df1b6e4ba058a273'
const INPUT = 'C:/Users/user/Desktop/Colin 작업폴더/0507/좌표작업/정류장좌표_등하원.xlsx'
const OUTPUT = 'C:/Users/user/Desktop/Colin 작업폴더/0507/좌표작업/정류장좌표_등하원_완성.xlsx'

// 중계폴리어학원 기준 좌표 (노원로 236)
const BASE_LAT = 37.6556
const BASE_LNG = 127.0686

function distance(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// 정류장명에서 핵심 검색어 추출
function extractQuery(name) {
  // 괄호 안 내용 제거 (단, 단독 괄호만 있는 경우는 유지)
  let q = name.replace(/\s+/g, ' ').trim()
  // 괄호 내용을 대안 검색어로 활용
  const mainPart = q.replace(/\s*[\(（][^)）]*[\)）]/g, '').trim()
  return mainPart || q
}

async function geocode(stopName) {
  // 여러 검색 전략
  const queries = []

  const clean = stopName.replace(/\s+/g, ' ').trim()
  const mainQ = extractQuery(clean)

  // 지역 접두어 추가 (노원구 중심)
  const prefixes = ['서울 노원구 ', '서울 도봉구 ', '서울 중랑구 ', '서울 강북구 ', '서울 성북구 ', '']

  for (const prefix of prefixes) {
    queries.push(prefix + mainQ)
  }
  // 원본도 시도
  queries.push('서울 ' + clean)

  for (const q of queries) {
    try {
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`
      const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } })
      const data = await res.json()
      const docs = data.documents ?? []

      if (docs.length === 0) continue

      // 서울 내 결과만 필터링
      const seoulDocs = docs.filter(d => d.address_name?.includes('서울'))
      const candidates = seoulDocs.length > 0 ? seoulDocs : docs

      // 기준 위치에서 15km 이내 결과 우선
      const nearby = candidates.filter(d => {
        const dist = distance(BASE_LAT, BASE_LNG, parseFloat(d.y), parseFloat(d.x))
        return dist < 15
      })

      const best = nearby.length > 0 ? nearby[0] : candidates[0]
      if (best) {
        return {
          address: best.road_address_name || best.address_name,
          lat: parseFloat(best.y),
          lng: parseFloat(best.x),
        }
      }
    } catch (e) {
      // continue
    }
  }
  return null
}

async function main() {
  const wb = XLSX.readFile(INPUT)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

  const header = rows[0]
  const dataRows = rows.slice(1)

  console.log(`총 ${dataRows.length}개 정류장 처리 중...\n`)

  let success = 0, fail = 0

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const name = String(row[0] ?? '').trim()
    if (!name) continue

    // 이미 좌표가 있으면 스킵
    if (row[4] && row[5]) {
      console.log(`[SKIP] ${name}`)
      continue
    }

    const result = await geocode(name)

    if (result) {
      row[3] = result.address  // 주소
      row[4] = result.lat      // 위도
      row[5] = result.lng      // 경도
      success++
      console.log(`[OK] ${name} → ${result.address} (${result.lat.toFixed(4)}, ${result.lng.toFixed(4)})`)
    } else {
      fail++
      console.log(`[FAIL] ${name}`)
    }

    // API 과부하 방지
    await new Promise(r => setTimeout(r, 120))
  }

  // 결과 저장
  const newRows = [header, ...dataRows]
  const newWs = XLSX.utils.aoa_to_sheet(newRows)
  newWs['!cols'] = [{ wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 50 }, { wch: 14 }, { wch: 14 }]
  wb.Sheets[wb.SheetNames[0]] = newWs
  XLSX.writeFile(wb, OUTPUT)

  console.log(`\n완료: 성공 ${success}개, 실패 ${fail}개`)
  console.log(`저장 위치: ${OUTPUT}`)
}

main()
