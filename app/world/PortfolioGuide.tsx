"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PortfolioEntry {
  id: string;
  title: string;
  kicker: string;
  summary: string;
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
  onOpenChange: (open: boolean) => void;
  onRequestHandled: () => void;
}

export function PortfolioGuide({
  labels,
  requestedEntryId,
  onOpenChange,
  onRequestHandled
}: PortfolioGuideProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
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
    setMenuOpen(true);
    onOpenChange(false);
  }, [onOpenChange]);

  const openPortfolio = useCallback(
    (entryId: string, trigger: HTMLElement | null) => {
      activeTrigger.current = trigger;
      setMenuOpen(false);
      setActiveId(entryId);
      if (!open.current) {
        open.current = true;
        onOpenChange(true);
      }
    },
    [onOpenChange]
  );

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

  return (
    <div className="portfolio-guide">
      <button
        className="portfolio-menu-toggle"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="portfolio-landmarks"
        aria-label={
          menuOpen ? labels.closePortfolioMenu : labels.openPortfolio
        }
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span aria-hidden="true">◇</span>
        {labels.openPortfolio}
      </button>
      <nav
        id="portfolio-landmarks"
        className="portfolio-landmarks"
        aria-label={labels.portfolioLabel}
        data-menu-open={menuOpen}
      >
        {labels.portfolioItems.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === activeId}
            onClick={(event) => {
              openPortfolio(entry.id, event.currentTarget);
            }}
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {entry.title}
          </button>
        ))}
      </nav>

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
          <p className="start-eyebrow">{activeEntry.kicker}</p>
          <h2 id="portfolio-dialog-title">{activeEntry.title}</h2>
          <p>{activeEntry.summary}</p>
        </section>
      ) : null}
    </div>
  );
}
