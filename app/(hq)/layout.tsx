import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import HqSidebar from '@/components/HqSidebar'
import HqBottomNav from '@/components/HqBottomNav'
import HqMobileHeader from '@/components/HqMobileHeader'

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'hq_admin') redirect('/dashboard')

  const userName = profile?.name ?? 'HQ 관리자'

  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">
      <HqSidebar userName={userName} />
      <div className="flex-1 flex flex-col min-w-0">
        <HqMobileHeader userName={userName} />
        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto">
          {children}
        </main>
      </div>
      <HqBottomNav />
    </div>
  )
}
