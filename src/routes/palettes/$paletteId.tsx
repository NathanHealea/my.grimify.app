import { createFileRoute } from "@tanstack/react-router";

import { PaletteDetail } from "@/features/palettes/palette-detail";

export const Route = createFileRoute("/palettes/$paletteId")({
  staticData: { back: { to: "/palettes", label: "Palettes" } },
  component: PaletteDetailRoute,
});

function PaletteDetailRoute() {
  const { paletteId } = Route.useParams();
  return <PaletteDetail paletteId={paletteId} />;
}
