"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type TabId =
  | "overview"
  | "entities"
  | "graph"
  | "risk"
  | "sources"
  | "trace";

interface UIState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  focusMode: boolean;
  activeTab: TabId;
  selectedEntityId: string | null;
  confidenceThreshold: number;
  setLeftPanelOpen: (v: boolean) => void;
  setRightPanelOpen: (v: boolean) => void;
  setFocusMode: (v: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  exitFocusMode: () => void;
  setActiveTab: (t: TabId) => void;
  setSelectedEntityId: (id: string | null) => void;
  setConfidenceThreshold: (n: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      leftPanelOpen: true,
      rightPanelOpen: true,
      focusMode: false,
      activeTab: "overview",
      selectedEntityId: null,
      confidenceThreshold: 0.3,
      setLeftPanelOpen: (v) => set({ leftPanelOpen: v }),
      setRightPanelOpen: (v) => set({ rightPanelOpen: v }),
      setFocusMode: (v) => set({ focusMode: v }),
      toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      exitFocusMode: () =>
        set({ focusMode: false, leftPanelOpen: true, rightPanelOpen: true }),
      setActiveTab: (t) => set({ activeTab: t }),
      setSelectedEntityId: (id) => set({ selectedEntityId: id }),
      setConfidenceThreshold: (n) =>
        set({ confidenceThreshold: Math.max(0, Math.min(1, n)) }),
    }),
    { name: "deep-research-console-ui" }
  )
);

export const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "entities", label: "Entities" },
  { id: "graph", label: "Graph" },
  { id: "risk", label: "Risk Analysis" },
  { id: "sources", label: "Source Audit" },
  { id: "trace", label: "Execution Trace" },
];
