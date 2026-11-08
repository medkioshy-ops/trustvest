"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { depositAction, type DepositState } from "@/app/(app)/actions";

export function DepositForm({ currency }: { currency: string }) {
  const [state, action, pending] = useActionState<DepositState, FormData>(depositAction, {});
  return (
    <form action={action} className="space-y-2">
      <Label htmlFor="amount">Add funds to the AI wallet ({currency})</Label>
      <div className="flex gap-2">
        <Input id="amount" name="amount" inputMode="decimal" placeholder="1000.00" required />
        <Button type="submit" variant="outline" size="lg" disabled={pending}>
          {pending ? "Adding…" : "Deposit"}
        </Button>
      </div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-primary">{state.ok}</p>}
    </form>
  );
}
