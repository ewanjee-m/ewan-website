import type { Locale } from "./messages";

export interface LocaleMetadata {
  title: string;
  description: string;
}

const metadataByLocale: Record<Locale, LocaleMetadata> = {
  ko: {
    title: "Ewan's World · 인터랙티브 3D 포트폴리오",
    description:
      "일본 축제에서 영감을 받은 3D 월드의 장면과 상호작용을 탐험해 보세요."
  },
  ja: {
    title: "Ewan's World · インタラクティブ3Dポートフォリオ",
    description:
      "日本のお祭りをイメージした3Dワールドの風景と操作を楽しめます。"
  },
  en: {
    title: "Ewan's World · Interactive 3D Portfolio",
    description:
      "Explore the scenes and interactions of a Japanese festival-inspired 3D world."
  }
};

export function getLocaleMetadata(locale: Locale): LocaleMetadata {
  return metadataByLocale[locale];
}
