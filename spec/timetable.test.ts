import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, inject, it } from "vitest";

// Crit 7's contract for this app: a slice of ANU timetabling, wired end to
// end. Spec lines covered here:
//
//   "it models a slice of a real ANU system you actually deal with, wired end
//    to end" -- the part a test can hold: choosing a session in the UI goes
//    through the server into the database and comes back out.
//   "the core flow persists across a reload -- create something, and it's
//    still there" -- the chosen session is in the timetable on a fresh load.
//
// It drives the running app over HTTP like a browser would, and asserts what
// the page does, not how it's built. What it fixes about the page:
//
//   - TIMETABLE_PATH serves a POST form with a <select> or radio group of
//     sessions to choose from;
//   - the student's timetable is an element whose accessible name (aria-label
//     or aria-labelledby) mentions "timetable";
//   - a chosen session appears in that timetable under the same text the
//     picker gave it.
//
// Change these deliberately if the design moves; don't loosen them to go
// green. "Real", "you actually deal with" and whether it's the right slice are
// judged at the crit, not here.
const baseUrl = inject("baseUrl");

const TIMETABLE_PATH = "/";
const TIMETABLE_NAME = /timetable/i;

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

async function load(path: string) {
  const url = new URL(path, baseUrl).href;
  const res = await fetch(url);
  return { status: res.status, dom: new JSDOM(await res.text(), { url }) };
}

function accessibleName(el: Element): string {
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    return labelledby
      .split(/\s+/)
      .map((id) => text(el.ownerDocument.getElementById(id)))
      .join(" ");
  }
  return el.getAttribute("aria-label") ?? "";
}

function timetableRegion(doc: Document): Element | undefined {
  return [...doc.querySelectorAll("[aria-label], [aria-labelledby]")].find((el) =>
    TIMETABLE_NAME.test(accessibleName(el)),
  );
}

type Choice = { form: HTMLFormElement; label: string; pick: () => void };

// every session the page offers, as something a user could pick
function choices(doc: Document): Choice[] {
  const forms = [...doc.querySelectorAll("form")].filter(
    (f) => (f.getAttribute("method") ?? "").toLowerCase() === "post",
  );
  return forms.flatMap((form) => [
    ...[...form.querySelectorAll("select")].flatMap((select) =>
      [...select.options]
        .filter((o) => o.value !== "" && !o.disabled)
        .map((o) => ({ form, label: text(o), pick: () => (select.value = o.value) })),
    ),
    ...[...form.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      .filter((r) => !r.disabled)
      .map((r) => ({
        form,
        label: text(r.labels?.[0]),
        pick: () => (r.checked = true),
      })),
  ]);
}

describe("timetable: choosing a session persists", () => {
  let dom: JSDOM;
  let chosen: Choice | undefined;
  let submitStatus: number;

  beforeAll(async () => {
    ({ dom } = await load(TIMETABLE_PATH));
    const doc = dom.window.document;
    const already = text(timetableRegion(doc));
    // a session that isn't in the timetable yet, so its arrival is the proof
    chosen = choices(doc).find((c) => c.label !== "" && !already.includes(c.label));
    if (!chosen) return;

    chosen.pick();
    const body = new URLSearchParams();
    for (const [key, value] of new dom.window.FormData(chosen.form)) {
      if (typeof value === "string") body.append(key, value);
    }
    // Astro rejects form POSTs without a same-origin Origin header (CSRF
    // protection); a browser sends one, a bare fetch doesn't
    const res = await fetch(new URL(chosen.form.action || TIMETABLE_PATH, dom.window.location.href), {
      method: "POST",
      headers: { origin: baseUrl },
      body,
      redirect: "manual",
    });
    submitStatus = res.status;
  });

  it("shows the student's timetable as a labelled region", () => {
    expect(timetableRegion(dom.window.document), 'no element named like "timetable"').toBeDefined();
  });

  it("offers sessions to choose from", () => {
    expect(chosen, "no POST form with a <select> or radio group of sessions not yet chosen").toBeDefined();
  });

  it("accepts the choice", () => {
    expect(submitStatus).toBeGreaterThanOrEqual(200);
    expect(submitStatus).toBeLessThan(400);
  });

  it("still has the chosen session after a fresh page load", async () => {
    const { status, dom: fresh } = await load(TIMETABLE_PATH);
    expect(status).toBe(200);
    expect(text(timetableRegion(fresh.window.document))).toContain(chosen?.label);
  });
});
