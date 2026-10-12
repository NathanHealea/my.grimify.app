import "./app-shell.css";

import { Link, useCanGoBack, useMatches, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Library, Palette, Settings, SwatchBook } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { useCollection } from "@/features/collection/collection-provider";
import { InstallBanner } from "@/features/pwa/install-banner";
import { useOnlineStatus } from "@/features/pwa/use-online-status";

import { PageTitle, PageTitleProvider, usePageTitle } from "./page-title";

type Props = {
  children: ReactNode;
};

const TABS = [
  { to: "/paints", label: "Paints", Icon: Palette },
  { to: "/my-paints", label: "My Paints", Icon: Library },
  { to: "/palettes", label: "Palettes", Icon: SwatchBook },
  { to: "/settings", label: "Settings", Icon: Settings },
] as const;

export function AppShell({ children }: Props) {
  return (
    <PageTitleProvider>
      <Shell>{children}</Shell>
    </PageTitleProvider>
  );
}

function Shell({ children }: Props) {
  const title = useMatches({
    select: (matches) => matches.findLast((match) => match.staticData.title)?.staticData.title,
  });
  const online = useOnlineStatus();
  const { pending } = useCollection();
  const back = useMatches({
    select: (matches) => matches.findLast((match) => match.staticData.back)?.staticData.back,
  });
  const pageTitle = usePageTitle();
  const bar = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // The small title appears once the large one has slid under the header, or the bar from 640px (DECISIONS 040, 046).
  useEffect(() => {
    const element = pageTitle?.element;
    if (!element) return;
    // From 640px the bar is taller than the header; on phones it has no box, so its height is 0.
    const cover = Math.max(bar.current?.offsetHeight ?? 0, header.current?.offsetHeight ?? 0);
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      rootMargin: `-${cover}px 0px 0px 0px`,
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      setScrolled(false);
    };
  }, [pageTitle?.element]);

  return (
    <div className="app-shell">
      <div ref={bar} className="app-shell__bar" data-scrolled={scrolled}>
        <div className="app-shell__bar-row">
          <nav className="app-shell__tabs" aria-label="Main">
            <ul className="app-shell__tab-list">
              {TABS.map(({ to, label, Icon }) => (
                <li key={to} className="app-shell__tab-item">
                  <Link to={to} className="app-shell__tab">
                    <Icon className="app-shell__tab-icon" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <header ref={header} className="app-shell__header" data-scrolled={scrolled}>
            <div className="app-shell__header-start">
              {back && <BackButton to={back.to} label={back.label} />}
            </div>
            {/* Visual only: screen readers get the page's h1 (PageTitle). */}
            <p className="app-shell__title" aria-hidden="true">
              {pageTitle?.text}
            </p>
            <div className="app-shell__header-end">
              <p className="app-shell__offline" role="status">
                {!online && "Offline"}
              </p>
              <p className="app-shell__pending" role="status">
                {pending > 0 &&
                  `${pending} ${pending === 1 ? "change" : "changes"} waiting to sync`}
              </p>
            </div>
          </header>
        </div>
        {/* From 640px: a strip under the row; the bar's one glass layer grows to cover it. */}
        <p className="app-shell__title-row" aria-hidden="true" data-scrolled={scrolled}>
          {pageTitle?.text}
        </p>
      </div>
      <main className="app-shell__main">
        {title && <PageTitle>{title}</PageTitle>}
        <InstallBanner />
        {children}
      </main>
    </div>
  );
}

/** Goes back when the previous entry is in the app (keeping its search), otherwise opens `to`. */
function BackButton({ to, label }: { to: "/paints" | "/palettes"; label: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <Link
      to={to}
      className="app-shell__back"
      aria-label={`Back to ${label}`}
      onClick={(event) => {
        if (!canGoBack) return;
        event.preventDefault();
        router.history.back();
      }}
    >
      <ChevronLeft className="app-shell__back-icon" aria-hidden="true" />
      {label}
    </Link>
  );
}
