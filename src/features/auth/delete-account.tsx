import "./delete-account.css";

import { useClerk, useUser } from "@clerk/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useClearDevice,
  useCollection,
  useEndSession,
} from "@/features/collection/collection-provider";
import { useToast } from "@/features/feedback/toast-provider";
import { useOnlineStatus } from "@/features/pwa/use-online-status";

import { api } from "../../../convex/_generated/api";

const CONFIRM_WORD = "DELETE";

/** UX_FLOWS Flow 9: Convex data first, then the Clerk account, from the browser (DECISIONS 037). */
export function DeleteAccount() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const endSession = useEndSession();
  const clearDevice = useClearDevice();
  const { pending } = useCollection();
  const online = useOnlineStatus();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const unavailable = !online
    ? "Deleting your account needs an internet connection."
    : !user.deleteSelfEnabled
      ? "Account deletion isn't available right now."
      : null;

  const confirm = () => {
    let serverDeleted = false;
    setDeleting(true);
    setError(null);
    endSession(async () => {
      await deleteAccount({});
      serverDeleted = true;
      // The server copy is gone, so the device copy goes too even if Clerk's step fails.
      clearDevice();
      await user.delete();
      // Clerk is expected to end the session when the user is deleted; unverified (plan risk 5), so
      // sign out too. The account is already gone, so a failure here only gets logged.
      await signOut().catch((cause: unknown) => {
        console.error("Signing out after deleting the account failed", cause);
      });
    })
      .then(() => {
        setOpen(false);
        void navigate({ to: "/paints" });
        toast("Account deleted");
      })
      .catch((cause: unknown) => {
        console.error("Deleting the account failed", cause);
        setError(
          serverDeleted
            ? "Couldn't finish deleting your account. Try again."
            : "Couldn't delete your account. Check your connection and try again.",
        );
        // The disabled confirm button may have dropped focus; put it back where a retry starts.
        field.current?.focus();
      })
      .finally(() => setDeleting(false));
  };

  return (
    <div className="delete-account">
      <Button
        ref={trigger}
        variant="destructive"
        disabled={unavailable !== null}
        aria-describedby={unavailable ? "delete-account-unavailable" : undefined}
        onClick={() => setOpen(true)}
      >
        Delete account
      </Button>
      {unavailable && (
        <p id="delete-account-unavailable" className="delete-account__note">
          {unavailable}
        </p>
      )}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          // Closing mid-deletion would hide a failure that arrives afterwards.
          if (deleting) return;
          setOpen(next);
          if (!next) {
            setTyped("");
            setError(null);
          }
        }}
      >
        <SheetContent
          // Radix only refocuses a SheetTrigger; this sheet opens from state, so focus is put back by hand.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>Delete your account?</SheetTitle>
          </SheetHeader>
          <SheetBody className="delete-account__body">
            <SheetDescription>
              This permanently deletes your Grimify account, your saved paints and your palettes. It
              can't be undone.
              {pending > 0 &&
                ` ${pending} ${pending === 1 ? "change that hasn't" : "changes that haven't"} synced will be lost too.`}
            </SheetDescription>
            <label className="delete-account__label" htmlFor="delete-account-confirm">
              Type {CONFIRM_WORD} to confirm
            </label>
            <Input
              ref={field}
              id="delete-account-confirm"
              autoComplete="off"
              autoCapitalize="characters"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            <p className="delete-account__error" role="alert">
              {error}
            </p>
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline" disabled={deleting}>
                Cancel
              </Button>
            </SheetClose>
            <Button
              variant="destructive"
              disabled={typed !== CONFIRM_WORD || deleting}
              onClick={confirm}
            >
              Delete account
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
