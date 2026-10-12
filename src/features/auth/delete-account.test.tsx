import { useClerk, useUser } from "@clerk/react";
import { useNavigate } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMutation } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CollectionState,
  useClearDevice,
  useCollection,
  useEndSession,
} from "@/features/collection/collection-provider";
import { ToastProvider } from "@/features/feedback/toast-provider";

import { DeleteAccount } from "./delete-account";

vi.mock("@/features/collection/collection-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/collection/collection-provider")>();
  return {
    ...actual,
    useCollection: vi.fn(),
    useEndSession: vi.fn(),
    useClearDevice: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: vi.fn() };
});

const navigate = vi.fn();
const clearDevice = vi.fn();
const deleteAccount = vi.fn<(args: object) => Promise<null>>();
const userDelete = vi.fn<() => Promise<void>>();

beforeEach(() => {
  vi.mocked(useNavigate).mockReturnValue(navigate);
  vi.mocked(useClearDevice).mockReturnValue(clearDevice);
  vi.mocked(useEndSession).mockReturnValue((action) => action());
  vi.mocked(useMutation).mockImplementation(((fn: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(fn) !== "users:deleteAccount") {
      throw new Error(`Unexpected mutation ${getFunctionName(fn)}`);
    }
    return deleteAccount;
  }) as unknown as typeof useMutation);
  deleteAccount.mockResolvedValue(null);
  userDelete.mockResolvedValue();
  withPending(0);
  signedIn({ deleteSelfEnabled: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(useUser).mockReset();
  vi.mocked(useMutation).mockReset();
  navigate.mockReset();
  clearDevice.mockReset();
  deleteAccount.mockReset();
  userDelete.mockReset();
});

function withPending(pending: number) {
  vi.mocked(useCollection).mockReturnValue({
    loading: false,
    flags: new Map(),
    owned: new Set(),
    wishlisted: new Set(),
    favorites: new Set(),
    pending,
  } satisfies CollectionState);
}

function signedIn({ deleteSelfEnabled }: { deleteSelfEnabled: boolean }) {
  vi.mocked(useUser).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: "user_a",
      primaryEmailAddress: { emailAddress: "painter@example.com" },
      deleteSelfEnabled,
      delete: userDelete,
    },
  } as unknown as ReturnType<typeof useUser>);
}

function renderDeleteAccount() {
  return render(
    <ToastProvider>
      <DeleteAccount />
    </ToastProvider>,
  );
}

function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  return screen.getByRole("dialog", { name: "Delete your account?" });
}

function typeConfirmation(dialog: HTMLElement, text: string) {
  fireEvent.change(within(dialog).getByLabelText("Type DELETE to confirm"), {
    target: { value: text },
  });
}

describe("DeleteAccount", () => {
  it("deletes the account after typing DELETE", async () => {
    withPending(3);
    renderDeleteAccount();

    let dialog = openSheet();
    expect(dialog).toHaveTextContent(
      "This permanently deletes your Grimify account, your saved paints and your palettes. It can't be undone.",
    );
    expect(dialog).toHaveTextContent("3 changes that haven't synced will be lost too.");
    const confirm = () => within(dialog).getByRole("button", { name: "Delete account" });
    expect(confirm()).toBeDisabled();
    typeConfirmation(dialog, "delete");
    expect(confirm()).toBeDisabled();
    typeConfirmation(dialog, "DELETE ");
    expect(confirm()).toBeDisabled();
    typeConfirmation(dialog, "DELETE");
    expect(confirm()).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
    // Radix restores focus after the close finishes, on a timer.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete account" })).toHaveFocus(),
    );

    dialog = openSheet();
    typeConfirmation(dialog, "DELETE");
    fireEvent.click(confirm());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/paints" }));
    expect(deleteAccount).toHaveBeenCalledOnce();
    expect(clearDevice).toHaveBeenCalledOnce();
    expect(userDelete).toHaveBeenCalledOnce();
    expect(deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      clearDevice.mock.invocationCallOrder[0],
    );
    expect(clearDevice.mock.invocationCallOrder[0]).toBeLessThan(
      userDelete.mock.invocationCallOrder[0],
    );
    expect(await screen.findByText("Account deleted")).toBeInTheDocument();
  });

  it("reports a failed deletion", async () => {
    deleteAccount.mockRejectedValueOnce(new Error("network down"));
    renderDeleteAccount();

    const dialog = openSheet();
    typeConfirmation(dialog, "DELETE");
    const confirm = () => within(dialog).getByRole("button", { name: "Delete account" });
    fireEvent.click(confirm());

    // The alert region is always rendered, so wait for its text rather than for the element.
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Couldn't delete your account. Check your connection and try again.",
      ),
    );
    expect(screen.getByRole("dialog", { name: "Delete your account?" })).toBeInTheDocument();
    expect(userDelete).not.toHaveBeenCalled();
    expect(clearDevice).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    userDelete.mockRejectedValueOnce(new Error("clerk unavailable"));
    fireEvent.click(confirm());

    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Couldn't finish deleting your account. Try again.",
      ),
    );
    expect(clearDevice).toHaveBeenCalledOnce();
    expect(userDelete).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(confirm());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/paints" }));
    expect(userDelete).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Account deleted")).toBeInTheDocument();
  });

  it("explains when deletion is unavailable", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { unmount } = renderDeleteAccount();

    expect(screen.getByRole("button", { name: "Delete account" })).toBeDisabled();
    expect(
      screen.getByText("Deleting your account needs an internet connection."),
    ).toBeInTheDocument();
    unmount();
    vi.restoreAllMocks();

    signedIn({ deleteSelfEnabled: false });
    renderDeleteAccount();

    expect(screen.getByRole("button", { name: "Delete account" })).toBeDisabled();
    expect(screen.getByText("Account deletion isn't available right now.")).toBeInTheDocument();
  });

  it("ends the Clerk session after deleting", async () => {
    const signOut = vi.fn(() => Promise.resolve());
    vi.mocked(useClerk).mockReturnValue({ signOut } as unknown as ReturnType<typeof useClerk>);
    renderDeleteAccount();
    const dialog = openSheet();
    typeConfirmation(dialog, "DELETE");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/paints" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(userDelete.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it("can't be closed while deleting, and shows a late failure", async () => {
    let fail: (error: Error) => void = () => {};
    userDelete.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderDeleteAccount();
    const dialog = openSheet();
    typeConfirmation(dialog, "DELETE");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(userDelete).toHaveBeenCalled());

    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Delete your account?" })).toBeInTheDocument();

    // In a browser the clicked confirm button disables and focus drops to the page body.
    (document.activeElement as HTMLElement | null)?.blur();
    fail(new Error("network down"));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Couldn't finish deleting your account. Try again.",
      ),
    );
    // Focus goes back into the sheet so a keyboard user can retry from where they were.
    expect(within(dialog).getByLabelText("Type DELETE to confirm")).toHaveFocus();
  });

  it("ties the disabled reason to the button", () => {
    signedIn({ deleteSelfEnabled: false });
    renderDeleteAccount();

    expect(screen.getByRole("button", { name: "Delete account" })).toHaveAccessibleDescription(
      "Account deletion isn't available right now.",
    );
  });

  it("disables the confirm button while deleting", async () => {
    userDelete.mockImplementation(() => new Promise<void>(() => {}));
    renderDeleteAccount();
    const dialog = openSheet();
    typeConfirmation(dialog, "DELETE");
    const confirm = within(dialog).getByRole("button", { name: "Delete account" });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(userDelete).toHaveBeenCalled());

    expect(within(dialog).getByRole("button", { name: "Delete account" })).toBeDisabled();
  });

  it("starts empty again after Cancel", () => {
    renderDeleteAccount();
    let dialog = openSheet();
    typeConfirmation(dialog, "DELETE");
    expect(within(dialog).getByRole("button", { name: "Delete account" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    dialog = openSheet();

    expect(within(dialog).getByLabelText("Type DELETE to confirm")).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: "Delete account" })).toBeDisabled();
  });

  it("finishes when signing out after deletion fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const signOut = vi.fn(() => Promise.reject(new Error("session already gone")));
    vi.mocked(useClerk).mockReturnValue({ signOut } as unknown as ReturnType<typeof useClerk>);
    renderDeleteAccount();
    const dialog = openSheet();
    typeConfirmation(dialog, "DELETE");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/paints" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(await screen.findByText("Account deleted")).toBeInTheDocument();
  });

  it("warns about a single unsynced change", () => {
    withPending(1);
    renderDeleteAccount();

    expect(openSheet()).toHaveTextContent("1 change that hasn't synced will be lost too.");
  });
});
