"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import FloatingCaseChat from "@/components/FloatingCaseChat";

export default function FloatingChatRouter({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserName: string;
}) {
  const pathname = usePathname();
  const [caseId, setCaseId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function resolveCaseId() {
      if (!pathname) {
        setCaseId(null);
        return;
      }

      const caseMatch = pathname.match(/^\/cases\/([^/]+)/);
      if (caseMatch) {
        if (caseMatch[1] === "new") {
          setCaseId(null);
          return;
        }
        setCaseId(caseMatch[1]);
        return;
      }

      const woMatch = pathname.match(/^\/work-orders\/([^/]+)/);
      if (woMatch) {
        try {
          const res = await fetch(`/api/work-orders/${woMatch[1]}/case`);
          if (!res.ok) throw new Error();
          const data = await res.json();
          if (active) setCaseId(data.caseId ?? null);
        } catch {
          if (active) setCaseId(null);
        }
        return;
      }

      setCaseId(null);
    }

    resolveCaseId();

    return () => {
      active = false;
    };
  }, [pathname]);

  if (!caseId) return null;

  return (
    <FloatingCaseChat caseId={caseId} currentUserId={currentUserId} currentUserName={currentUserName} />
  );
}
