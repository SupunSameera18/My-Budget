"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFamilyRealtime } from "@/features/family/hooks/useFamilyRealtime";

interface FamilyRealtimeTriggerProps {
  familyUnitId: string;
}

export function FamilyRealtimeTrigger({
  familyUnitId,
}: FamilyRealtimeTriggerProps) {
  const router = useRouter();
  const { lastEventAt } = useFamilyRealtime(familyUnitId);

  useEffect(() => {
    if (lastEventAt === 0) return;
    router.refresh();
  }, [lastEventAt, router]);

  return null;
}
