"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateInviteCode,
  revokeInviteCode,
} from "@/features/family/server/actions";
import type { FamilyStatus } from "@/features/family/schema";

interface InviteGeneratorProps {
  familyStatus: Extract<FamilyStatus, { status: "solo" | "has_invite" }>;
}

export function InviteGenerator({ familyStatus }: InviteGeneratorProps) {
  const router = useRouter();
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const hasActiveInvite = familyStatus.status === "has_invite";
  const invite = hasActiveInvite ? familyStatus.invite : null;

  function handleGenerate() {
    setStatusMsg("");
    startTransition(async () => {
      setStatusMsg("Generating…");
      const result = await generateInviteCode();
      if (!result.ok) {
        setStatusMsg(result.error.message);
        return;
      }
      setGeneratedCode(result.data.code);
      setStatusMsg("Invite code generated");
    });
  }

  function handleRevoke() {
    if (!invite) return;
    setStatusMsg("");
    startTransition(async () => {
      setStatusMsg("Revoking…");
      const result = await revokeInviteCode(invite.id);
      if (!result.ok) {
        setStatusMsg(result.error.message);
        return;
      }
      setGeneratedCode(null);
      setStatusMsg("Invite code revoked");
      router.refresh();
    });
  }

  async function handleCopy() {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopiedMsg("");
      // reset then set so aria-live re-announces on repeated copy
      requestAnimationFrame(() => setCopiedMsg("Copied!"));
    } catch {
      setCopiedMsg("Copy failed");
    }
  }

  const expiryLabel = invite
    ? new Date(invite.expiresAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Always-mounted ARIA live regions */}
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>
      <div aria-live="polite" role="status" className="sr-only">
        {copiedMsg}
      </div>

      {generatedCode ? (
        /* Code was just generated this session — show it once */
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-secondary">
            Share this code with your partner. It expires in 7 days and can only
            be used once.
          </p>
          <div className="flex items-center gap-2">
            <code
              aria-label="Invite code"
              className="break-all rounded-md border border-hairline bg-surface-inset px-3 py-2 font-mono text-sm text-ink-primary"
            >
              {generatedCode}
            </code>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="min-h-[44px] rounded-lg border border-hairline bg-card px-4 text-sm text-ink-primary hover:bg-surface-inset"
            >
              Copy code
            </button>
            <button
              onClick={handleRevoke}
              disabled={isPending}
              aria-disabled={isPending}
              className="min-h-[44px] rounded-lg border border-hairline px-4 text-sm text-ink-secondary hover:bg-surface-inset disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </div>
      ) : hasActiveInvite ? (
        /* Invite exists but code not shown (subsequent page load) */
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-secondary">
            You have a pending invite. Share it with your partner before it
            expires on <strong>{expiryLabel}</strong>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={isPending}
              aria-disabled={isPending}
              className="min-h-[44px] rounded-lg bg-brand-accent-strong px-4 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Generating…" : "Generate new code"}
            </button>
            <button
              onClick={handleRevoke}
              disabled={isPending}
              aria-disabled={isPending}
              className="min-h-[44px] rounded-lg border border-hairline px-4 text-sm text-ink-secondary hover:bg-surface-inset disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </div>
      ) : (
        /* No invite — solo state */
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-secondary">
            Generate a one-time invite code to share with your partner.
          </p>
          <button
            onClick={handleGenerate}
            disabled={isPending}
            aria-disabled={isPending}
            className="min-h-[44px] w-fit rounded-lg bg-brand-accent-strong px-4 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Generating…" : "Generate invite code"}
          </button>
        </div>
      )}
    </div>
  );
}
