import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  type Activity,
  activities,
  type Course,
  courses,
  type Meeting,
  meetings,
  picks,
  type Session,
  sessions,
} from "./schema";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// [32, 33, 34, 39, 41] to "32–34, 39, 41"
export function weekRanges(weeks: number[]): string {
  const runs: [number, number][] = [];
  for (const w of weeks) {
    const run = runs.at(-1);
    if (run && run[1] === w - 1) run[1] = w;
    else runs.push([w, w]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
}

// The Monday of an ISO calendar week, as "5 Oct". The sources number weeks
// this way, so a one-off meeting can be dated rather than left as a number.
export function weekOf(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  return monday.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}

export type MeetingView = Omit<Meeting, "weeks"> & { weeks: number[] };

export type SessionView = Session & {
  course: Course;
  activity: Activity;
  // the one name a session goes by, in the picker and on the timetable alike
  title: string;
  meetings: MeetingView[];
  picked: boolean;
  // null when there's no capacity for the session
  seatsLeft: number | null;
  // what the student already attends that this session overlaps
  clashesWith: SessionView[];
};

// one meeting of something the student attends, placed on the week grid
export type Placement = { session: SessionView; meeting: MeetingView; clashesWith: SessionView[] };

export type ActivityView = Activity & { course: Course; sessions: SessionView[]; picked?: SessionView };

export type Timetable = {
  // everything the student attends: every "all" session, and each pick
  attending: SessionView[];
  placements: Placement[];
  // the activities the student chooses one session of, grouped by course
  choosing: { course: Course; activities: ActivityView[] }[];
};

const overlaps = (a: MeetingView, b: MeetingView) =>
  a.day === b.day && a.start < b.end && b.start < a.end && a.weeks.some((w) => b.weeks.includes(w));

const clashing = (m: MeetingView, others: SessionView[], self: SessionView) =>
  others.filter((o) => o.activityId !== self.activityId && o.meetings.some((om) => overlaps(m, om)));

export function loadTimetable(): Timetable {
  const courseById = new Map(db.select().from(courses).all().map((c) => [c.id, c]));
  const activityById = new Map(db.select().from(activities).all().map((a) => [a.id, a]));
  const pickedIds = new Set(db.select().from(picks).all().map((p) => p.sessionId));
  const meetingsBySession = Map.groupBy(
    db
      .select()
      .from(meetings)
      .all()
      .map((m) => ({ ...m, weeks: m.weeks.split(",").map(Number) })),
    (m) => m.sessionId,
  );

  const views: SessionView[] = db
    .select()
    .from(sessions)
    .all()
    .map((s) => {
      const activity = activityById.get(s.activityId) as Activity;
      const course = courseById.get(activity.courseId) as Course;
      const picked = pickedIds.has(s.id);
      return {
        ...s,
        course,
        activity,
        title: `${course.code} ${activity.name} ${s.label}`,
        meetings: (meetingsBySession.get(s.id) ?? []).sort((a, b) => b.weeks.length - a.weeks.length),
        picked,
        // `taken` counts other students; your own pick takes one more seat
        seatsLeft: s.capacity === null ? null : s.capacity - (s.taken ?? 0) - (picked ? 1 : 0),
        clashesWith: [],
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const attending = views.filter((v) => v.activity.mode === "all" || v.picked);
  for (const v of views) {
    v.clashesWith = [...new Set(v.meetings.flatMap((m) => clashing(m, attending, v)))];
  }

  const placements = attending
    .flatMap((session) => session.meetings.map((meeting) => ({ session, meeting, clashesWith: clashing(meeting, attending, session) })))
    .sort((a, b) => a.meeting.day - b.meeting.day || a.meeting.start - b.meeting.start);

  const choosing = [...courseById.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((course) => ({
      course,
      activities: [...activityById.values()]
        .filter((a) => a.courseId === course.id && a.mode === "pick")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => {
          const own = views.filter((v) => v.activityId === a.id);
          return { ...a, course, sessions: own, picked: own.find((v) => v.picked) };
        }),
    }))
    .filter((c) => c.activities.length > 0);

  return { attending, placements, choosing };
}

export type ChooseResult = "ok" | "unknown" | "not-pickable" | "full";

// Choose a session, replacing any earlier pick of the same activity. The
// check and the write share one transaction, so a seat can't be taken by a
// request that read a stale count.
export function choose(sessionId: number): ChooseResult {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(sessions)
      .innerJoin(activities, eq(sessions.activityId, activities.id))
      .where(eq(sessions.id, sessionId))
      .get();
    if (!row) return "unknown";
    if (row.activities.mode !== "pick") return "not-pickable";

    const current = tx.select().from(picks).where(eq(picks.activityId, row.activities.id)).get();
    if (current?.sessionId === sessionId) return "ok";

    const { capacity, taken } = row.sessions;
    if (capacity !== null && (taken ?? 0) >= capacity) return "full";

    tx.insert(picks)
      .values({ activityId: row.activities.id, sessionId })
      .onConflictDoUpdate({ target: picks.activityId, set: { sessionId, pickedAt: new Date().toISOString() } })
      .run();
    return "ok";
  });
}
