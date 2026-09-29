import { eq } from "drizzle-orm";
import { db } from "./db";
import { type Activity, activities, type Course, courses, picks, type Session, sessions } from "./schema";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export type SessionView = Session & {
  course: Course;
  activity: Activity;
  // the one name a session goes by, in the picker and on the timetable alike
  title: string;
  picked: boolean;
  // null when ANU doesn't publish a capacity for the session
  seatsLeft: number | null;
  // what the student already attends that this session overlaps
  clashesWith: SessionView[];
};

export type ActivityView = Activity & { course: Course; sessions: SessionView[]; picked?: SessionView };

export type Timetable = {
  // everything the student attends: every "all" session, and each pick
  attending: SessionView[];
  // the activities the student chooses one session of, grouped by course
  choosing: { course: Course; activities: ActivityView[] }[];
};

const overlaps = (a: Session, b: Session) => a.day === b.day && a.start < b.end && b.start < a.end;

export function loadTimetable(): Timetable {
  const courseById = new Map(db.select().from(courses).all().map((c) => [c.id, c]));
  const activityById = new Map(db.select().from(activities).all().map((a) => [a.id, a]));
  const pickedIds = new Set(db.select().from(picks).all().map((p) => p.sessionId));

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
        picked,
        // `taken` counts other students; your own pick takes one more seat
        seatsLeft: s.capacity === null ? null : s.capacity - (s.taken ?? 0) - (picked ? 1 : 0),
        clashesWith: [],
      };
    })
    .sort((a, b) => a.day - b.day || a.start - b.start || a.title.localeCompare(b.title));

  const attending = views.filter((v) => v.activity.mode === "all" || v.picked);
  for (const v of views) {
    v.clashesWith = attending.filter((a) => a.activityId !== v.activityId && overlaps(a, v));
  }

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

  return { attending, choosing };
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
