// Builds src/data/timetable.json from two real sources, so nothing in the
// app's picture of ANU is typed in by hand:
//
//   - my MyTimetable export (.ics): which courses I take and which session of
//     each activity I'm allocated to. It stays out of the repo (it names
//     staff and is my personal timetable); only what's derived from it lands.
//   - the ANU Computer Science Students' Association's unofficial timetable
//     (github.com/pl4nty/anutimetable, CC BY-SA 4.0): every session of those
//     courses, so there is something to choose between. It is scraped daily
//     from the old official timetable, which can differ from MyTimetable, so
//     every allocation in the export is checked against it and a mismatch
//     stops the import.
//
// Seats are neither source's: src/data/seats.json holds illustrative numbers,
// merged in and labelled as such.
//
//   node scripts/import-timetable.ts --ics ~/Downloads/<export>.ics
import { readFileSync, writeFileSync } from "node:fs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SOURCE = "https://timetable.cssa.club/timetable_data/2026/S2.min.json";
const OUT = "src/data/timetable.json";
const SEATS = "src/data/seats.json";

type CssaClass = {
  activity: string;
  occurrence: string;
  day: number;
  start: string;
  finish: string;
  location: string;
  weeks: string;
};
type CssaCourse = { id: string; title: string; classes: CssaClass[] };
type Seats = { note: string; sessions: Record<string, { capacity: number; taken: number }> };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

// "31‑36,39‑40,42‑44" (non-breaking hyphens) to [31, ..., 36, 39, 40, 42, 43, 44]
function weeks(spec: string): number[] {
  return spec.split(",").flatMap((part) => {
    const [from, to] = part.split(/[-‑–]/).map(Number);
    return Array.from({ length: (to ?? from) - from + 1 }, (_, i) => from + i);
  });
}

type Allocation = { code: string; activity: string; label: string; day: string; start: string; end: string };

// Each VEVENT is one dated class. Its DESCRIPTION starts
// "COMP4020_S2_1_9056\, TutA\, 05", which names course, activity and session.
function allocations(ics: string): Allocation[] {
  const seen = new Map<string, Allocation>();
  for (const event of ics.replace(/\r/g, "").split("BEGIN:VEVENT").slice(1)) {
    const desc = /DESCRIPTION:([A-Z]{4}\d{4})_[^\\]*\\, (\w+)\\, (\w+)/.exec(event);
    const start = /DTSTART;[^:]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(event);
    const end = /DTEND;[^:]*:\d{8}T(\d{2})(\d{2})/.exec(event);
    if (!desc || !start || !end) throw new Error(`unreadable event in the export:\n${event.slice(0, 300)}`);
    const date = new Date(Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3])));
    const allocation = {
      code: desc[1],
      activity: desc[2],
      label: desc[3],
      day: DAYS[(date.getUTCDay() + 6) % 7],
      start: `${start[4]}:${start[5]}`,
      end: `${end[1]}:${end[2]}`,
    };
    seen.set(Object.values(allocation).join(" "), allocation);
  }
  return [...seen.values()];
}

const icsPath = arg("ics");
if (!icsPath) throw new Error("usage: node scripts/import-timetable.ts --ics <MyTimetable export>");

const mine = allocations(readFileSync(icsPath, "utf8"));
const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE}: HTTP ${res.status}`);
const cssa = (await res.json()) as Record<string, CssaCourse>;
const seats = JSON.parse(readFileSync(SEATS, "utf8")) as Seats;

const codes = [...new Set(mine.map((a) => a.code))].sort();
const courses = codes.map((code) => {
  const course = cssa[`${code}_S2`];
  if (!course) throw new Error(`${code} is in the export but not in the CSSA data`);

  const byActivity = Map.groupBy(course.classes, (c) => c.activity);
  const activities = [...byActivity].map(([name, classes]) => {
    const byLabel = Map.groupBy(classes, (c) => c.occurrence);
    return {
      name,
      // the CSSA app's own rule: an activity with several sessions is one you
      // choose between; with one, you attend it
      mode: byLabel.size > 1 ? "pick" : "all",
      sessions: [...byLabel].map(([label, rows]) => ({
        label,
        ...seats.sessions[`${code} ${name} ${label}`],
        meetings: rows.map((r) => ({
          day: DAYS[r.day],
          start: r.start,
          end: r.finish,
          room: r.location.trim() || "room not published",
          weeks: weeks(r.weeks),
        })),
      })),
    };
  });

  return { code, title: course.title.replace(/^\S+\s/, "").replace(/_/g, ": "), activities };
});

// Every allocation in the export has to be a session the CSSA data offers, at
// the same day and time; otherwise the two sources disagree and a person
// should look before anything is imported.
for (const a of mine) {
  const session = courses
    .find((c) => c.code === a.code)
    ?.activities.find((act) => act.name === a.activity)
    ?.sessions.find((s) => s.label === a.label);
  const meets = session?.meetings.some((m) => m.day === a.day && m.start === a.start && m.end === a.end);
  if (!meets) {
    throw new Error(`export has ${a.code} ${a.activity}/${a.label} ${a.day} ${a.start}-${a.end}; CSSA data doesn't`);
  }
}

for (const key of Object.keys(seats.sessions)) {
  const [code, activity, label] = key.split(" ");
  const known = courses
    .find((c) => c.code === code)
    ?.activities.find((a) => a.name === activity)
    ?.sessions.some((s) => s.label === label);
  if (!known) throw new Error(`${SEATS} has seats for ${key}, which isn't an imported session`);
}

const picks = mine
  .filter((a) => courses.find((c) => c.code === a.code)?.activities.find((act) => act.name === a.activity)?.mode === "pick")
  .map(({ code, activity, label }) => ({ course: code, activity, label }))
  .filter((p, i, all) => all.findIndex((q) => q.course === p.course && q.activity === p.activity) === i);

const out = {
  term: "2026 Semester 2",
  source: {
    sessions: SOURCE,
    project: "https://github.com/pl4nty/anutimetable",
    licence: "CC BY-SA 4.0",
    fetched: new Date().toISOString().slice(0, 10),
    allocation: "my MyTimetable export (.ics), not committed",
  },
  seats: seats.note,
  courses,
  picks,
};
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(
  `${OUT}: ${courses.length} courses, ${courses.flatMap((c) => c.activities).length} activities, ` +
    `${courses.flatMap((c) => c.activities.flatMap((a) => a.sessions)).length} sessions, ${picks.length} starting picks`,
);
