"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ConsoleLayout } from "@/components/layout/ConsoleLayout";
import { api } from "@/lib/api";

function getCaseIdFromPath(pathname: string | null): string | null {
  if (!pathname || !pathname.startsWith("/cases/")) return null;
  const rest = pathname.slice("/cases/".length);
  if (!rest || rest.includes("/")) return null;
  return rest;
}

export default function CasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const caseId = getCaseIdFromPath(pathname);
  const { data: caseData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => api.getCase(caseId!),
    enabled: !!caseId,
  });

  return (
    <ConsoleLayout caseId={caseId ?? undefined} caseData={caseData ?? undefined}>
      {children}
    </ConsoleLayout>
  );
}