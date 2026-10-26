import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  smallint,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InteractiveLessonData } from "@/lib/interactive-lessons";
import type { AnswerKey, QuestionSound } from "@/lib/questions";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const roleEnum = pgEnum("role", ["teacher", "student"]);
export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "fill_in",
  "true_false",
  "audio",
  "video",
  "midi",
]);
export const answerTypeEnum = pgEnum("answer_type", [
  "multiple_choice",
  "fill_in",
  "true_false",
  "midi",
]);
export const typeMediaEnum = pgEnum("type_media", ["text", "image", "audio", "video", "interactive"]);
export const attemptStatusEnum = pgEnum("attempt_status", ["in_progress", "completed"]);
export const practiceKindEnum = pgEnum("practice_kind", ["note", "rhythm", "interval", "chord", "scale", "tempo", "melody", "solfege", "song"]);
export const practiceAnalysisSourceEnum = pgEnum("practice_analysis_source", ["rule", "ai"]);
export const teachingDocKindEnum = pgEnum("teaching_doc_kind", ["cp_tp_atp", "modul_ajar", "materi_guru", "materi_siswa"]);
export const teachingDocStatusEnum = pgEnum("teaching_doc_status", ["pending", "done", "error"]);
export const dayOfWeekEnum = pgEnum("day_of_week", ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["hadir", "sakit", "izin", "alpa"]);

/* ------------------------------------------------------------------ */
/* Authentication (structure follows Better Auth)                      */
/* ------------------------------------------------------------------ */

/** `User` in the PRD. The password hash column lives in the `account` table (managed by Better Auth). */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    /** Login name for accounts a teacher creates without a real email (see the Better Auth `username` plugin). Self-registered accounts leave this empty. */
    username: text("username").unique(),
    image: text("image"),
    role: roleEnum("role").notNull().default("student"),
    /** The first teacher to register becomes the main admin. */
    isAdmin: boolean("is_admin").notNull().default(false),
    // Required by Better Auth's `admin` plugin schema (used only for admin.createUser, which lets a teacher
    // create a student account without a session switch; this app never bans anyone).
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    /** Set on a teacher's test student for "Student view" (the teacher's id). Such an account has no password and cannot log in. */
    demoOwnerId: text("demo_owner_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_role_idx").on(t.role)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Required by the `admin` plugin schema; unused (this app never impersonates). */
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------ */
/* Classes                                                             */
/* ------------------------------------------------------------------ */

export const classroom = pgTable(
  "classroom",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    inviteCode: text("invite_code").notNull().unique(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("classroom_teacher_idx").on(t.teacherId)],
);

export const classroomMembership = pgTable(
  "classroom_membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classroom.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: timestamp("join_at", { withTimezone: true }).notNull().defaultNow(),
    /** The teacher's test student (Student view). Left out of rosters, grades, recaps, attendance and exports. */
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    uniqueIndex("membership_unique").on(t.classroomId, t.studentId),
    index("membership_student_idx").on(t.studentId),
  ],
);

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

export const material = pgTable(
  "material",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Content in simple Markdown. */
    content: text("content").notNull().default(""),
    typeMedia: typeMediaEnum("type_media").notNull().default("text"),
    /** Storage key (or external URL) for the main image/audio/video of the lesson; for typeMedia "interactive" this is the lesson slug from the interactive-lesson registry instead (mutually exclusive with interactiveData). */
    mediaKey: text("media_key"),
    /** AI-generated interactive lesson content (typeMedia "interactive" only), mutually exclusive with a registry mediaKey. */
    interactiveData: jsonb("interactive_data").$type<InteractiveLessonData | null>(),
    topic: text("topic"),
    /** Grade level this lesson is for (7/8/9, free text like the Perangkat Ajar "Kelas" field) — not the same as which classroom(s) it's assigned to. */
    kelas: text("kelas"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("material_teacher_idx").on(t.teacherId)],
);

/** Assignment of a lesson to a class, with its publish schedule. */
export const classroomMaterial = pgTable(
  "classroom_material",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => material.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classroom.id, { onDelete: "cascade" }),
    /** Date the lesson starts showing ("Today's Lessons" when it equals today). */
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("classroom_material_unique").on(t.materialId, t.classroomId),
    index("material_classroom_classroom_date_idx").on(t.classroomId, t.date),
  ],
);

export const materialProgress = pgTable(
  "material_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => material.id, { onDelete: "cascade" }),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("progress_unique").on(t.studentId, t.materialId)],
);

/** When a student first/last opened a lesson (a "click"), separate from marking it completed. Used by Live Class. */
export const materialView = pgTable(
  "material_view",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => material.id, { onDelete: "cascade" }),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }).notNull().defaultNow(),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }).notNull().defaultNow(),
    openCount: integer("open_count").notNull().default(1),
  },
  (t) => [uniqueIndex("material_view_unique").on(t.studentId, t.materialId), index("material_view_material_idx").on(t.materialId)],
);

/** Last heartbeat from a signed-in student's open tab, so the teacher can see who is online right now. */
export const userPresence = pgTable("user_presence", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** The page the student had open at the last heartbeat. */
  path: text("path"),
});

/* ------------------------------------------------------------------ */
/* Question bank & quizzes                                             */
/* ------------------------------------------------------------------ */

export const question = pgTable(
  "question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: questionTypeEnum("type").notNull(),
    answerType: answerTypeEnum("answer_type").notNull(),
    prompt: text("prompt").notNull(),
    /** Supporting image/audio/video for the question. */
    mediaKey: text("media_key"),
    /** Sound the browser plays for an audio question (piano notes or a click track), instead of an uploaded clip. */
    sound: jsonb("sound").$type<QuestionSound | null>(),
    /** Answer choices (only for the multiple_choice answer type). */
    options: jsonb("options").$type<string[]>(),
    /** Answer key. MUST NOT be sent to the student before the question is answered. */
    answerKey: jsonb("answerKey").$type<AnswerKey | null>(),
    explanation: text("explanation"),
    topic: text("topic"),
    /** Grade level this question is for (free text like material.kelas, e.g. "VII"), used to filter/combine questions. */
    kelas: text("kelas"),
    /** Semester 1 (ganjil) or 2 (genap); null when not set. */
    semester: smallint("semester"),
    points: integer("points").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("question_teacher_topic_idx").on(t.teacherId, t.topic)],
);

export const quiz = pgTable(
  "quiz",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classroom.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    maxAttempts: integer("max_attempts").notNull().default(1),
    instantFeedback: boolean("instant_feedback").notNull().default(true),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quiz_classroom_idx").on(t.classroomId), index("quiz_teacher_idx").on(t.teacherId)],
);

export const quizQuestion = pgTable(
  "quiz_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quiz.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [uniqueIndex("quiz_question_unique").on(t.quizId, t.questionId)],
);

/* ------------------------------------------------------------------ */
/* Attempts & answers                                                  */
/* ------------------------------------------------------------------ */

export const attempt = pgTable(
  "attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quiz.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: attemptStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    score: real("score").notNull().default(0),
    maxScore: real("max_score").notNull().default(0),
    /** Grade 0-100. */
    grade: real("grade").notNull().default(0),
    /** Number of questions waiting for the teacher's manual grading. */
    pendingReview: integer("pending_review").notNull().default(0),
  },
  (t) => [index("attempt_quiz_idx").on(t.quizId), index("attempt_student_idx").on(t.studentId)],
);

export const answer = pgTable(
  "answer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempt.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    /** Shape depends on the question type: number (option index), text, boolean, or string[] (notes). */
    answer: jsonb("answer").$type<unknown>(),
    /** null = cannot be graded automatically yet (waiting for the teacher). */
    correct: boolean("correct"),
    score: real("score"),
    maxScore: real("max_score").notNull().default(1),
    teacherGraded: boolean("teacher_graded").notNull().default(false),
    teacherNote: text("teacher_note"),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("answer_unique").on(t.attemptId, t.questionId)],
);

/* ------------------------------------------------------------------ */
/* Practice & recordings                                               */
/* ------------------------------------------------------------------ */

export const recording = pgTable(
  "recording",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    fileKey: text("file_key").notNull(),
    mimeType: text("mime_type").notNull(),
    durationSeconds: integer("duration_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recording_student_idx").on(t.studentId)],
);

export const practiceResult = pgTable(
  "practice_result",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: practiceKindEnum("kind").notNull(),
    title: text("title").notNull(),
    /** 0-100 */
    score: integer("score").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    /** Set when the practice was done inside a lesson (for the teacher's per-lesson practice recap). */
    materialId: uuid("material_id").references(() => material.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("practice_result_student_idx").on(t.studentId, t.createdAt), index("practice_result_material_idx").on(t.materialId, t.studentId)],
);

/** Extra practice material a teacher posts on the students' Practice page (a song, exercise sheet, demo video…). */
export const practiceMaterial = pgTable(
  "practice_material",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** One short line shown on the practice card. */
    description: text("description").notNull().default(""),
    /** Instructions / notes in simple Markdown. */
    content: text("content").notNull().default(""),
    /** "text", "image", "audio" or "video" ("interactive" is not used here). */
    typeMedia: typeMediaEnum("type_media").notNull().default("text"),
    /** Storage key or external https link of the main image/audio/video. */
    mediaKey: text("media_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("practice_material_teacher_idx").on(t.teacherId)],
);

/** Which classes see a practice material. */
export const classroomPracticeMaterial = pgTable(
  "classroom_practice_material",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceMaterialId: uuid("practice_material_id")
      .notNull()
      .references(() => practiceMaterial.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classroom.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("classroom_practice_material_unique").on(t.practiceMaterialId, t.classroomId),
    index("classroom_practice_material_classroom_idx").on(t.classroomId),
  ],
);

/** A piano song a teacher adds for the "Play a Song" mode (falling notes). The melody is kept as editable text. */
export const pianoSong = pgTable(
  "piano_song",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Region of a folk song, composer, or source. */
    origin: text("origin").notNull().default(""),
    level: integer("level").notNull().default(1),
    bpm: integer("bpm").notNull().default(90),
    /** "angka" (notasi angka, with doNote), "letters" (C4:1 E4:0.5 ...) or "roll" (piano roll, C4@0:1). See src/lib/songs.ts. */
    format: text("format").$type<"angka" | "letters" | "roll">().notNull().default("angka"),
    doNote: text("do_note").notNull().default("C4"),
    notation: text("notation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("piano_song_teacher_idx").on(t.teacherId)],
);

/** Which classes see a teacher's piano song. */
export const classroomPianoSong = pgTable(
  "classroom_piano_song",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    songId: uuid("song_id")
      .notNull()
      .references(() => pianoSong.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classroom.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("classroom_piano_song_unique").on(t.songId, t.classroomId), index("classroom_piano_song_classroom_idx").on(t.classroomId)],
);

/** The teacher's written analysis of one student's practice in one lesson, generated on demand (rule-based or AI). */
export const practiceAnalysis = pgTable(
  "practice_analysis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => material.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    source: practiceAnalysisSourceEnum("source").notNull(),
    /** Number of practice attempts the analysis was based on (shows when it is out of date). */
    attempts: integer("attempts").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("practice_analysis_unique").on(t.materialId, t.studentId)],
);

/* ------------------------------------------------------------------ */
/* AI usage (cost control)                                             */
/* ------------------------------------------------------------------ */

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("ai_usage_unique").on(t.userId, t.date)],
);

/* ------------------------------------------------------------------ */
/* Admin-editable settings (key/value). "ai" = AI provider settings;   */
/* API keys inside are encrypted (see src/lib/secret-box.ts).          */
/* ------------------------------------------------------------------ */

export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

/* ------------------------------------------------------------------ */
/* AI teaching documents (CP-TP-ATP, Modul Ajar, Materi)              */
/* ------------------------------------------------------------------ */

/** A generated teaching document. `data` is the raw JSON the AI produced; the .docx is rendered from it on download. */
export const teachingDoc = pgTable(
  "teaching_doc",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: teachingDocKindEnum("kind").notNull(),
    title: text("title").notNull(),
    data: jsonb("data").$type<Record<string, unknown> | null>(),
    /** The context the document was generated with (subject, class, template, BAB, ...). */
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    /** modul_ajar -> materi_guru -> materi_siswa. No FK on purpose: the chain may outlive a deleted source. */
    sourceId: uuid("source_id"),
    status: teachingDocStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    provider: text("provider"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("teaching_doc_teacher_idx").on(t.teacherId, t.kind)],
);

/** A teacher's own Modul Ajar layout template. The built-in template lives in code. */
export const modulTemplate = pgTable(
  "modul_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("modul_template_teacher_idx").on(t.teacherId)],
);

/** Per-teacher defaults for the teaching-document generator (subject, class, identity for the signature block). */
export const perangkatSetting = pgTable("perangkat_setting", {
  teacherId: text("teacher_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Academic calendar, teaching schedule, class journal & attendance    */
/* ------------------------------------------------------------------ */

/** A school year's academic calendar (Kalender Pendidikan), extracted by AI from a teacher's uploaded file. `data` holds the structured semesters/events; see src/lib/kaldik/prompts.ts for its shape. */
export const academicCalendar = pgTable(
  "academic_calendar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    tahunAjaran: text("tahun_ajaran"),
    data: jsonb("data").$type<Record<string, unknown> | null>(),
    sourceFileName: text("source_file_name"),
    status: teachingDocStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    provider: text("provider"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("academic_calendar_teacher_idx").on(t.teacherId)],
);

/** One row of a teacher's weekly teaching timetable (Jadwal Guru). */
export const teacherSchedule = pgTable(
  "teacher_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The class in this app, when it has one. */
    classroomId: uuid("classroom_id").references(() => classroom.id, { onDelete: "set null" }),
    /** Free-text class label, used when there is no matching classroom (or it was deleted). */
    className: text("class_name"),
    hari: dayOfWeekEnum("hari").notNull(),
    jamMulai: text("jam_mulai").notNull(),
    jamSelesai: text("jam_selesai").notNull(),
    mataPelajaran: text("mata_pelajaran").notNull(),
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("teacher_schedule_teacher_idx").on(t.teacherId, t.hari)],
);

/** One teaching session (Jurnal Guru): journal notes for a class on a date. Its attendance rows live in `attendanceRecord`. */
export const classSession = pgTable(
  "class_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classroom.id, { onDelete: "cascade" }),
    tanggal: date("tanggal").notNull(),
    /** Free-text period, e.g. "Jam ke-3-4" or "07:00-08:20". */
    waktu: text("waktu"),
    materi: text("materi"),
    kegiatan: text("kegiatan"),
    kendala: text("kendala"),
    catatan: text("catatan"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("class_session_classroom_date_idx").on(t.classroomId, t.tanggal)],
);

/** One student's attendance status for a class session. */
export const attendanceRecord = pgTable(
  "attendance_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classSessionId: uuid("class_session_id")
      .notNull()
      .references(() => classSession.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull().default("hadir"),
    keterangan: text("keterangan"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_record_unique").on(t.classSessionId, t.studentId)],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const classroomRelations = relations(classroom, ({ one, many }) => ({
  teacher: one(user, { fields: [classroom.teacherId], references: [user.id] }),
  member: many(classroomMembership),
  material: many(classroomMaterial),
  quiz: many(quiz),
}));

export const membershipRelations = relations(classroomMembership, ({ one }) => ({
  classroom: one(classroom, { fields: [classroomMembership.classroomId], references: [classroom.id] }),
  student: one(user, { fields: [classroomMembership.studentId], references: [user.id] }),
}));

export const materialRelations = relations(material, ({ many }) => ({
  assignment: many(classroomMaterial),
}));

export const classroomMaterialRelations = relations(classroomMaterial, ({ one }) => ({
  material: one(material, { fields: [classroomMaterial.materialId], references: [material.id] }),
  classroom: one(classroom, { fields: [classroomMaterial.classroomId], references: [classroom.id] }),
}));

export const quizRelations = relations(quiz, ({ one, many }) => ({
  classroom: one(classroom, { fields: [quiz.classroomId], references: [classroom.id] }),
  question: many(quizQuestion),
  attempt: many(attempt),
}));

export const quizQuestionRelations = relations(quizQuestion, ({ one }) => ({
  quiz: one(quiz, { fields: [quizQuestion.quizId], references: [quiz.id] }),
  question: one(question, { fields: [quizQuestion.questionId], references: [question.id] }),
}));

export const attemptRelations = relations(attempt, ({ one, many }) => ({
  quiz: one(quiz, { fields: [attempt.quizId], references: [quiz.id] }),
  student: one(user, { fields: [attempt.studentId], references: [user.id] }),
  answer: many(answer),
}));

export const answerRelations = relations(answer, ({ one }) => ({
  attempt: one(attempt, { fields: [answer.attemptId], references: [attempt.id] }),
  question: one(question, { fields: [answer.questionId], references: [question.id] }),
}));
