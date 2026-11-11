"use client";

import { useEffect, useSyncExternalStore } from "react";

// The hash is read once per page load and remembered, so the message survives clearing the URL.
let initialHash: string | null = null;
const readHash = () => (initialHash ??= window.location.hash);
const noSubscribe = () => () => {};

function messageFor(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const desc = params.get("error_description")?.replace(/\+/g, " ");
  if (params.get("error_code") === "signup_disabled") {
    return "Supabase blocked this sign-up (signup_disabled). In your Supabase project → Authentication → Providers, turn ON “Allow new users to sign up”, then try Google again in a private window.";
  }
  if (params.get("error") === "access_denied" && desc) return desc;
  return null;
}

/** Surfaces Supabase OAuth errors passed in the URL hash (e.g. signup_disabled). */
export function AuthOAuthHint() {
  // Server snapshot is "" so hydration matches; the client then re-renders with the real hash.
  const hash = useSyncExternalStore(noSubscribe, readHash, () => "");
  const message = messageFor(hash);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("error_code") || params.get("error")) {
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
