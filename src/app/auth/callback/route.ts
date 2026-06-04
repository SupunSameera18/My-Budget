import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  // Open-redirect prevention: only allow relative paths (exclude protocol-relative //evil.com)
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    // Build the redirect response first so cookies can be set directly on it.
    // Using createClient() (next/headers) risks Set-Cookie not being merged into
    // the NextResponse.redirect() object. This pattern guarantees the auth
    // cookies are present in the redirect response's Set-Cookie headers.
    const redirectResponse = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              redirectResponse.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectResponse;
    }
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent("Authentication failed. Please try again.")}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/auth/error?error=${encodeURIComponent("No authorization code provided")}`,
  );
}
