import Link from "next/link";
import { Bot, ClipboardList, Headphones, Library, Mic, Piano, Trophy } from "lucide-react";
import { Brand } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { dashboardPathFor, getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

const FEATURES = [
  { Icon: Library, title: "Multimedia lessons", content: "Text, images, audio, and video in one place. Students can learn anytime from their phones." },
  { Icon: ClipboardList, title: "Interactive quizzes", content: "Text, image, audio, and video questions, even answering with piano keys. Graded automatically." },
  { Icon: Piano, title: "Virtual piano", content: "Play right on the screen or connect a MIDI keyboard. Sound with no noticeable delay." },
  { Icon: Headphones, title: "Pitch & rhythm practice", content: "Repeat notes and rhythm patterns; the app scores your accuracy." },
  { Icon: Mic, title: "Record & play back", content: "Record your playing, listen again, and send it to your teacher to hear." },
  { Icon: Bot, title: "AI music assistant", content: "Teachers create questions and lessons faster with AI drafts they review and edit." },
];

export default async function Home() {
  const t = await getT();
  const user = await getCurrentUser();
  return (
    <div className="min-h-dvh">
      {/* On phones the header keeps only language + theme: sign in / sign up (or the dashboard link) are the full-width
          buttons right below, and four controls next to the logo did not fit a 320px screen. */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <Brand className="shrink-0" />
        <div className="flex items-center gap-1.5 sm:gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          {user ? (
            <Button asChild className="hidden sm:inline-flex">
              <Link href={dashboardPathFor(user.role)}>{t("Go to dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link href="/login">{t("Sign in")}</Link>
              </Button>
              <Button asChild className="hidden sm:inline-flex">
                <Link href="/register">{t("Sign up")}</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute top-40 -right-20 size-[22rem] rounded-full bg-accent/25 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-4 pt-14 pb-16 text-center sm:px-6 sm:pt-24 sm:pb-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3.5 py-1.5 text-xs font-bold text-primary">
            <Trophy className="size-3.5" /> {t("An LMS built for Music class")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
            {t("Learning music becomes")} <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{t("more alive")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground text-balance sm:text-lg">
            {t("Harmoni Music Class brings lessons, audio and MIDI piano quizzes, instrument practice, and AI assistance into one app that is light on students' phones and practical for teachers.")}
          </p>
          <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <Button asChild size="lg">
              <Link href={user ? dashboardPathFor(user.role) : "/register"}>{user ? t("Open dashboard") : t("Get started")}</Link>
            </Button>
            {!user && (
              <Button asChild size="lg" variant="outline">
                <Link href="/login">{t("I already have an account")}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, content }) => (
            <div key={title} className="flex gap-4 rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md sm:block sm:p-5">
              <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary sm:mb-3">
                <Icon className="size-5" />
              </div>
              <div>
                <h2 className="font-bold">{t(title)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t(content)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">{t("Harmoni Music Class · Made for Music class")}</footer>
    </div>
  );
}
