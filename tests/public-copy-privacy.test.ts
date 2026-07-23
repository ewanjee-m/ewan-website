import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getLocaleMetadata } from "../app/i18n/localeMetadata";
import { getMessages, locales } from "../app/i18n/messages";

const EXPECTED_PORTFOLIO_ITEMS = {
  ko: [
    ["world-design", "축제 월드 디자인", "입체 RPG 마을 · 낮과 밤 · 일본 축제"],
    ["character-controls", "캐릭터와 조작", "키보드 · 터치 · 카메라"],
    ["ai-guide", "AI 길 안내", "날씨 · 포춘 · 직접 이동"]
  ],
  ja: [
    ["world-design", "祭りワールドデザイン", "立体RPGの町 · 昼と夜 · 日本の祭り"],
    ["character-controls", "キャラクターと操作", "キーボード · タッチ · カメラ"],
    ["ai-guide", "AI道案内", "天気 · 運勢 · 直接操作"]
  ],
  en: [
    [
      "world-design",
      "Festival World Design",
      "Volumetric RPG town · Day and night · Japanese festival"
    ],
    ["character-controls", "Characters and Controls", "Keyboard · Touch · Camera"],
    ["ai-guide", "AI Directions", "Weather · Fortune · Direct control"]
  ]
} as const;

const EXPECTED_METADATA = {
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
} as const;

describe("public portfolio copy privacy", () => {
  it("keeps every localized portfolio entry on the approved festival-world topics", () => {
    for (const locale of locales) {
      const messages = getMessages(locale);
      expect(
        messages.portfolioItems.map(({ id, title, kicker }) => [
          id,
          title,
          kicker
        ])
      ).toEqual(EXPECTED_PORTFOLIO_ITEMS[locale]);
      expect(getLocaleMetadata(locale)).toEqual(EXPECTED_METADATA[locale]);
    }
  });

  it("describes only the interactive festival world in public documentation", () => {
    expect(readFileSync("README.md", "utf8")).toContain(
      "공항버스, 도쿄, 규카츠, 벚꽃과 하나비 장면을 탐험할 수 있다."
    );
    expect(readFileSync("CONTEXT.md", "utf8")).toContain(
      "`ewan-website`는 방문자가 남성 또는 여성 플레이어 캐릭터를 선택하고 일본 마을의 다섯 장소를 탐색하는 인터랙티브 포트폴리오다."
    );
    expect(readFileSync("docs/product-plan.md", "utf8")).toContain(
      "`FlatWorldCanvas`는 승인 원화 기준 Canvas 2D 렌더러다."
    );
  });

  it("uses only the public npm registry for dependency archives", () => {
    const lock = readFileSync("package-lock.json", "utf8");
    const archiveUrls = lock.match(/https:\/\/[^\"\s]+\.tgz/g) ?? [];

    expect(archiveUrls.length).toBeGreaterThan(700);
    expect(
      archiveUrls.every((url) => url.startsWith("https://registry.npmjs.org/"))
    ).toBe(true);
  });
});
