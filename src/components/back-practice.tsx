import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getT } from "@/i18n/server";

export async function BackPractice() {
  const t = await getT();
  return (
    <Link href="/student/practice" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> {t("All practice")}
    </Link>
  );
}
