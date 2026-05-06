import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import CampusSidebar from '@/components/CampusSidebar'
import CampusBottomNav from '@/components/CampusBottomNav'
import CampusMobileHeader from '@/components/CampusMobileHeader'

export default async function CampusLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users')
    .select('name, campus_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'campus_admin' && profile?.role !== 'hq_admin') redirect('/dashboard')

  const { data: campus } = await serviceClient
    .from('campuses')
    .select('name')
    .eq('id', profile?.campus_id ?? '')
    .single()

  const userName = profile?.name ?? '원장'
  const campusName = campus?.name ?? '캠퍼스'

  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">
      <CampusSidebar userName={userName} campusName={campusName} role={profile?.role ?? 'campus_admin'} />
      <div className="flex-1 flex flex-col min-w-0">
        <CampusMobileHeader userName={userName} campusName={campusName} />
        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto">
          {children}
        </main>
      </div>
      <CampusBottomNav />
    </div>
  )
}
