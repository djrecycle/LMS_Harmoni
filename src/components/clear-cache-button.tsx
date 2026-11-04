"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { clearAppCache } from "@/app/actions/server";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function ClearCacheButton() {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await clearAppCache();
          if (!r.ok) return void toast.error(r.error ?? t("Could not clear the cache."));
          toast.success(r.message ?? t("App cache cleared."));
          router.refresh();
        })
      }
    >
      {busy ? <LoaderCircle className="animate-spin" /> : <Eraser />} {t("Clear app cache")}
    </Button>
  );
}
