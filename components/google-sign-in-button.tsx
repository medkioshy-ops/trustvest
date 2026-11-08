"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton({ label = "Continue with Google" }: { label?: string }) {
  const [pending, setPending] = useState(false);

  async function signInWithGoogle() {
    setPending(true);
    const supabase = createClient();
    // Always return to the same host the user is on (avoids Vercel URL in env while testing on localhost, or the reverse).
    const redirectTo = `${window.location.origin}/auth/callback`;
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
