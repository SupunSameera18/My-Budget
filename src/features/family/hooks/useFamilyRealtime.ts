"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useFamilyRealtime(familyUnitId: string | null) {
  const [lastEventAt, setLastEventAt] = useState<number>(0);

  useEffect(() => {
    if (!familyUnitId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`family:${familyUnitId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: "is_shared=eq.true",
        },
        () => setLastEventAt(Date.now()),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("Family Realtime channel error — using cached data");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyUnitId]);

  return { lastEventAt };
}
