import { redirect } from "next/navigation";

/** AI Settings moved to /teacher/ai-settings (every teacher has their own now). */
export default function OldAiSettingsPage() {
  redirect("/teacher/ai-settings");
}
