"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton({ label = "Continue with Google" }: { label?: string }) {
  const [pending, setPending] = useState(false);

  async function signInWithGoogle() {
    setPending(true);
    const supabase = createClient();
    const base =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const redirectTo = `${base}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setPending(false);
  }

  return (
    <Button type="button" variant="outline" size="lg" className="w-full" disabled={pending} onClick={signInWithGoogle}>
      {pending ? "Redirecting…" : label}
    </Button>
  );
}
