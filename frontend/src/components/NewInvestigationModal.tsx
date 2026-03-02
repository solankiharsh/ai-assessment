"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { X, Loader2, ChevronDown, ChevronUp, Search, Key } from "lucide-react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthToken } from "@/hooks/use-auth-token";
import type { InvestigateRequest, UserKeys } from "@/lib/types";

interface NewInvestigationModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewInvestigationModal({ open, onClose }: NewInvestigationModalProps) {
  const router = useRouter();
  const [subjectName, setSubjectName] = useState("");
  const [role, setRole] = useState("");
  const [org, setOrg] = useState("");
  const [maxIter, setMaxIter] = useState<number | "">("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useOwnKeys, setUseOwnKeys] = useState(false);
  const [userKeys, setUserKeys] = useState<UserKeys>({});
  const queryClient = useQueryClient();
  const getToken = useAuthToken();

  const hasUserKeys = Boolean(
    useOwnKeys &&
      (userKeys.litellm_api_key?.trim() ||
        userKeys.litellm_api_base?.trim() ||
        userKeys.anthropic_api_key?.trim() ||
        userKeys.openai_api_key?.trim() ||
        userKeys.google_api_key?.trim() ||
        userKeys.tavily_api_key?.trim() ||
        userKeys.brave_api_key?.trim() ||
        userKeys.langchain_api_key?.trim())
  );

  const mutation = useMutation({
    mutationFn: async (payload: InvestigateRequest) => {
      const token = hasUserKeys ? undefined : await getToken();
      return api.investigate(payload, token);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      onClose();
      resetForm();
      router.push(`/cases/${res.case_id}`);
    },
    onError: (err: unknown) => {
      if ((err as Error)?.message?.includes("Sign in required")) router.push("/login");
    },
  });

  const resetForm = () => {
    setSubjectName("");
    setRole("");
    setOrg("");
    setMaxIter("");
    setShowAdvanced(false);
    setUseOwnKeys(false);
    setUserKeys({});
  };

  const handleSubmit = () => {
    const name = subjectName.trim();
    if (!name) return;
    const payload: InvestigateRequest = {
      subject_name: name,
      ...(role.trim() && { current_role: role.trim() }),
      ...(org.trim() && { current_org: org.trim() }),
      ...(typeof maxIter === "number" && maxIter >= 1 && maxIter <= 50 && { max_iterations: maxIter }),
      ...(hasUserKeys && {
        user_keys: {
          ...(userKeys.litellm_api_key?.trim() && { litellm_api_key: userKeys.litellm_api_key.trim() }),
          ...(userKeys.litellm_api_base?.trim() && { litellm_api_base: userKeys.litellm_api_base.trim() }),
          ...(userKeys.anthropic_api_key?.trim() && { anthropic_api_key: userKeys.anthropic_api_key.trim() }),
          ...(userKeys.openai_api_key?.trim() && { openai_api_key: userKeys.openai_api_key.trim() }),
          ...(userKeys.google_api_key?.trim() && { google_api_key: userKeys.google_api_key.trim() }),
          ...(userKeys.tavily_api_key?.trim() && { tavily_api_key: userKeys.tavily_api_key.trim() }),
          ...(userKeys.brave_api_key?.trim() && { brave_api_key: userKeys.brave_api_key.trim() }),
          ...(userKeys.langchain_api_key?.trim() && { langchain_api_key: userKeys.langchain_api_key.trim() }),
        },
      }),
    };
    mutation.mutate(payload);
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

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={useOwnKeys}
                onChange={(e) => setUseOwnKeys(e.target.checked)}
                className="rounded border-border"
              />
              <Key className="h-3.5 w-3.5" />
              Use my own API keys (no rate limit; keys never stored)
            </label>
            {useOwnKeys && (
              <div className="mt-3 max-h-[35vh] space-y-2 overflow-y-auto border-t border-border pt-3">
                <p className="text-[10px] font-medium text-muted-foreground">LLM</p>
                <Input
                  type="password"
                  placeholder="LiteLLM API key"
                  value={userKeys.litellm_api_key ?? ""}
                  onChange={(e) => setUserKeys((k) => ({ ...k, litellm_api_key: e.target.value }))}
                  className="font-mono text-xs"
                />
                <Input
                  type="text"
                  placeholder="LiteLLM API base URL"
                  value={userKeys.litellm_api_base ?? ""}
                  onChange={(e) => setUserKeys((k) => ({ ...k, litellm_api_base: e.target.value }))}
                  className="font-mono text-xs"
                />
                <Input
                  type="password"
                  placeholder="Anthropic API key"
                  value={userKeys.anthropic_api_key ?? ""}
                  onChange={(e) => setUserKeys((k) => ({ ...k, anthropic_api_key: e.target.value }))}
                  className="font-mono text-xs"
                />
                <Input
                  type="password"
                  placeholder="OpenAI API key"
                  value={userKeys.openai_api_key ?? ""}
                  onChange={(e) => setUserKeys((k) => ({ ...k, openai_api_key: e.target.value }))}
                  className="font-mono text-xs"
                />
                <Input
                  type="password"
                  placeholder="Google (Gemini) API key"
                  value={userKeys.google_api_key ?? ""}
                  onChange={(e) => setUserKeys((k) => ({ ...k, google_api_key: e.target.value }))}
                  className="font-mono text-xs"
                />
                <p className="mt-1 text-[10px] font-medium text-muted-foreground">Search</p>
                <Input
                  type="password"
                  placeholder="Tavily API key"
                  value={userKeys.tavily_api_key ?? ""}
                  onChange={(e) => setUserKeys((k) => ({ ...k, tavily_api_key: e.target.value }))}
                  className="font-mono text-xs"
                />
                <Input
                  type="password"
                  placeholder="Brave Search API key"
                  value={userKeys.brave_api_key ?? ""}
                  onChange={(e) => setUserKeys((k) => ({ ...k, brave_api_key: e.target.value }))}
                  className="font-mono text-xs"
                />
                <p className="mt-1 text-[10px] font-medium text-muted-foreground">Optional: LangSmith</p>
                <Input
                  type="password"
                  placeholder="LANGCHAIN_API_KEY"
                  value={userKeys.langchain_api_key ?? ""}
                  onChange={(e) => setUserKeys((k) => ({ ...k, langchain_api_key: e.target.value }))}
                  className="font-mono text-xs"
                />
              </div>
            )}
          </div>

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
