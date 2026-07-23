import { isLocale, type Locale } from "./messages";

interface LocalePreferences {
  savedLocale: string | null | undefined;
  acceptedLanguages: readonly string[];
}

export function resolveInitialLocale({
  savedLocale,
  acceptedLanguages
}: LocalePreferences): Locale {
  if (savedLocale && isLocale(savedLocale.toLowerCase())) {
    return savedLocale.toLowerCase() as Locale;
  }

  for (const language of acceptedLanguages) {
    const primaryLanguage = language.trim().toLowerCase().split("-")[0];
    if (isLocale(primaryLanguage)) {
      return primaryLanguage;
    }
  }

  return "en";
}
