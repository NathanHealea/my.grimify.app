import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionProvider } from "@/features/collection/collection-provider";
import { ToastProvider } from "@/features/feedback/toast-provider";
import { type UpdateState, UpdateStateContext } from "@/features/pwa/update-state";

import packageJson from "../../../package.json";
import { SettingsScreen } from "./settings-screen";

vi.mock("@/features/auth/sign-in-provider", () => ({ useSignIn: () => vi.fn() }));

const network = vi.hoisted(() => ({ online: true }));
vi.mock("@/features/pwa/use-online-status", () => ({ useOnlineStatus: () => network.online }));

beforeEach(() => {
  network.online = true;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderWithUpdates(update: UpdateState) {
  render(
    <UpdateStateContext.Provider value={update}>
      <SettingsScreen />
    </UpdateStateContext.Provider>,
    { wrapper: Providers },
  );
  return within(screen.getByRole("region", { name: "About" }));
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <CollectionProvider>{children}</CollectionProvider>
    </ToastProvider>
  );
}

describe("SettingsScreen", () => {
  it("shows account, appearance and about", () => {
    render(<SettingsScreen />, { wrapper: Providers });

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Account", "Appearance", "About"]);
    expect(screen.getByRole("region", { name: "Appearance" })).toHaveTextContent(
      "Theme: Follows your system",
    );
    const about = screen.getByRole("region", { name: "About" });
    expect(about).toHaveTextContent(`Version ${__APP_VERSION__}`);
    expect(about).toHaveTextContent(
      "Paint colors are approximate on-screen values. Most hex values come from PaintPad (paintpad.app); the rest come from manufacturer pages.",
    );
    expect(about).toHaveTextContent(
      "Paint and brand names are trademarks of their owners. Grimify isn't affiliated with any paint manufacturer.",
    );
  });

  it("reports the package.json version", () => {
    expect(__APP_VERSION__).toBe(packageJson.version);
  });

  it("about shows the version and an update button when one is ready", () => {
    const apply = vi.fn();
    const about = renderWithUpdates({
      ready: true,
      apply,
      check: vi.fn(() => Promise.resolve(false)),
    });

    expect(screen.getByRole("region", { name: "About" })).toHaveTextContent(
      `Version ${__APP_VERSION__}`,
    );
    expect(about.getByRole("status")).toHaveTextContent("A new version is ready.");
    expect(about.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();

    fireEvent.click(about.getByRole("button", { name: "Update" }));

    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("check for updates reports a found update or the latest version", async () => {
    const found = deferred<boolean>();
    const latest = deferred<boolean>();
    const check = vi.fn().mockReturnValueOnce(found.promise).mockReturnValueOnce(latest.promise);
    const about = renderWithUpdates({ ready: false, apply: vi.fn(), check });

    fireEvent.click(about.getByRole("button", { name: "Check for updates" }));

    expect(await about.findByText("Checking for updates…")).toBeInTheDocument();
    expect(about.getByRole("button", { name: "Check for updates" })).toBeDisabled();

    found.resolve(true);

    expect(await about.findByRole("button", { name: "Update" })).toBeEnabled();
    expect(about.getByRole("status")).toHaveTextContent("A new version is ready.");
    cleanup();

    const again = renderWithUpdates({ ready: false, apply: vi.fn(), check });
    fireEvent.click(again.getByRole("button", { name: "Check for updates" }));
    expect(await again.findByText("Checking for updates…")).toBeInTheDocument();

    latest.resolve(false);

    expect(await again.findByText("You're on the latest version.")).toBeInTheDocument();
    expect(again.getByRole("button", { name: "Check for updates" })).toBeEnabled();
    expect(again.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
  });

  it("check for updates is disabled offline", () => {
    network.online = false;
    const check = vi.fn(() => Promise.resolve(false));
    const about = renderWithUpdates({ ready: false, apply: vi.fn(), check });

    expect(about.getByRole("button", { name: "Check for updates" })).toBeDisabled();
    expect(about.getByRole("status")).toHaveTextContent(
      "Connect to the internet to check for updates.",
    );
    cleanup();

    const apply = vi.fn();
    const ready = renderWithUpdates({ ready: true, apply, check });
    const update = ready.getByRole("button", { name: "Update" });
    expect(update).toBeEnabled();
    fireEvent.click(update);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("a failed check shows an error and re-enables the button", async () => {
    const failing = deferred<boolean>();
    const about = renderWithUpdates({
      ready: false,
      apply: vi.fn(),
      check: vi.fn(() => failing.promise),
    });

    fireEvent.click(about.getByRole("button", { name: "Check for updates" }));
    expect(await about.findByText("Checking for updates…")).toBeInTheDocument();

    failing.reject(new Error("network down"));

    expect(await about.findByText("Couldn't check for updates. Try again.")).toBeInTheDocument();
    expect(about.getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("update status is announced", async () => {
    const pending = deferred<boolean>();
    const about = renderWithUpdates({
      ready: false,
      apply: vi.fn(),
      check: vi.fn(() => pending.promise),
    });
    const status = about.getByRole("status");

    fireEvent.click(about.getByRole("button", { name: "Check for updates" }));

    await waitFor(() => expect(status).toHaveTextContent("Checking for updates…"));
    pending.resolve(false);
    await waitFor(() => expect(status).toHaveTextContent("You're on the latest version."));
    expect(about.getByRole("status")).toBe(status);
  });
});
