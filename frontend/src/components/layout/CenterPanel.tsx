"use client";

import { ReactNode } from "react";

export function CenterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}
