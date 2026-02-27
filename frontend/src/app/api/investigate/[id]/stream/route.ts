"use strict";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getOutputDir } from "@/lib/output-dir";

const RUNNING_FILENAME = "_running.json";
const POLL_MS = 800;
const DONE_AFTER_MISSING_RUNNING_COUNT = 2;

/** SSE event types emitted by the backend _emit_progress. */
const NAMED_EVENTS = new Set([
  "node_start",
  "log",
  "facts_update",
  "entities_update",
  "risks_update",
  "complete",
  "search",
  "node",
]);

/**
 * Format a named SSE event — matches the format used by deriv-ai-research-agent.
 * If the JSON payload has a recognised `event` field we promote it to the SSE event field.
 */
function sseEvent(eventType: string, data: string): string {
  return `event: ${eventType}\ndata: ${data}\n\n`;
}

/**
 * GET /api/investigate/[id]/stream
 * Server-Sent Events stream of progress (phase, node, search queries, counters) while
 * an investigation is running.  Reads outputs/{id}_progress.jsonl, streams each new line
 * as a named SSE event (node_start / log / facts_update / entities_update / risks_update /
 * complete / node / search), and sends a plain `done` event when the run finishes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.includes("..") || /[^a-z0-9_]/i.test(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  const outputDir = getOutputDir();
  const progressPath = path.join(outputDir, `${id}_progress.jsonl`);
  const runningPath = path.join(outputDir, `${id}${RUNNING_FILENAME}`);
  const statePath = path.join(outputDir, `${id}_state.json`);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lastSize = 0;
      let sameSizeCount = 0;
      let doneMissingRunningCount = 0;
      let closed = false;

      function send(raw: string) {
        if (closed) return;
        try {
          // raw is already a full SSE block (event+data lines)
          controller.enqueue(encoder.encode(raw));
        } catch {
          closed = true;
        }
      }

      function sendLine(jsonLine: string) {
        try {
          const parsed = JSON.parse(jsonLine) as Record<string, unknown>;
          const eventType =
            typeof parsed.event === "string" && NAMED_EVENTS.has(parsed.event)
              ? parsed.event
              : "message";
          send(sseEvent(eventType, jsonLine));
        } catch {
          // Malformed line — send as generic data
          send(`data: ${jsonLine}\n\n`);
        }
      }

      function finish() {
        if (closed) return;
        closed = true;
        send(sseEvent("done", JSON.stringify({ event: "done" })));
        controller.close();
      }

      const poll = () => {
        if (closed) return;

        const stateExists = fs.existsSync(statePath);
        const runningExists = fs.existsSync(runningPath);

        if (stateExists) {
          finish();
          return;
        }

        if (!runningExists) {
          doneMissingRunningCount += 1;
          if (doneMissingRunningCount >= DONE_AFTER_MISSING_RUNNING_COUNT) {
            finish();
            return;
          }
        } else {
          doneMissingRunningCount = 0;
        }

        if (fs.existsSync(progressPath)) {
          try {
            const content = fs.readFileSync(progressPath, "utf-8");
            const currentSize = content.length;
            if (currentSize > lastSize) {
              const newChunk = content.slice(lastSize);
              const newLines = newChunk.split("\n").filter((line) => line.trim());
              for (const line of newLines) {
                sendLine(line);
              }
              lastSize = currentSize;
              sameSizeCount = 0;
            } else if (content.length > 0) {
              sameSizeCount += 1;
            }
          } catch {
            // file may be being written
          }
        }

        setTimeout(poll, POLL_MS);
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
