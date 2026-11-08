"use client";

import Link from "next/link";
import { useActionState } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signUp, type JoinState } from "./actions";

export function JoinForm() {
  const [state, action, pending] = useActionState<JoinState, FormData>(signUp, {});

  return (
    <div className="space-y-4">
      <GoogleSignInButton label="Sign up with Google" />
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or with email</span>
        </div>
      </div>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        </div>
        {state.confirmEmail && (
          <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
            Check your inbox to confirm <strong>{state.email}</strong>, then sign in. (Or disable “Confirm email” in Supabase for instant access.)
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
