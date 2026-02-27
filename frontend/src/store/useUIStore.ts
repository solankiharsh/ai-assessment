"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type TabId =
  | "brief"
  | "timeline"
  | "risk"
  | "network"
  | "entities"
  | "evidence";

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
      activeTab: "brief",
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
  { id: "brief", label: "Brief" },
  { id: "timeline", label: "Timeline" },
  { id: "risk", label: "Risk Analysis" },
  { id: "network", label: "Network" },
  { id: "entities", label: "Entities" },
  { id: "evidence", label: "Evidence" },
];
