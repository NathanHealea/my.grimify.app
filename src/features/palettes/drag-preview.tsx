import "./drag-preview.css";

import { PaintSwatch } from "@/components/paint-swatch";
import type { Paint } from "@/features/catalog/schema";

/** What follows the pointer during a drag: only the paint (or group name) on glass, no controls. */
export function DragPreview(
  props:
    | { kind: "paint"; paint: Paint | undefined; brandName: string | undefined }
    | { kind: "group"; name: string },
) {
  if (props.kind === "group") {
    return <div className="drag-preview drag-preview__group">{props.name}</div>;
  }
  const { paint, brandName } = props;
  return (
    <div className="drag-preview">
      {paint ? (
        <PaintSwatch hex={paint.hex} type={paint.type} />
      ) : (
        <span className="drag-preview__unknown-swatch" aria-hidden="true" />
      )}
      <span className="drag-preview__text">
        <span className="drag-preview__name">{paint?.name ?? "Unknown paint"}</span>
        {paint && <span className="drag-preview__brand">{brandName}</span>}
      </span>
    </div>
  );
}
