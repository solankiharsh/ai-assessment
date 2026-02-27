"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, Loader2, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewInvestigationModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewInvestigationModal({ open, onClose }: NewInvestigationModalProps) {
  const [subjectName, setSubjectName] = useState("");
  const [role, setRole] = useState("");
  const [org, setOrg] = useState("");
  const [maxIter, setMaxIter] = useState<number | "">("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: {
      subject_name: string;
      current_role?: string;
      current_org?: string;
      max_iterations?: number;
    }) => api.investigate(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      onClose();
      resetForm();
      window.location.href = `/cases/${res.case_id}`;
    },
  });

  const resetForm = () => {
    setSubjectName("");
    setRole("");
    setOrg("");
    setMaxIter("");
    setShowAdvanced(false);
  };

  const handleSubmit = () => {
    const name = subjectName.trim();
    if (!name) return;
    mutation.mutate({
      subject_name: name,
      ...(role.trim() && { current_role: role.trim() }),
      ...(org.trim() && { current_org: org.trim() }),
      ...(typeof maxIter === "number" &&
        maxIter >= 1 &&
        maxIter <= 50 && { max_iterations: maxIter }),
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              New Investigation
            </h2>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              Run a deep research pipeline on a subject
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label
              htmlFor="subject-name"
              className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
            >
              Subject name
            </label>
            <input
              id="subject-name"
              type="text"
              placeholder="e.g. Jensen Huang"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !showAdvanced && handleSubmit()}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors focus:border-[var(--accent)] focus:outline-none"
              autoFocus
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--text-secondary)]"
          >
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-4">
              <div>
                <label
                  htmlFor="role"
                  className="mb-1 block text-sm text-[var(--text-secondary)]"
                >
                  Role
                </label>
                <input
                  id="role"
                  type="text"
                  placeholder="CEO, CFO, Board Member..."
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="org"
                  className="mb-1 block text-sm text-[var(--text-secondary)]"
                >
                  Organization
                </label>
                <input
                  id="org"
                  type="text"
                  placeholder="Company or institution name"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="max-iter"
                  className="mb-1 block text-sm text-[var(--text-secondary)]"
                >
                  Max iterations
                </label>
                <input
                  id="max-iter"
                  type="number"
                  min={1}
                  max={50}
                  placeholder="8 (default)"
                  value={maxIter === "" ? "" : maxIter}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaxIter(
                      v === ""
                        ? ""
                        : Math.min(50, Math.max(1, parseInt(v, 10) || 1))
                    );
                  }}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-[var(--risk-critical)]">
              {(mutation.error as Error)?.message ?? "Failed to start investigation"}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!subjectName.trim() || mutation.isPending}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Begin investigation
          </button>
        </div>
      </div>
    </div>
  );
}
