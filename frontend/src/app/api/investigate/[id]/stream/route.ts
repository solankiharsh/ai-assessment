"use strict";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getOutputDir } from "@/lib/output-dir";

const RUNNING_FILENAME = "_running.json";
const POLL_MS = 1000;
const DONE_AFTER_MISSING_RUNNING_COUNT = 2;

/**
 * GET /api/investigate/[id]/stream
 * Server-Sent Events stream of progress (phase, search queries) while an investigation is running.
 * Reads outputs/{id}_progress.jsonl and streams each new line as SSE.
 * Polls until the file stops growing and _running.json is gone or state file exists, then sends "done".
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

      function send(data: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      }

      function finish() {
        if (closed) return;
        closed = true;
        send(JSON.stringify({ event: "done" }));
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
                send(line);
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
    },
  });
}
