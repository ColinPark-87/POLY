import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'
import { filterPresent } from '@/lib/vehicles/presence'

const PERM_SELECT = 'campus_id, name, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted'
function canView(p: { role?: string | null; position?: string | null; perm_class_roster?: boolean | null; perm_vehicles?: boolean | null; perm_vehicles_restricted?: boolean | null } | null) {
  return resolvePermissions({
    role: p?.role ?? 'employee', position: p?.position ?? null,
    perm_class_roster: p?.perm_class_roster ?? null,
    perm_vehicles: p?.perm_vehicles ?? null,
    perm_vehicles_restricted: p?.perm_vehicles_restricted ?? null,
  }).vehicles
}

type Ctx = {
  user: { id: string }
  service: ReturnType<typeof createServiceClient>
  profile: { name?: string | null; campus_id?: string | null; role?: string | null } | null
  campusId: string
}
async function ctx(request: NextRequest): Promise<Ctx | { err: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ error: '인증 필요' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select(PERM_SELECT).eq('id', user.id).single()
  if (!canView(profile)) return { err: NextResponse.json({ error: '권한 없음' }, { status: 403 }) }
  let campusId: string | null | undefined = profile?.campus_id
  const sp = new URL(request.url).searchParams
  if (!campusId && profile?.role === 'hq_admin') campusId = sp.get('campus_id')
  if (!campusId) return { err: NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 }) }
  return { user, service, profile, campusId }
}

const WINDOW_SEC = 30

export async function POST(request: NextRequest) {
  const c = await ctx(request); if ('err' in c) return c.err
  const body = await request.json().catch(() => ({}))
  const { error } = await c.service.from('campus_presence').upsert({
    campus_id: c.campusId, user_id: c.user.id, user_name: c.profile?.name ?? null,
    page: body.page ?? 'vehicles', last_seen: new Date().toISOString(),
  }, { onConflict: 'campus_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const c = await ctx(request); if ('err' in c) return c.err
  const { data } = await c.service.from('campus_presence')
    .select('user_id, user_name, last_seen, page').eq('campus_id', c.campusId)
  const present = filterPresent(data ?? [], c.user.id, Date.now(), WINDOW_SEC)
  return NextResponse.json({ present })
}

export async function DELETE(request: NextRequest) {
  const c = await ctx(request); if ('err' in c) return c.err
  await c.service.from('campus_presence').delete()
    .eq('campus_id', c.campusId).eq('user_id', c.user.id)
  return NextResponse.json({ ok: true })
}
