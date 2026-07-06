import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

// AI 차량 분석(증차/감차/쪽차) — Groq(무료) LLM. 클라가 호차별 요약을 보내면 재배치안+근거를 반환.
// 재배정 규칙:
//  - 감차: 전 세션 통틀어 1대를 빼고, 그 학생들을 다른 노선차의 가까운 정류장으로 편입.
//  - 유치부는 원칙적으로 감차 불가(4명이라도 쪽차=그 세션만 도는 차 유지).
//  - 증차: 정원 초과/과밀 노선은 증차 제안.
// GROQ_API_KEY 미설정 시 안내 반환.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

const SYS = `너는 학원 셔틀버스 배차 최적화 전문가다. 주어진 호차별 현황(세션·정류장·인원·좌표)을 보고
증차/감차/쪽차를 판단한다. 규칙:
1) 감차는 전 세션을 통틀어 딱 1대만 뺀다. 뺀 차의 학생들은 다른 노선차의 '지리적으로 가장 가까운' 정류장으로 편입한다.
2) 유치부는 감차 불가. 인원이 적어도(예: 4명) 쪽차(그 세션만 운행하는 전용차)로 유지한다.
3) 증차는 특정 노선이 과밀(정원 초과)일 때만 제안한다.
4) 근거는 간결하고 실무적으로. 변경되는 호차만 다룬다(그대로인 호차는 언급 안 함).
반드시 아래 JSON만 출력(설명 문장 금지):
{"summary":"한 줄 총평","actions":[{"type":"감차|증차|쪽차","bus":"호차명","session":"세션","reason":"근거","reassign":[{"student":"이름","fromBus":"","toBus":"","toStop":"정류장"}]}]}`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const service = createServiceClient()
  const { data: profile } = await service.from('users')
    .select('role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted').eq('id', user.id).single()
  const perms = resolvePermissions({
    role: profile?.role ?? 'employee', position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null, perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })
  if (!perms.vehicles) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const key = process.env.GROQ_API_KEY
  if (!key) return NextResponse.json({ error: 'GROQ_API_KEY 미설정 — Vercel 환경변수에 추가 후 재배포하세요.', needKey: true }, { status: 503 })

  const body = await request.json().catch(() => ({}))
  const vehicles = (body as { vehicles?: unknown }).vehicles
  if (!Array.isArray(vehicles) || vehicles.length === 0) return NextResponse.json({ error: '분석할 차량 데이터 없음' }, { status: 400 })

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYS },
          { role: 'user', content: `호차별 현황(JSON):\n${JSON.stringify(vehicles)}` },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return NextResponse.json({ error: `Groq 오류 ${res.status}: ${t.slice(0, 200)}` }, { status: 502 })
    }
    const d = await res.json()
    const raw = d?.choices?.[0]?.message?.content ?? '{}'
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return NextResponse.json({ error: 'AI 응답 파싱 실패', raw }, { status: 502 }) }
    return NextResponse.json({ result: parsed })
  } catch (e) {
    return NextResponse.json({ error: `분석 실패: ${(e as Error).message}` }, { status: 500 })
  }
}
