import { NextResponse } from "next/server";

import { getAdminEmails } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", requestUrl.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/login?error=oauth_exchange_failed", requestUrl.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email || !getAdminEmails().has(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_authorized", requestUrl.origin));
  }

  const { error: profileError } = await createAdminClient().from("profiles").upsert({
    id: user.id,
    email,
    display_name:
      typeof user.user_metadata.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata.name === "string"
          ? user.user_metadata.name
          : email,
    role: "admin",
    enabled: true,
  });
  if (profileError) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=profile_setup_failed", requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
