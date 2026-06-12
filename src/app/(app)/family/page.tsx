import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { getFamilyStatus } from "@/features/family/server/actions";
import { InviteGenerator } from "@/features/family/components/InviteGenerator";
import { JoinFamilyForm } from "@/features/family/components/JoinFamilyForm";
import { FamilyStatusBanner } from "@/features/family/components/FamilyStatusBanner";

export default async function FamilyPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  const familyStatus = await getFamilyStatus();

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold text-ink-primary">Family</h1>

      {familyStatus.status === "in_family" ? (
        <section aria-labelledby="family-status-heading">
          <h2
            id="family-status-heading"
            className="mb-3 text-base font-medium text-ink-primary"
          >
            Connected
          </h2>
          <p className="mb-4 text-sm text-ink-secondary">
            You&apos;re connected with{" "}
            <strong className="text-ink-primary">
              {familyStatus.partner.displayName}
            </strong>
            .
          </p>
          <FamilyStatusBanner partnerName={familyStatus.partner.displayName} />
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="invite-section-heading">
            <h2
              id="invite-section-heading"
              className="mb-3 text-base font-medium text-ink-primary"
            >
              Invite a partner
            </h2>
            <InviteGenerator familyStatus={familyStatus} />
          </section>

          <section aria-labelledby="join-section-heading">
            <h2
              id="join-section-heading"
              className="mb-3 text-base font-medium text-ink-primary"
            >
              Join a family
            </h2>
            <JoinFamilyForm />
          </section>
        </div>
      )}
    </main>
  );
}
