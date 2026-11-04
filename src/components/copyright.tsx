import { getT } from "@/i18n/server";

const LICENSE_URL = "https://github.com/djrecycle/LMS_Harmoni/blob/main/LICENSE";

/** "© 2026 Rangga (djrecycle) · MIT License" line, as in the LICENSE file. */
export async function Copyright({ className }: { className?: string }) {
  const t = await getT();
  return (
    <p className={className}>
      © 2026 Rangga (djrecycle) ·{" "}
      <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
        {t("MIT License")}
      </a>
    </p>
  );
}
