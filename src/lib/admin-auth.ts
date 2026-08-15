import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getAdminEmails } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminContext {
  user: User;
  email: string;
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return null;
  }

  const email = user.email.toLowerCase();
  const explicitlyAllowed = getAdminEmails().has(email);
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, enabled")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.enabled || profile.role !== "admin" || !explicitlyAllowed) {
    return null;
  }

  return { user, email };
}

export async function requireAdminPage(): Promise<AdminContext> {
  const context = await getAdminContext();
  if (!context) {
    redirect("/login");
  }
  return context;
}
