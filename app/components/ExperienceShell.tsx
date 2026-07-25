"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react";

/** Hydration never changes after it happens, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {};
import { getLocaleMetadata } from "../i18n/localeMetadata";
import { getMessages, locales, type Locale } from "../i18n/messages";
import {
  getPlayerCharacterAsset,
  type PlayerCharacterId
} from "../world/CharacterAssets";
import { WorldView } from "../world/WorldView";

type Character = PlayerCharacterId;
const CHARACTER_STORAGE_KEY = "ewan-world-character";
const LOCALE_STORAGE_KEY = "ewan-world-locale";
const localeLabels: Record<Locale, string> = {
  ko: "한국어",
  ja: "日本語",
  en: "EN"
};

function CharacterFigure({ character }: { character: Character }) {
  return (
    <Image
      className={`character-figure character-figure-${character}`}
      src={getPlayerCharacterAsset(character)}
      alt={`${character === "male" ? "Male" : "Female"} player character`}
      width={1024}
      height={1536}
      draggable={false}
      loading="eager"
      unoptimized
    />
  );
}

export function ExperienceShell({ locale }: { locale: Locale }) {
  const shell = useRef<HTMLElement>(null);
  // The start screen paints from server markup, so START is on screen before
  // React has attached its click handler. An enabled button in that window
  // takes the click and does nothing, which reads as a broken page. Rendering
  // it disabled until the first client effect runs makes the wait visible
  // instead of silent, and a click that lands after hydration still works.
  // False while the server-rendered markup is on screen, true once the client
  // has taken over. Reading it this way rather than setting state in an effect
  // gives the same answer without a second render pass.
  const ready = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
  const [activeLocale, setActiveLocale] = useState(locale);
  const copy = getMessages(activeLocale);
  const [phase, setPhase] = useState<"start" | "select" | "world">("start");
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
    () => {
      if (typeof window === "undefined") {
        return null;
      }
      const savedCharacter = window.localStorage.getItem(
        CHARACTER_STORAGE_KEY
      );
      return savedCharacter === "male" || savedCharacter === "female"
        ? savedCharacter
        : null;
    }
  );

  useEffect(() => {
    const metadata = getLocaleMetadata(activeLocale);
    document.documentElement.lang = activeLocale;
    document.title = metadata.title;
    const description = document.head.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    if (description) {
      description.content = metadata.description;
    }
    document.cookie = `${LOCALE_STORAGE_KEY}=${activeLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [activeLocale]);

  useEffect(() => {
    const activeShell = shell.current;
    if (!activeShell) return;
    activeShell.scrollTop = 0;
    activeShell.scrollLeft = 0;
    window.scrollTo(0, 0);
  }, [phase]);

  const chooseCharacter = (character: Character) => {
    setSelectedCharacter(character);
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, character);
  };

  const switchLocale = (nextLocale: Locale) => {
    setActiveLocale(nextLocale);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    window.history.replaceState(window.history.state, "", `/${nextLocale}`);
  };

  return (
    <main
      ref={shell}
      className="start-screen"
      data-locale={activeLocale}
      data-phase={phase}
      data-ready={String(ready)}
    >
      {phase !== "world" ? (
        <Image
          className="start-environment"
          data-testid="approved-start-environment"
          src="/assets/world/world-environment-concept.png"
          alt=""
          fill
          sizes="100vw"
          priority
          unoptimized
        />
      ) : null}
      <nav className="locale-switcher" aria-label={copy.languageLabel}>
        {locales.map((availableLocale) => (
          <button
            key={availableLocale}
            type="button"
            aria-pressed={activeLocale === availableLocale}
            onClick={() => switchLocale(availableLocale)}
          >
            {localeLabels[availableLocale]}
          </button>
        ))}
      </nav>
      {phase === "world" && selectedCharacter ? (
        <WorldView
          character={selectedCharacter}
          locale={activeLocale}
          labels={copy}
        />
      ) : phase === "start" ? (
        <section className="start-card" aria-labelledby="welcome-title">
          <p className="start-eyebrow">{copy.brand}</p>
          <h1 id="welcome-title">{copy.welcome}</h1>
          <p className="start-intro">{copy.intro}</p>
          <button
            className="primary-action"
            type="button"
            data-ready={String(ready)}
            aria-busy={ready ? undefined : true}
            disabled={!ready}
            onClick={() => setPhase("select")}
          >
            {copy.start}
          </button>
          <p className="start-controls">
            {copy.controls}
          </p>
        </section>
      ) : (
        <section
          className="start-card character-select-card"
          aria-labelledby="character-title"
        >
          <p className="start-eyebrow">{copy.brand}</p>
          <h1 id="character-title">{copy.chooseTitle}</h1>
          <p className="start-intro">{copy.chooseIntro}</p>

          <div
            className="character-grid"
            data-card-width="320"
            data-card-height="525"
            data-card-gap="46"
          >
            {(["male", "female"] as const).map((character) => {
              const selected = selectedCharacter === character;
              const label = character === "male" ? copy.male : copy.female;
              const accessibleLabel =
                character === "male" ? copy.selectMale : copy.selectFemale;

              return (
                <button
                  key={character}
                  className="character-option"
                  type="button"
                  aria-label={accessibleLabel}
                  aria-pressed={selected}
                  onClick={() => chooseCharacter(character)}
                >
                  <CharacterFigure character={character} />
                  <span className="character-name">{label}</span>
                  <span className="character-state">
                    {selected ? copy.selected : copy.select}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            className="primary-action"
            type="button"
            disabled={!selectedCharacter}
            onClick={() => selectedCharacter && setPhase("world")}
          >
            {copy.enterWorld}
          </button>
        </section>
      )}
    </main>
  );
}
