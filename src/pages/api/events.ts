import type { APIRoute } from "astro";
import { bus } from "../../lib/events";

// The minimal server-sent-events (SSE) pattern: a long-lived streaming
// response the browser consumes with `new EventSource("/api/events")`. Every
// change to the student's picks is announced here, so a timetable open in
// another tab doesn't go stale. CI's post-deploy check expects this endpoint
// to stream, so it stays even while the app has a single user.
export const GET: APIRoute = () => {
  let onChange: () => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      // an opening comment so the client (and the post-deploy CI probe) sees
      // bytes immediately, and a periodic one so proxies don't drop the
      // connection as idle
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onChange = () => controller.enqueue("event: change\ndata: {}\n\n");
      bus.on("change", onChange);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("change", onChange);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
