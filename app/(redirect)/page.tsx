import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveInitialLocale } from "../i18n/resolveLocale";

export default async function HomePage() {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers()
  ]);
  const acceptedLanguages = (requestHeaders.get("accept-language") ?? "")
    .split(",")
    .map((entry) => entry.trim().split(";")[0])
    .filter(Boolean);
  const locale = resolveInitialLocale({
    savedLocale: cookieStore.get("ewan-world-locale")?.value,
    acceptedLanguages
  });

  redirect(`/${locale}`);
}
