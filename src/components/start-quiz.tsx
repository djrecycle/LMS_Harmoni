"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Play } from "lucide-react";
import { toast } from "sonner";
import { startQuiz } from "@/app/actions/quiz";
import { Button } from "@/components/ui/button";

export function StartQuizButton({ quizId, label }: { quizId: string; label: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button
      size="lg"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await startQuiz(quizId);
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        })
      }
    >
      {busy ? <LoaderCircle className="animate-spin" /> : <Play />} {label}
    </Button>
  );
}
