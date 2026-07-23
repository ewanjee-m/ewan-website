import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExperienceShell } from "../components/ExperienceShell";
import { getLocaleMetadata } from "../i18n/localeMetadata";
import { isLocale, locales } from "../i18n/messages";

interface LocalePageProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? getLocaleMetadata(locale) : {};
}

export default async function LocalePage({ params }: LocalePageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  return <ExperienceShell locale={locale} />;
}
