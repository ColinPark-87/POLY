import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MISSING_STUDENTS = [
  { name: '김도윤', english_name: 'Leo Kim', grade: '2학년', school: '청원초등학교', zip_code: '01746', address: '서울 노원구 노원로22길 34', detail_address: '(중계동, 롯데우성아파트)', apartment: '롯데우성아파트' },
  { name: '김이안', english_name: 'Ian Kim', grade: '1학년', school: '청원초등학교', zip_code: '01913', address: '서울 노원구 마들로 31', detail_address: '(월계동, 그랑빌아파트 108동 902호)', apartment: '그랑빌아파트' },
  { name: '김조이', english_name: 'Joy Kim', grade: '2학년', school: '화랑초등학교', zip_code: '12113', address: '경기 남양주시 별내1로 13-21', detail_address: '(별내동, 별내자이 더 스타)', apartment: '별내자이 더 스타' },
  { name: '김준서', english_name: 'Leo Kim', grade: '3학년', school: '서울을지초등학교', zip_code: '01745', address: '서울 노원구 한글비석로5길 62', detail_address: '(중계동, 중계8단지주공아파트)', apartment: '중계8단지주공아파트' },
  { name: '김지안', english_name: 'Jay Kim', grade: '3학년', school: '서울장곡초등학교', zip_code: '02762', address: '서울 성북구 돌곶이로40길 46', detail_address: '(장위동, 꿈의숲 아이파크) 712동 2702호', apartment: '꿈의숲 아이파크' },
  { name: '김채아', english_name: 'Ella Kim', grade: '1학년', school: '서울상계초등학교', zip_code: '01701', address: '서울 노원구 덕릉로79길 23', detail_address: '(중계동, 염광아파트) 102동 801호', apartment: '염광아파트' },
  { name: '김하윤', english_name: 'Ivy Kim', grade: '3학년', school: '서울묵동초등학교', zip_code: '02007', address: '서울 중랑구 중랑천로 286', detail_address: '(묵동, 묵동아이파크아파트) 102동 1603호', apartment: '묵동아이파크아파트' },
  { name: '박서준', english_name: 'Eric Park', grade: '7세', school: null, zip_code: '01706', address: '서울 노원구 덕릉로73길 28', detail_address: '(중계동, 양지대림2차아파트)204동2203호', apartment: '양지대림2차아파트' },
  { name: '박서준', english_name: 'Richard Park', grade: '5세', school: null, zip_code: '01373', address: '서울 도봉구 해등로 307', detail_address: '(방학동, 우성2차아파트) 101-402', apartment: '우성2차아파트' },
  { name: '윤서진', english_name: 'Daisy Yoon', grade: '3학년', school: '서울을지초등학교', zip_code: '01708', address: '서울 노원구 덕릉로 595', detail_address: '(중계동, 신안아파트)', apartment: '신안아파트' },
  { name: '이도겸', english_name: 'Leo Lee', grade: '6세', school: null, zip_code: '01721', address: '서울 노원구 중계로 184', detail_address: '(중계동, 라이프청구신동아아파트) 113-1401', apartment: '라이프청구신동아아파트' },
  { name: '이지성', english_name: 'Eden Lee', grade: '3학년', school: '서울을지초등학교', zip_code: '01780', address: '서울 노원구 섬밭로 232', detail_address: '(하계동, 현대아파트,우성아파트)', apartment: '현대아파트' },
  { name: '이지아', english_name: 'Luna Lee', grade: '6세', school: null, zip_code: '01817', address: '서울 노원구 공릉로34길 86', detail_address: '(공릉동, 태릉해링턴플레이스)104-1601', apartment: '태릉해링턴플레이스' },
  { name: '장유진', english_name: 'Bella Chang', grade: '6세', school: null, zip_code: '01687', address: '서울 노원구 노원로 569', detail_address: '(상계동, 임광아파트)', apartment: '임광아파트' },
  { name: '정윤우', english_name: 'Andy Jung', grade: '3학년', school: '서울을지초등학교', zip_code: '01742', address: '서울 노원구 중계로 233', detail_address: '(중계동, 청구3차아파트) 103-103', apartment: '청구3차아파트' },
]

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, role').eq('id', user.id).single()
  if (profile?.role !== 'campus_admin') return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  const campusId = profile.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const results: string[] = []

  // 1) "안재현 신규" → "안재현" 이름 수정 + 상세정보 업데이트
  const { data: jaeHyun } = await service
    .from('campus_students')
    .select('id')
    .eq('campus_id', campusId)
    .eq('name', '안재현 신규')
    .single()

  if (jaeHyun) {
    await service.from('campus_students').update({
      name: '안재현',
      english_name: 'Jayden Ahn',
      grade: '2학년',
      school: '서울을지초등학교',
      zip_code: '01742',
      address: '서울 노원구 중계로 233',
      detail_address: '(중계동, 청구3차아파트) 104동 304호',
      apartment: '청구3차아파트',
    }).eq('id', jaeHyun.id)
    results.push('안재현 신규 → 안재현 수정 완료')
  } else {
    results.push('안재현 신규 레코드 없음 (이미 수정됨?)')
  }

  // 2) 15명 일괄 등록
  const today = new Date().toISOString().slice(0, 10)
  const inserts = MISSING_STUDENTS.map(s => ({
    campus_id: campusId,
    name: s.name,
    english_name: s.english_name,
    grade: s.grade,
    school: s.school,
    zip_code: s.zip_code,
    address: s.address,
    detail_address: s.detail_address,
    apartment: s.apartment,
    enrolled_at: today,
    is_active: true,
  }))

  const { data: inserted, error } = await service
    .from('campus_students')
    .insert(inserts)
    .select('id, name, english_name')

  if (error) return NextResponse.json({ error: error.message, results }, { status: 500 })

  results.push(`${inserted?.length ?? 0}명 등록 완료`)
  for (const s of inserted ?? []) {
    results.push(`  + ${s.name} (${s.english_name})`)
  }

  // 최종 카운트
  const { count } = await service
    .from('campus_students')
    .select('*', { count: 'exact', head: true })
    .eq('campus_id', campusId)
    .eq('is_active', true)

  return NextResponse.json({ ok: true, totalStudents: count, results })
}
