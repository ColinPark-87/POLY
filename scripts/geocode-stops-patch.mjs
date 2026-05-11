import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const KAKAO_KEY = 'e7dde41afe5b4b75df1b6e4ba058a273'
const FILE = 'C:/Users/user/Desktop/Colin 작업폴더/0507/좌표작업/정류장좌표_등하원_완성.xlsx'

const BASE_LAT = 37.6556
const BASE_LNG = 127.0686

function distance(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

async function kakao(query, maxDist = 20) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } })
  const data = await res.json()
  const docs = (data.documents ?? []).filter(d => {
    const dist = distance(BASE_LAT, BASE_LNG, parseFloat(d.y), parseFloat(d.x))
    return dist < maxDist
  })
  if (!docs.length) return null
  const d = docs[0]
  return { address: d.road_address_name || d.address_name, lat: parseFloat(d.y), lng: parseFloat(d.x) }
}

// 수동 좌표 (잘 알려진 주소 직접 지정)
const MANUAL = {
  // ─── 잘못 매핑된 항목 수정 ───
  '보람 A':                        { address: '서울 노원구 상계로 22', lat: 37.6578, lng: 127.0674 },  // 노원구 중계동 보람아파트
  '대동1차A':                      null,  // 검색으로 재시도
  '주공 10단지 (임광A)':           null,  // 검색으로 재시도
  '주공 10단지 입구 (임광 A)':     null,
  '엠코 세븐일레븐':               null,
  '쌍용 A':                        null,

  // ─── 실패 항목 직접 지정 ───
  '7단지 굴뚝 (동진상가)':         null,
  '7단지 정류장 (9단지 풍천유치원)': null,
  '7단지 동진상가 (굴뚝)':         null,
  '풍천유치원 (7단지 정류장)':     { address: '서울 노원구 노원로 522', lat: 37.6612, lng: 127.0610 },  // 중계 주공 7단지

  '포레나노원A':                   null,
  '포레나노원A  후문':             null,
  '하게 현대우성':                 { address: '서울 노원구 섬밭로 232', lat: 37.6368, lng: 127.0664 },  // 하계 현대우성 오타

  '공릉풍림아이원A  용현초교 앞 (하원 -상가)': null,
  '금호아파트 한화 그린 부동산':   null,
  '대림 벽산  중계 주공 6,7차 (도미노피자)': null,
  '동진신안A':                     null,
  '신안동진A':                     null,
  '신안동진 A':                    null,

  '선덕사거리  (에벤에셀상가) 선희유치원': null,
  '선덕사거리  선희 유치원':       null,  // 인코딩 깨짐 포함
  '양지대림 2차(후문) 건너편':     null,

  '상계동 주공4단지 상수초 신상중학교': null,
  '신내 진로A 버스정류장':         null,
  '신상초 5단지 관리사무소':       null,
  '중계 신안A 후문 정류장':        null,
  '중계1동  어린이집 신안A  정류장': null,
  '중계동  양지대림. 성원A (동행노인복지센터 구 까사미아)': null,
  '중계동  양지대림. 성원A (동행 노인복지센터 구 까사미아)': null,
  '중계동  우성3차 A':             null,
  '노원문화원건너편':              null,
  '대림 벽산 [소마]':              null,
  '동아청솔 A (경로당)':           null,
  '청구 3차  관리사무소':          null,
  '청구 3차 관리사무소':           null,
  '청구3차  관리사무소':           null,
  '청구3차 관리사무소':            null,
  '창동 주공19단지  1907동  버스정류소': null,
  '창동 주공19단지  1907동 앞  버스정류소': null,
  '태릉해링턴 정문 공릉어린이집 앞': null,
  '태릉해링턴정문 건너편 공릉어린이집': null,
  '태릉헤링턴건너편공릉어린이집':  null,
  '프레미어스  엠코 세븐일레븐':   null,
  '월계  꿈의 숲 Sk뷰 A':          null,
  '월계 꿈의 숲 Sk뷰 A':           null,
}

// 자동 검색 쿼리 매핑 (실패 항목용)
const SEARCH_QUERIES = {
  '7단지 굴뚝 (동진상가)':                '서울 노원구 중계동 동진아파트',
  '7단지 정류장 (9단지 풍천유치원)':      '서울 노원구 풍천유치원',
  '7단지 동진상가 (굴뚝)':               '서울 노원구 중계동 동진아파트',
  '포레나노원A':                          '서울 노원구 포레나 노원',
  '포레나노원A  후문':                    '서울 노원구 포레나 노원',
  '공릉풍림아이원A  용현초교 앞 (하원 -상가)': '서울 노원구 공릉 풍림아이원',
  '금호아파트 한화 그린 부동산':          '서울 도봉구 창5동 금호아파트',
  '대동1차A':                            '서울 노원구 공릉동 대동아파트',
  '주공 10단지 (임광A)':                  '서울 노원구 상계 주공 10단지',
  '주공 10단지 입구 (임광 A)':            '서울 노원구 상계 주공 10단지',
  '대림 벽산  중계 주공 6,7차 (도미노피자)': '서울 노원구 중계동 대림벽산',
  '동진신안A':                           '서울 노원구 중계동 신안아파트',
  '신안동진A':                           '서울 노원구 중계동 신안아파트',
  '신안동진 A':                          '서울 노원구 중계동 신안아파트',
  '선덕사거리  (에벤에셀상가) 선희유치원': '서울 도봉구 선덕사거리',
  '선덕사거리  선희 유치원':             '서울 도봉구 선덕사거리',
  '양지대림 2차(후문) 건너편':           '서울 노원구 양지대림 2차',
  '상계동 주공4단지 상수초 신상중학교':  '서울 노원구 상계주공 4단지',
  '신내 진로A 버스정류장':               '서울 중랑구 신내동 진로아파트',
  '신상초 5단지 관리사무소':             '서울 노원구 상계 주공 5단지',
  '중계 신안A 후문 정류장':              '서울 노원구 중계동 신안아파트',
  '중계1동  어린이집 신안A  정류장':     '서울 노원구 중계1동 신안아파트',
  '중계동  양지대림. 성원A (동행노인복지센터 구 까사미아)': '서울 노원구 동행노인복지센터',
  '중계동  양지대림. 성원A (동행 노인복지센터 구 까사미아)': '서울 노원구 동행노인복지센터',
  '중계동  우성3차 A':                   '서울 노원구 중계동 우성3차',
  '노원문화원건너편':                    '서울 노원구 노원문화원',
  '대림 벽산 [소마]':                    '서울 노원구 중계동 대림벽산',
  '동아청솔 A (경로당)':                 '서울 도봉구 동아청솔아파트',
  '청구 3차  관리사무소':               '서울 노원구 청구3차아파트',
  '청구 3차 관리사무소':                '서울 노원구 청구3차아파트',
  '청구3차  관리사무소':                '서울 노원구 청구3차아파트',
  '청구3차 관리사무소':                 '서울 노원구 청구3차아파트',
  '창동 주공19단지  1907동  버스정류소': '서울 도봉구 창동주공 19단지',
  '창동 주공19단지  1907동 앞  버스정류소': '서울 도봉구 창동주공 19단지',
  '태릉해링턴 정문 공릉어린이집 앞':    '서울 노원구 태릉해링턴플레이스',
  '태릉해링턴정문 건너편 공릉어린이집': '서울 노원구 태릉해링턴플레이스',
  '태릉헤링턴건너편공릉어린이집':       '서울 노원구 태릉해링턴플레이스',
  '프레미어스  엠코 세븐일레븐':        '서울 노원구 하계동 프레미어스엠코',
  '엠코 세븐일레븐':                    '서울 노원구 하계동 프레미어스엠코',
  '월계  꿈의 숲 Sk뷰 A':               '서울 노원구 월계 꿈의숲SK뷰',
  '월계 꿈의 숲 Sk뷰 A':                '서울 노원구 월계 꿈의숲SK뷰',
  '쌍용 A':                             '서울 노원구 중계동 쌍용아파트',
}

async function main() {
  const wb = XLSX.readFile(FILE)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const header = rows[0]
  const dataRows = rows.slice(1)

  let fixed = 0

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const name = String(row[0] ?? '').trim()
    if (!name) continue

    const isTarget = name in MANUAL || name in SEARCH_QUERIES
    const isWrong = row[3] && (
      String(row[3]).includes('부산') || String(row[3]).includes('의정부') ||
      String(row[3]).includes('안산') || String(row[3]).includes('하남') ||
      String(row[3]).includes('구리')
    )

    if (!isTarget && !isWrong) continue

    let result = null

    // 수동 좌표 먼저
    if (MANUAL[name]) {
      result = MANUAL[name]
    } else {
      // 자동 검색
      const query = SEARCH_QUERIES[name] || ('서울 노원구 ' + name)
      result = await kakao(query, 25)
      await new Promise(r => setTimeout(r, 100))
    }

    if (result) {
      row[3] = result.address
      row[4] = result.lat
      row[5] = result.lng
      fixed++
      console.log(`[FIX] ${name} → ${result.address} (${result.lat.toFixed(4)}, ${result.lng.toFixed(4)})`)
    } else {
      console.log(`[STILL FAIL] ${name}`)
    }
  }

  const newRows = [header, ...dataRows]
  const newWs = XLSX.utils.aoa_to_sheet(newRows)
  newWs['!cols'] = [{ wch: 42 }, { wch: 12 }, { wch: 10 }, { wch: 50 }, { wch: 14 }, { wch: 14 }]
  wb.Sheets[wb.SheetNames[0]] = newWs
  XLSX.writeFile(wb, FILE)

  console.log(`\n패치 완료: ${fixed}개 수정`)
}

main()
