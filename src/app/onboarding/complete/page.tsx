import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { CompleteClient } from "./CompleteClient";

export default async function CompletePage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  return <CompleteClient userId={auth.user.id} />;
}
