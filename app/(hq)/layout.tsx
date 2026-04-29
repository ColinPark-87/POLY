import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HqSidebar from '@/components/HqSidebar'
import HqBottomNav from '@/components/HqBottomNav'
import HqMobileHeader from '@/components/HqMobileHeader'

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = user.app_metadata?.user_role
  if (role !== 'hq_admin') redirect('/dashboard')

  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single()

  const userName = profile?.name ?? 'HQ 관리자'

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
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
