import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompleteClient } from "./CompleteClient";

export default async function CompletePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return <CompleteClient userId={user.id} />;
}
