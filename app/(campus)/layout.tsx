import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolveRedirectPath, isCampusStaffOnly } from '@/lib/auth/routing'
import { resolvePermissions } from '@/lib/permissions'
import CampusSidebar from '@/components/CampusSidebar'
import CampusBottomNav from '@/components/CampusBottomNav'
import CampusMobileHeader from '@/components/CampusMobileHeader'

export const dynamic = 'force-dynamic'

export default async function CampusLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()

  // id로 먼저 조회, 없으면 email로 조회 (OR 쿼리 대신 개별 쿼리로 안정성 향상)
  const { data: byId } = await serviceClient
    .from('users')
    .select('name, campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted, perm_analytics')
    .eq('id', user.id)
    .maybeSingle()

  const { data: byEmail } = (!byId && user.email)
    ? await serviceClient
        .from('users')
        .select('name, campus_id, role, position, perm_class_roster, perm_vehicles, perm_vehicles_restricted, perm_analytics')
        .eq('email', user.email)
        .maybeSingle()
    : { data: null }

  const profile = byId ?? byEmail ?? null

  const role = profile?.role ?? ''
  const position = profile?.position ?? ''
  const isCampusStaff =
    role === 'hq_admin' ||
    resolveRedirectPath(role, position) === '/campus/dashboard'
  if (!isCampusStaff) redirect('/dashboard')

  const { data: campus } = await serviceClient
    .from('campuses')
    .select('name')
    .eq('id', profile?.campus_id ?? '')
    .single()

  const userName = profile?.name ?? '직원'
  const campusName = campus?.name ?? '캠퍼스'

  const permissions = resolvePermissions({
    role: profile?.role ?? 'campus_admin',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
    perm_analytics: profile?.perm_analytics ?? null,
  })

  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">
      <CampusSidebar
        userName={userName}
        campusName={campusName}
        role={profile?.role ?? 'campus_admin'}
        position={profile?.position ?? ''}
        permClassRoster={permissions.classRoster}
        permVehicles={permissions.vehicles}
        permAnalytics={permissions.analytics}
        staffOnly={isCampusStaffOnly(role, position)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <CampusMobileHeader userName={userName} campusName={campusName} />
        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto">
          {children}
        </main>
      </div>
      <CampusBottomNav staffOnly={isCampusStaffOnly(role, position)} />
    </div>
  )
}
