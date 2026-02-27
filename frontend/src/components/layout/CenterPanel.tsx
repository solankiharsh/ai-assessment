"use client";

import { ReactNode } from "react";

export function CenterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="console-panel flex h-full flex-col overflow-hidden">
      {children}
    </div>
  );
}
