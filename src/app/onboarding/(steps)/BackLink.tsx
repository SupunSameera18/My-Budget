import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Subtle "Back" link for stepping to the previous onboarding step. */
export function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center gap-1 self-start text-sm text-ink-secondary transition-colors hover:text-ink-primary"
    >
      <ChevronLeft strokeWidth={1.75} className="h-4 w-4" />
      Back
    </Link>
  );
}
