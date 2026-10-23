import { eq } from "drizzle-orm";
import { Eye, RotateCcw, Undo2 } from "lucide-react";
import { exitStudentView, resetStudentView } from "@/app/actions/student-view";
import { Button } from "@/components/ui/button";
import { db, schema } from "@/db";
import type { CurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

/** Shown on every student page while a teacher uses Student view. */
export async function StudentViewBanner({ user }: { user: CurrentUser }) {
  if (!user.studentView) return null;
  const t = await getT();
  const [k] = await db
    .select({ name: schema.classroom.name })
    .from(schema.classroomMembership)
    .innerJoin(schema.classroom, eq(schema.classroom.id, schema.classroomMembership.classroomId))
    .where(eq(schema.classroomMembership.studentId, user.id))
    .limit(1);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <Eye className="size-5 shrink-0" />
      <p className="min-w-0 flex-[1_1_16rem]">
        <span className="font-bold">{t("Student view")}</span>
        {" · "}
        {k ? t("You are seeing class {0} as a test student. Quizzes and practice you do here are saved for the test student only and are not counted in grades or reports.", k.name) : t("You are using a test student.")}
      </p>
      <div className="flex flex-wrap gap-2">
        <form action={resetStudentView}>
          <Button type="submit" size="sm" variant="outline" title={t("Erase the test student's quiz attempts, practice scores and recordings")}>
            <RotateCcw /> {t("Reset test data")}
          </Button>
        </form>
        <form action={exitStudentView}>
          <Button type="submit" size="sm">
            <Undo2 /> {t("Back to teacher")}
          </Button>
        </form>
      </div>
    </div>
  );
}
