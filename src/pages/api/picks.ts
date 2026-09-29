import type { APIRoute } from "astro";
import { bus } from "../../lib/events";
import { choose } from "../../lib/timetable";

// A plain HTML form POSTs a session id here. Choosing replaces any earlier
// pick of the same activity, so this one route is both "choose" and "swap".
// The 303 redirect keeps it working with no client-side JavaScript; other
// open tabs hear about the change over /api/events.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const sessionId = Number(form.get("session"));
  const result = Number.isInteger(sessionId) ? choose(sessionId) : "unknown";
  if (result === "ok") {
    bus.emit("change");
    return redirect("/", 303);
  }
  return redirect(`/?error=${result}`, 303);
};
