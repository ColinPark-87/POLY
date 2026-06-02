import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const KOSIS_KEY = '78e08d19eaa1ada1c6651abcee87ada4'
const KOSIS_BASE = 'https://kosis.kr/openapi/Param/statisticsParamData.do'

// 노원구 행정구역 코드 (서울 11 / 노원구 11350)
const SEOUL_CODE = '11'
const NOWON_GU_CODE = '11350'

// 현재 연도 기준 3년 (전년도까지 — KOSIS는 당해년도 미집계)
const thisYear = new Date().getFullYear()
const startYear = String(thisYear - 3)
const endYear   = String(thisYear - 1)

async function fetchKosis(params: Record<string, string>) {
  const url = new URL(KOSIS_BASE)
  Object.entries({ method: 'getList', apiKey: KOSIS_KEY, format: 'json', jsonVD: 'Y', ...params })
    .forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 3600 * 12 } })
  if (!res.ok) throw new Error(`KOSIS HTTP ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json)) throw new Error(json?.errMsg ?? `KOSIS 오류 (tblId=${params.tblId})`)
  return json
}

// 연령 그룹명에서 5~14세 포함 여부 판단 (다양한 표기 방식 대응)
function isTargetAge(ageStr: string): boolean {
  const s = ageStr.replace(/[\s~\-～]/g, '').replace('세이상', '+').replace('세미만','미만')
  // 5세~9세(5-9), 10세~14세(10-14) 범위 포함
  return (
    /^5세?9/.test(s) || /^5[~\-～]?9/.test(s) ||
    /^10세?14/.test(s) || /^10[~\-～]?14/.test(s) ||
    s === '5세' || s === '6세' || s === '7세' || s === '8세' || s === '9세' ||
    s === '10세' || s === '11세' || s === '12세' || s === '13세' || s === '14세'
  )
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users').select('campus_id, role, perm_analytics').eq('id', user.id).single()
  if (!profile?.campus_id) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile.role !== 'campus_admin' && !profile.perm_analytics)
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const type = new URL(req.url).searchParams.get('type') ?? 'population'

  try {
    if (type === 'population') {
      // 행정안전부 주민등록인구통계 — 시도/시군구/5세별
      // DT_1B04006A: 행정구역(시도)→행정구역(시군구)→성별→연령(5세별)
      // objL1=서울, objL2=노원구, objL3=0(합계), objL4=ALL(연령)
      // DT_1B04006A: 시도(objL1)→시군구(objL2)→성별(objL3)→연령5세별(objL4)
      // objL3='T'=합계(성별 구분없이 총계), objL4=ALL(전연령대)
      const data = await fetchKosis({
        orgId: '101',
        tblId: 'DT_1B04006A',
        objL1: SEOUL_CODE,
        objL2: NOWON_GU_CODE,
        objL3: 'T',   // 합계 (T=total, 성별 구분 없음)
        objL4: 'ALL', // 전체 5세별 연령
        prdSe: 'Y',
        startPrdDe: startYear,
        endPrdDe: endYear,
      })
      return NextResponse.json({ ok: true, type: 'population', data })
    }

    if (type === 'school') {
      // 노원구 초등학교 학생수 추이 — 교육기본통계 (한국교육개발원)
      const data = await fetchKosis({
        orgId: '334',
        tblId: 'DT_ED09010',
        objL1: 'ALL',
        objL2: NOWON_GU_CODE,
        prdSe: 'Y',
        startPrdDe: startYear,
        endPrdDe: endYear,
      })
      return NextResponse.json({ ok: true, type: 'school', data })
    }

    return NextResponse.json({ error: '알 수 없는 타입' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 200 })
  }
}
