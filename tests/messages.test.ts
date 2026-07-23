import { describe, expect, it } from "vitest";
import { getMessages, locales } from "../app/i18n/messages";

describe("localized messages", () => {
  it("keeps the same non-empty keys and portfolio ids in Korean, Japanese, and English", () => {
    const dictionaries = locales.map((locale) => getMessages(locale));
    const englishKeys = Object.keys(getMessages("en")).sort();
    const englishPortfolioIds = getMessages("en").portfolioItems.map(
      (entry) => entry.id
    );
    const englishGuideKeys = Object.keys(getMessages("en").guide).sort();
    const englishMiniMapKeys = Object.keys(getMessages("en").miniMap).sort();
    const englishWorldMapKeys = Object.keys(getMessages("en").worldMap).sort();
    const englishDestinationKeys = Object.keys(
      getMessages("en").guide.destinations
    ).sort();

    for (const dictionary of dictionaries) {
      expect(Object.keys(dictionary).sort()).toEqual(englishKeys);
      expect(dictionary.portfolioItems.map((entry) => entry.id)).toEqual(
        englishPortfolioIds
      );
      expect(Object.keys(dictionary.guide).sort()).toEqual(englishGuideKeys);
      expect(Object.keys(dictionary.guide.destinations).sort()).toEqual(
        englishDestinationKeys
      );
      expect(Object.keys(dictionary.miniMap).sort()).toEqual(
        englishMiniMapKeys
      );
      expect(Object.keys(dictionary.worldMap).sort()).toEqual(
        englishWorldMapKeys
      );
      expect(Object.keys(dictionary.worldMap.destinations).sort()).toEqual(
        englishDestinationKeys
      );
      for (const group of [dictionary.miniMap, dictionary.worldMap]) {
        for (const value of Object.values(group)) {
          if (typeof value === "string") {
            expect(value.trim()).not.toBe("");
          }
        }
        for (const value of Object.values(group.destinations)) {
          expect(value.trim()).not.toBe("");
        }
      }
      for (const value of Object.values(dictionary)) {
        if (typeof value === "string") {
          expect(value.trim()).not.toBe("");
        }
      }
      for (const entry of dictionary.portfolioItems) {
        expect(entry.title.trim()).not.toBe("");
        expect(entry.kicker.trim()).not.toBe("");
        expect(entry.summary.trim()).not.toBe("");
      }
      for (const group of [
        dictionary.guide.destinations,
        dictionary.guide.directions,
        dictionary.guide.themes,
        dictionary.guide.conditions
      ]) {
        for (const value of Object.values(group)) {
          expect(value.trim()).not.toBe("");
        }
      }
    }
  });

  it("provides localized mini-map controls and concise destination labels", () => {
    expect(getMessages("ko").miniMap).toEqual({
      label: "월드 미니맵",
      expand: "미니맵 펼치기",
      collapse: "미니맵 접기",
      currentPosition: "현재 위치",
      mainRoute: "주 경로",
      north: "북쪽",
      destinations: {
        airport: "공항",
        tokyo: "도쿄",
        gyukatsu: "규카츠",
        sakura: "벚꽃",
        hanabi: "하나비"
      }
    });
    expect(getMessages("ja").miniMap).toEqual({
      label: "ワールドミニマップ",
      expand: "ミニマップを開く",
      collapse: "ミニマップを閉じる",
      currentPosition: "現在地",
      mainRoute: "メインルート",
      north: "北",
      destinations: {
        airport: "空港",
        tokyo: "東京",
        gyukatsu: "牛カツ",
        sakura: "桜",
        hanabi: "花火"
      }
    });
    expect(getMessages("en").miniMap).toEqual({
      label: "World mini-map",
      expand: "Expand mini-map",
      collapse: "Collapse mini-map",
      currentPosition: "Current position",
      mainRoute: "Main route",
      north: "North",
      destinations: {
        airport: "Airport",
        tokyo: "Tokyo",
        gyukatsu: "Gyukatsu",
        sakura: "Sakura",
        hanabi: "Hanabi"
      }
    });
  });

  it("localizes the full world map, its shortcut, and its legend", () => {
    expect(getMessages("en").worldMap).toEqual({
      title: "World map",
      open: "Open world map (M key)",
      close: "Close world map",
      hint: "Choose a place to travel straight there. Press M to open or close, Esc to close.",
      travelTo: "Travel to",
      currentPosition: "Current position",
      mainRoute: "Main route",
      north: "North is up",
      legendLabel: "Map legend",
      legendZone: "Place",
      legendRoute: "Road",
      legendPlayer: "You and the way you face",
      scale: "Scale",
      destinations: {
        airport: "Airport",
        tokyo: "Tokyo",
        gyukatsu: "Gyukatsu",
        sakura: "Sakura",
        hanabi: "Hanabi"
      }
    });
    expect(getMessages("ko").worldMap.title).toBe("월드 지도");
    expect(getMessages("ko").worldMap.open).toContain("M");
    expect(getMessages("ja").worldMap.title).toBe("ワールドマップ");
    expect(getMessages("ja").worldMap.open).toContain("M");
  });
});
