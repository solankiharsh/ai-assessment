"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, Loader2, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <Card
        className="w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              New Investigation
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Run a deep research pipeline on a subject
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label
              htmlFor="subject-name"
              className="mb-1.5 block text-sm font-medium text-muted-foreground"
            >
              Subject name
            </label>
            <Input
              id="subject-name"
              type="text"
              placeholder="e.g. Jensen Huang"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !showAdvanced && handleSubmit()}
              autoFocus
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">Advanced options</span>
          </Button>

          {showAdvanced && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
              <div>
                <label htmlFor="role" className="mb-1 block text-sm text-muted-foreground">
                  Role
                </label>
                <Input
                  id="role"
                  type="text"
                  placeholder="CEO, CFO, Board Member..."
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="org" className="mb-1 block text-sm text-muted-foreground">
                  Organization
                </label>
                <Input
                  id="org"
                  type="text"
                  placeholder="Company or institution name"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="max-iter" className="mb-1 block text-sm text-muted-foreground">
                  Max iterations
                </label>
                <Input
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
                />
              </div>
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {(mutation.error as Error)?.message ?? "Failed to start investigation"}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!subjectName.trim() || mutation.isPending}
            className="gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Begin investigation
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
