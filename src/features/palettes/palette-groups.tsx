import "./palette-groups.css";

import { useDndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Ellipsis } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { PaintSwatch } from "@/components/paint-swatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Catalog } from "@/features/catalog/schema";
import { useToast } from "@/features/feedback/toast-provider";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { DragData } from "./drop-plan";
import { GroupPaintActionsSheet } from "./group-paint-actions-sheet";
import { DragHandle, MoveButton, sortableIdOf, SortableItem } from "./palette-arrange";
import { OFFLINE_EDIT_NOTE, PaletteNameSheet } from "./palette-name-sheet";

type Group = Doc<"palettes">["groups"][number];

// Matches the server's cap in convex/palettes.ts.
const MAX_NAME_LENGTH = 60;

type OpenSheet = { kind: "actions" | "delete"; groupId: string } | { kind: "new" } | null;

/** The palette's groups, each a section of paints, with New group, inline rename and delete. */
export function PaletteGroups({
  paletteId,
  groups,
  catalog,
  online,
  arranging,
}: {
  paletteId: Id<"palettes">;
  groups: Group[];
  catalog: Catalog;
  online: boolean;
  arranging: boolean;
}) {
  const createGroup = useMutation(api.palettes.createGroup);
  const removeGroup = useMutation(api.palettes.removeGroup);
  const toast = useToast();
  const baseId = useId();
  const paints = useMemo(() => new Map(catalog.paints.map((p) => [p.id, p])), [catalog]);
  const brands = useMemo(() => new Map(catalog.brands.map((b) => [b.id, b.name])), [catalog]);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lastSheetName, setLastSheetName] = useState("");
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const headings = useRef(new Map<string, HTMLHeadingElement>());
  const newGroupButton = useRef<HTMLButtonElement>(null);
  const renameField = useRef<HTMLInputElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  // Kept after closing so the sheet keeps its title while it animates out and focus knows where to return.
  const [rowSheet, setRowSheet] = useState({ groupId: "", paintId: "", name: "" });
  const [rowSheetOpen, setRowSheetOpen] = useState(false);
  // A moved or removed paint takes its focused row with it, so focus goes to a neighbour (WCAG 2.4.3).
  const leaving = useRef<{ groupId: string; paintId: string; next: string | undefined } | null>(
    null,
  );
  // These sheets open from state, so each close decides where focus goes; Radix only refocuses a trigger.
  const focusOnClose = useRef<() => HTMLElement | null>(() => null);
  const focusAfterRename = useRef<string | null>(null);
  // Convex holds a mutation until the connection returns, so offline a pending delete mustn't trap the user.
  const locked = deleting && online;

  const actionsFor = (groupId: string) => () => actionButtons.current.get(groupId) ?? null;
  // A ref whose target is worked out when the name sheet closes, by which time a new group has rendered.
  const newGroupReturn = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return focusOnClose.current() ?? newGroupButton.current;
      },
    }),
    [],
  );

  // Convex doesn't promise the new group renders before createGroup resolves, so focus it once it does.
  const createdGroup = useRef<string | null>(null);
  useEffect(() => {
    const groupId = createdGroup.current;
    if (groupId === null || sheet?.kind === "new") return;
    const heading = headings.current.get(groupId);
    if (!heading) return;
    createdGroup.current = null;
    heading.focus();
  }, [groups, sheet]);

  const rowKey = (groupId: string, paintId: string) => `${groupId}:${paintId}`;

  // The sheet calls focusAfterRow from its last render, which can be older than the palette, so read the latest.
  const latest = useRef({ groups, online });
  useEffect(() => {
    latest.current = { groups, online };
  }, [groups, online]);

  const focusAfterRow = () => {
    const { groups, online } = latest.current;
    const plan = leaving.current;
    if (plan === null) {
      rowButtons.current.get(rowKey(rowSheet.groupId, rowSheet.paintId))?.focus();
      return;
    }
    const group = groups.find((g) => g.id === plan.groupId);
    // Offline every row button is disabled and can't take focus, so wait for the connection.
    if (group?.paintIds.includes(plan.paintId) || !online) return;
    leaving.current = null;
    const next =
      plan.next === undefined ? undefined : rowButtons.current.get(rowKey(plan.groupId, plan.next));
    (next ?? actionButtons.current.get(plan.groupId) ?? newGroupButton.current)?.focus();
  };

  // The row may leave before or after the sheet finishes closing; until then the sheet's focus trap wins.
  const sheetClosed = useRef(true);
  useEffect(() => {
    if (!sheetClosed.current || leaving.current === null) return;
    // Only rescue focus that was lost; a user who has moved on since keeps their place.
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (lost) focusAfterRow();
    else leaving.current = null;
    // focusAfterRow reads `latest`, so it only needs to run again when the groups or the connection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, online]);

  const startLeaving = (isLeaving: boolean) => {
    if (!isLeaving) {
      leaving.current = null;
      return;
    }
    const group = groups.find((g) => g.id === rowSheet.groupId);
    const ids = group?.paintIds ?? [];
    const index = ids.indexOf(rowSheet.paintId);
    leaving.current = {
      groupId: rowSheet.groupId,
      paintId: rowSheet.paintId,
      next: ids[index + 1] ?? ids[index - 1],
    };
  };

  useEffect(() => {
    if (renaming !== null || focusAfterRename.current === null) return;
    const actions = actionButtons.current.get(focusAfterRename.current);
    // Offline the actions button is disabled and can't take focus, so the heading does.
    (actions?.disabled ? headings.current.get(focusAfterRename.current) : actions)?.focus();
    focusAfterRename.current = null;
  }, [renaming]);

  const rowGroup = groups.find((g) => g.id === rowSheet.groupId);
  const sheetGroup =
    sheet && sheet.kind !== "new" ? groups.find((g) => g.id === sheet.groupId) : undefined;
  // Kept after closing, or after a delete removes the group, so titles don't blank while the sheet animates out.
  const shownName = sheetGroup?.name ?? lastSheetName;

  const restoreFocus = (event: Event) => {
    event.preventDefault();
    focusOnClose.current()?.focus();
  };

  const openActions = (group: Group) => {
    const groupId = group.id;
    setLastSheetName(group.name);
    focusOnClose.current = actionsFor(groupId);
    setSheet({ kind: "actions", groupId });
  };

  const startRename = (groupId: string) => {
    focusOnClose.current = () => renameField.current;
    setRenaming(groupId);
    setSheet(null);
  };

  // A save that lands after the user moved on to another group's rename mustn't close that form.
  const finishRename = (groupId: string) => {
    focusAfterRename.current = groupId;
    setRenaming((current) => (current === groupId ? null : current));
  };

  const confirmDelete = (group: Group) => {
    if (deleting) return;
    const index = groups.findIndex((g) => g.id === group.id);
    const next = groups[index + 1]?.id;
    setDeleting(true);
    setDeleteError(null);
    removeGroup({ paletteId, groupId: group.id })
      .then(() => {
        focusOnClose.current = () =>
          (next === undefined ? null : actionButtons.current.get(next)) ?? newGroupButton.current;
        setSheet(null);
        toast(`Deleted group ${group.name}`);
      })
      .catch((cause: unknown) => {
        console.error("Deleting the group failed", cause);
        setDeleteError("Couldn't delete the group. Check your connection and try again.");
      })
      .finally(() => setDeleting(false));
  };

  // Arrange mode swaps every control for handles, so the sheets and New group have nothing to open from.
  if (arranging) {
    return (
      <SortableContext
        items={groups.map((g) => sortableIdOf({ type: "group", groupId: g.id }))}
        strategy={verticalListSortingStrategy}
      >
        <div className="palette-groups">
          {groups.map((group) => (
            <ArrangeGroup
              key={group.id}
              group={group}
              headingId={`${baseId}-${group.id}`}
              paints={paints}
              brands={brands}
              online={online}
            />
          ))}
        </div>
      </SortableContext>
    );
  }

  return (
    <div className="palette-groups">
      {groups.map((group) => {
        const headingId = `${baseId}-${group.id}`;
        const isRenaming = renaming === group.id;
        return (
          <section
            key={group.id}
            className="palette-groups__group"
            aria-labelledby={isRenaming ? undefined : headingId}
            aria-label={isRenaming ? group.name : undefined}
          >
            {isRenaming ? (
              <GroupRenameForm
                paletteId={paletteId}
                group={group}
                fieldRef={renameField}
                online={online}
                onDone={() => finishRename(group.id)}
              />
            ) : (
              <div className="palette-groups__heading">
                <h2
                  id={headingId}
                  tabIndex={-1}
                  ref={(element) => {
                    if (element) headings.current.set(group.id, element);
                    else headings.current.delete(group.id);
                  }}
                >
                  {group.name}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  ref={(element) => {
                    if (element) actionButtons.current.set(group.id, element);
                    else actionButtons.current.delete(group.id);
                  }}
                  aria-label={`Actions for group ${group.name}`}
                  disabled={!online}
                  onClick={() => openActions(group)}
                >
                  <Ellipsis aria-hidden="true" />
                </Button>
              </div>
            )}
            {group.paintIds.length === 0 ? (
              <p className="palette-groups__empty">No paints in this group yet</p>
            ) : (
              <ul className="palette-groups__paints">
                {group.paintIds.map((paintId) => {
                  const paint = paints.get(paintId);
                  const name = paint?.name ?? "unknown paint";
                  return (
                    <li key={paintId} className="palette-groups__paint">
                      {paint ? (
                        <PaintSwatch hex={paint.hex} type={paint.type} />
                      ) : (
                        <span className="palette-groups__unknown-swatch" aria-hidden="true" />
                      )}
                      <span className="palette-groups__text">
                        <span className="palette-groups__name">
                          {paint?.name ?? "Unknown paint"}
                        </span>
                        {paint && (
                          <span className="palette-groups__brand">{brands.get(paint.brandId)}</span>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        ref={(element) => {
                          if (element) rowButtons.current.set(rowKey(group.id, paintId), element);
                          else rowButtons.current.delete(rowKey(group.id, paintId));
                        }}
                        aria-label={`Actions for ${name} in ${group.name}`}
                        disabled={!online}
                        onClick={() => {
                          setRowSheet({ groupId: group.id, paintId, name });
                          setRowSheetOpen(true);
                          sheetClosed.current = false;
                        }}
                      >
                        <Ellipsis aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <Button
        ref={newGroupButton}
        variant="outline"
        className="palette-groups__new"
        disabled={!online}
        onClick={() => {
          focusOnClose.current = () => null;
          setSheet({ kind: "new" });
        }}
      >
        New group
      </Button>

      {rowGroup && (
        <GroupPaintActionsSheet
          open={rowSheetOpen}
          onOpenChange={setRowSheetOpen}
          paletteId={paletteId}
          paintId={rowSheet.paintId}
          paintName={rowSheet.name}
          group={rowGroup}
          groups={groups}
          online={online}
          onLeaving={startLeaving}
          onClosed={() => {
            sheetClosed.current = true;
            focusAfterRow();
          }}
        />
      )}

      <PaletteNameSheet
        kind="group"
        open={sheet?.kind === "new"}
        onOpenChange={(open) => setSheet(open ? { kind: "new" } : null)}
        title="New group"
        submitLabel="Create"
        returnFocus={newGroupReturn}
        onSave={(name) =>
          createGroup({ paletteId, name }).then((groupId) => {
            createdGroup.current = groupId;
            focusOnClose.current = () => headings.current.get(groupId) ?? null;
          })
        }
      />

      <Sheet
        open={sheet?.kind === "actions"}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
      >
        <SheetContent
          // Moving on to Delete hands focus to that sheet, so only a close or Rename moves it here.
          onCloseAutoFocus={(event) => {
            if (sheet === null) restoreFocus(event);
            else event.preventDefault();
          }}
        >
          <SheetHeader>
            <SheetTitle>{shownName}</SheetTitle>
          </SheetHeader>
          <SheetBody className="palette-groups__actions">
            <Button variant="outline" onClick={() => sheetGroup && startRename(sheetGroup.id)}>
              Rename
            </Button>
            <Button
              variant="destructive"
              onClick={() => sheetGroup && setSheet({ kind: "delete", groupId: sheetGroup.id })}
            >
              Delete group
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet
        open={sheet?.kind === "delete"}
        onOpenChange={(open) => {
          // Closing mid-deletion would hide a failure that arrives afterwards.
          if (locked || open) return;
          setSheet(null);
          setDeleteError(null);
        }}
      >
        <SheetContent onCloseAutoFocus={restoreFocus}>
          <SheetHeader>
            <SheetTitle>{`Delete group "${shownName}"?`}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <p>Its paints stay in the palette.</p>
            <p className="palette-groups__error" role="alert">
              {deleteError}
            </p>
            <p className="palette-groups__note" role="status">
              {!online && OFFLINE_EDIT_NOTE}
            </p>
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline" disabled={locked}>
                Cancel
              </Button>
            </SheetClose>
            <Button
              variant="destructive"
              disabled={!online}
              // aria-disabled, not disabled: a disabled button drops focus, which a failed delete would strand.
              aria-disabled={deleting || undefined}
              onClick={() => sheetGroup && confirmDelete(sheetGroup)}
            >
              Delete
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const RENAME_MESSAGES: Record<string, string> = {
  GROUP_NAME_INVALID: "Give the group a name",
};

function GroupRenameForm({
  paletteId,
  group,
  fieldRef,
  online,
  onDone,
}: {
  paletteId: Id<"palettes">;
  group: Group;
  fieldRef: RefObject<HTMLInputElement | null>;
  online: boolean;
  onDone: () => void;
}) {
  const renameGroup = useMutation(api.palettes.renameGroup);
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Cancelling mid-save would let the new name land after the old one came back, or lose its error.
  const locked = saving && online;
  const fieldId = useId();
  const errorId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return setError("Give the group a name");
    if (trimmed.length > MAX_NAME_LENGTH) return setError("Use 60 characters or fewer");
    setSaving(true);
    setError(null);
    renameGroup({ paletteId, groupId: group.id, name: trimmed })
      .then(onDone)
      .catch((cause: unknown) => {
        const code =
          cause instanceof ConvexError && typeof cause.data === "string" ? cause.data : "";
        if (!RENAME_MESSAGES[code]) console.error("Renaming the group failed", cause);
        setError(
          RENAME_MESSAGES[code] ??
            "Couldn't rename the group. Check your connection and try again.",
        );
        setSaving(false);
      });
  };

  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (!locked) onDone();
  };

  return (
    <form className="palette-groups__rename" onSubmit={submit} noValidate>
      <label className="palette-groups__rename-label" htmlFor={fieldId}>
        Group name
      </label>
      <Input
        id={fieldId}
        ref={fieldRef}
        autoComplete="off"
        value={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={cancelOnEscape}
      />
      <p id={errorId} className="palette-groups__error" role="alert">
        {error}
      </p>
      <div className="palette-groups__rename-buttons">
        <Button type="button" variant="outline" disabled={locked} onClick={onDone}>
          Cancel
        </Button>
        {/* aria-disabled, not disabled: a disabled button drops focus, which a failed save would strand. */}
        <Button type="submit" disabled={!online} aria-disabled={saving || undefined}>
          Save
        </Button>
      </div>
    </form>
  );
}

function ArrangeGroup({
  group,
  headingId,
  paints,
  brands,
  online,
}: {
  group: Group;
  headingId: string;
  paints: Map<string, Catalog["paints"][number]>;
  brands: Map<string, string>;
  online: boolean;
}) {
  const data: DragData = { type: "group", groupId: group.id };
  const id = sortableIdOf(data);
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, data, disabled: !online });
  const { setNodeRef: setZoneRef } = useDroppable({
    id: sortableIdOf({ type: "zone", groupId: group.id }),
    data: { type: "zone", groupId: group.id } satisfies DragData,
    disabled: !online,
  });
  const { active, over } = useDndContext();
  const from = active?.data.current as DragData | undefined;
  const target = over?.data.current as DragData | undefined;
  // Groups vary in height and the sorting strategy shifts by the dragged one's, so a group drag shows headings only.
  const collapsed = from?.type === "group";
  // Marks the group a paint from another list would land in, unless it's already there.
  const dropTarget =
    from?.type === "paint" &&
    from.groupId !== group.id &&
    target?.groupId === group.id &&
    !group.paintIds.includes(from.paintId);

  return (
    <section
      ref={setNodeRef}
      className="palette-groups__group palette-arrange__item"
      aria-labelledby={headingId}
      data-dragging={isDragging || undefined}
      data-drop-target={dropTarget || undefined}
      style={{
        "--drag-x": transform ? `${transform.x}px` : undefined,
        "--drag-y": transform ? `${transform.y}px` : undefined,
        "--drag-transition": transition ?? undefined,
      }}
    >
      <div ref={setZoneRef} className="palette-groups__zone">
        <div className="palette-groups__heading">
          <h2 id={headingId}>{group.name}</h2>
          <MoveButton data={data} label={`Move group ${group.name}`} disabled={!online} />
          <DragHandle
            activatorRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
            id={id}
            label={`Drag group ${group.name}`}
            disabled={!online}
          />
        </div>
        {collapsed ? null : group.paintIds.length === 0 ? (
          <p className="palette-groups__empty">No paints in this group yet</p>
        ) : (
          <SortableContext
            items={group.paintIds.map((paintId) =>
              sortableIdOf({ type: "paint", groupId: group.id, paintId }),
            )}
            strategy={verticalListSortingStrategy}
          >
            <ul className="palette-groups__paints">
              {group.paintIds.map((paintId) => {
                const paint = paints.get(paintId);
                return (
                  <SortableItem
                    key={paintId}
                    data={{ type: "paint", groupId: group.id, paintId }}
                    name={paint?.name ?? "unknown paint"}
                    disabled={!online}
                    className="palette-groups__paint"
                  >
                    {paint ? (
                      <PaintSwatch hex={paint.hex} type={paint.type} />
                    ) : (
                      <span className="palette-groups__unknown-swatch" aria-hidden="true" />
                    )}
                    <span className="palette-groups__text">
                      <span className="palette-groups__name">{paint?.name ?? "Unknown paint"}</span>
                      {paint && (
                        <span className="palette-groups__brand">{brands.get(paint.brandId)}</span>
                      )}
                    </span>
                  </SortableItem>
                );
              })}
            </ul>
          </SortableContext>
        )}
      </div>
    </section>
  );
}
