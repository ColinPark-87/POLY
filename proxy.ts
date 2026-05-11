import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isAuthPage = path.startsWith('/login') || path.startsWith('/setup') || path.startsWith('/api/public')

  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && !isAuthPage) {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: profile } = await adminClient
      .from('users')
      .select('role, position')
      .eq('id', user.id)
      .maybeSingle()

    const role = profile?.role ?? ''
    const position = profile?.position ?? ''

    const isCampusAdmin = role === 'campus_admin' || role === 'hq_admin'
    const isCampusStaffOnly =
      !isCampusAdmin && (
        position.includes('상담') ||
        position.includes('KT') ||
        position.includes('관리자') ||
        position.includes('POLY안전')
      )

    if (path.startsWith('/campus')) {
      if (!isCampusAdmin && !isCampusStaffOnly) {
        // 일반 직원 — 캠퍼스 접근 불가
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      if (isCampusStaffOnly) {
        // 상담부/관리자 등 — 개설반 현황, 차량 관리만 허용
        const allowed =
          path.startsWith('/campus/class-roster') ||
          path.startsWith('/campus/vehicles')
        if (!allowed) {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      }
    }

    if (path.startsWith('/hq') && role !== 'hq_admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
