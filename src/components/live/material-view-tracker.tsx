"use client";

import { useEffect, useRef } from "react";
import { recordMaterialView } from "@/app/actions/live";

/** Records once per page visit that the student opened this lesson, for the teacher's Live Class screen. */
export function MaterialViewTracker({ materialId }: { materialId: string }) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === materialId) return;
    sent.current = materialId;
    recordMaterialView(materialId).catch(() => {});
  }, [materialId]);
  return null;
}
