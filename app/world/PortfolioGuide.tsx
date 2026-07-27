"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PortfolioEntry {
  id: string;
  title: string;
  kicker: string;
  summary: string;
}

export interface PortfolioRequestedDialogue {
  contextLabel: string;
  speaker: string;
  message: string;
}

interface PortfolioLabels {
  portfolioLabel: string;
  openPortfolio: string;
  closePortfolioMenu: string;
  closePortfolio: string;
  portfolioItems: readonly PortfolioEntry[];
}

export interface PortfolioGuideProps {
  labels: PortfolioLabels;
  requestedEntryId: string | null;
  requestedDialogue: PortfolioRequestedDialogue | null;
  onOpenChange: (open: boolean) => void;
  onRequestHandled: () => void;
}

export function PortfolioGuide({
  labels,
  requestedEntryId,
  requestedDialogue,
  onOpenChange,
  onRequestHandled
}: PortfolioGuideProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDialogue, setActiveDialogue] =
    useState<PortfolioRequestedDialogue | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const activeTrigger = useRef<HTMLElement>(null);
  const shouldRestoreFocus = useRef(false);
  const open = useRef(false);
  const acknowledgedRequestId = useRef<string | null>(null);
  const [handledRequestId, setHandledRequestId] = useState<string | null>(
    null
  );
  const requestedEntry = labels.portfolioItems.find(
    (entry) => entry.id === requestedEntryId
  );
  if (requestedEntryId === null && handledRequestId !== null) {
    setHandledRequestId(null);
  } else if (
    requestedEntry &&
    handledRequestId !== requestedEntry.id
  ) {
    setHandledRequestId(requestedEntry.id);
    setMenuOpen(false);
    setActiveDialogue(requestedDialogue);
    setActiveId(requestedEntry.id);
  }
  const activeEntry = labels.portfolioItems.find(
    (entry) => entry.id === activeId
  );
  const closePortfolio = useCallback(() => {
    if (!open.current) return;
    open.current = false;
    shouldRestoreFocus.current = true;
    setActiveId(null);
    setActiveDialogue(null);
    setMenuOpen(true);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (requestedEntryId === null) {
      acknowledgedRequestId.current = null;
      return;
    }
    if (
      handledRequestId !== requestedEntryId ||
      acknowledgedRequestId.current === requestedEntryId
    ) {
      return;
    }
    acknowledgedRequestId.current = requestedEntryId;
    activeTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!open.current) {
      open.current = true;
      onOpenChange(true);
    }
    onRequestHandled();
  }, [
    handledRequestId,
    onOpenChange,
    onRequestHandled,
    requestedEntryId
  ]);

  useEffect(() => {
    if (activeEntry) {
      closeButton.current?.focus();
    } else if (menuOpen && shouldRestoreFocus.current) {
      shouldRestoreFocus.current = false;
      activeTrigger.current?.focus();
    }
  }, [activeEntry, menuOpen]);

  useEffect(() => {
    if (!activeEntry) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePortfolio();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeEntry, closePortfolio]);

  // The world used to carry a "View work" toggle and a landmark menu beside
  // it. Both are gone: the way into a piece of work is to walk up to it and
  // talk, which is what the world is for. This still renders whatever that
  // conversation asks for.
  return (
    <div className="portfolio-guide">

      {activeEntry ? (
        <section
          className="portfolio-dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby="portfolio-dialog-title"
          data-world-input-block="true"
        >
          <button
            ref={closeButton}
            className="portfolio-close"
            type="button"
            aria-label={labels.closePortfolio}
            onClick={closePortfolio}
          >
            ×
          </button>
          {activeDialogue ? (
            <p className="portfolio-dialog-context">
              {activeDialogue.contextLabel}
            </p>
          ) : null}
          <p className="start-eyebrow">
            {activeDialogue ? activeEntry.title : activeEntry.kicker}
          </p>
          <h2 id="portfolio-dialog-title">
            {activeDialogue ? activeDialogue.speaker : activeEntry.title}
          </h2>
          <p>
            {activeDialogue ? activeDialogue.message : activeEntry.summary}
          </p>
        </section>
      ) : null}
    </div>
  );
}
