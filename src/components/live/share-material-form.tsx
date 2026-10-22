"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { shareMaterialNow } from "@/app/actions/live";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useT } from "@/i18n/client";

/** Share one of the teacher's lessons with the live class right now. */
export function ShareMaterialForm({ classroomId, options }: { classroomId: string; options: { id: string; title: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [materialId, setMaterialId] = useState("");
  const [busy, start] = useTransition();

  function share() {
    if (!materialId) return;
    start(async () => {
      const r = await shareMaterialNow(classroomId, materialId);
      if (!r.ok) return void toast.error(r.error ?? t("Something went wrong."));
      toast.success(r.message ?? t("Saved."));
      setMaterialId("");
      router.refresh();
    });
  }

  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)} aria-label={t("Choose a lesson to share")} className="min-w-0 flex-1">
        <option value="">{t("Choose a lesson to share…")}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </Select>
      <Button onClick={share} disabled={!materialId || busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Send />} {t("Share now")}
      </Button>
    </div>
  );
}
