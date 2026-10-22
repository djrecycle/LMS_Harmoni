import { signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";

/** "Continue with Google" — for students only (self-registered accounts). Only rendered when Google sign-in is configured. */
export async function GoogleButton() {
  const t = await getT();
  return (
    <form action={signInWithGoogle}>
      <Button type="submit" variant="outline" size="lg" className="w-full">
        <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
          <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.92l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.11Z" />
          <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.11C6.22 6.87 8.87 4.75 12 4.75Z" />
        </svg>
        {t("Continue with Google")}
      </Button>
    </form>
  );
}
