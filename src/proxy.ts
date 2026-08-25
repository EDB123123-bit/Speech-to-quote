import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    // Customer acceptance is token-authenticated and must not require a
    // contractor session. Keep the singular route separate from /offertes.
    pathname === '/offerte' ||
    pathname.startsWith('/offerte/') ||
    pathname === '/api/offerte' ||
    pathname.startsWith('/api/offerte/')
  );
}

export function isAuthEntryPath(pathname: string): boolean {
  return pathname.startsWith('/login') || pathname.startsWith('/auth');
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicPath(pathname);

  if (!data.user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  // A contractor may open the same tokenized customer page for support or
  // verification. Only authentication entry pages redirect signed-in users.
  if (data.user && isAuthEntryPath(pathname)) {
    return NextResponse.redirect(new URL('/offertes', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron).*)'],
};
