import "./settings-screen.css";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AccountSection } from "@/features/auth/account-section";
import { useUpdateState } from "@/features/pwa/update-state";
import { useOnlineStatus } from "@/features/pwa/use-online-status";

type CheckState = "idle" | "checking" | "found" | "latest" | "failed";

function AppUpdate() {
  const { ready, apply, check } = useUpdateState();
  const online = useOnlineStatus();
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const showReady = ready || checkState === "found";
  const checking = checkState === "checking";
  const updateButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (checkState === "found") updateButton.current?.focus();
  }, [checkState]);

  const checkNow = (run: () => Promise<boolean>) => {
    if (checking) return;
    setCheckState("checking");
    run().then(
      (found) => setCheckState(found ? "found" : "latest"),
      (error: unknown) => {
        console.error("Update check failed", error);
        setCheckState("failed");
      },
    );
  };

  let message = "";
  if (showReady) message = "A new version is ready.";
  else if (checking) message = "Checking for updates…";
  else if (check && !online) message = "Connect to the internet to check for updates.";
  else if (checkState === "failed") message = "Couldn't check for updates. Try again.";
  else if (checkState === "latest") message = "You're on the latest version.";

  return (
    <div className="settings-screen__update">
      <p id="update-status" role="status">
        {message}
      </p>
      {showReady ? (
        <Button ref={updateButton} className="settings-screen__update-button" onClick={apply}>
          Update
        </Button>
      ) : (
        check && (
          // aria-disabled, not disabled, while checking: a disabled button drops focus to the page (WCAG 2.4.3).
          <Button
            variant="outline"
            className="settings-screen__update-button"
            aria-describedby="update-status"
            aria-disabled={checking || undefined}
            disabled={!online}
            onClick={() => checkNow(check)}
          >
            Check for updates
          </Button>
        )
      )}
    </div>
  );
}

/** UX_FLOWS Flow 9. */
export function SettingsScreen() {
  return (
    <div className="settings-screen">
      <AccountSection />
      <section className="settings-screen__section" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        {/* Dark mode is a NEXT item (ROADMAP); until then the app follows the system. */}
        <p>Theme: Follows your system</p>
      </section>
      <section className="settings-screen__section" aria-labelledby="about-heading">
        <h2 id="about-heading">About</h2>
        <p>Version {__APP_VERSION__}</p>
        <AppUpdate />
        {/* Plain text, not a link: an outside link would take an installed iOS app out of itself. */}
        <p className="settings-screen__note">
          Paint colors are approximate on-screen values. Most hex values come from PaintPad
          (paintpad.app); the rest come from manufacturer pages.
        </p>
        <p className="settings-screen__note">
          Paint and brand names are trademarks of their owners. Grimify isn't affiliated with any
          paint manufacturer.
        </p>
      </section>
    </div>
  );
}
