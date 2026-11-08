"use client";

import { useEffect, useState } from "react";

/** Surfaces Supabase OAuth errors passed in the URL hash (e.g. signup_disabled). */
export function AuthOAuthHint() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    const params = new URLSearchParams(raw);
    const code = params.get("error_code");
    const desc = params.get("error_description")?.replace(/\+/g, " ");
    if (code === "signup_disabled") {
      setMessage(
        "Supabase blocked this sign-up (signup_disabled). In your Supabase project → Authentication → Providers, turn ON “Allow new users to sign up”, then try Google again in a private window.",
      );
    } else if (params.get("error") === "access_denied" && desc) {
      setMessage(desc);
    }
    if (code || params.get("error")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
