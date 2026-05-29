import { NextResponse } from "next/server";
import { resolveFont } from "@/lib/compose/fonts";

type FontClass = "serif" | "sans" | "display" | "mono";
const CLASSES: FontClass[] = ["serif", "sans", "display", "mono"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ family: string; weight: string }> },
) {
  const { family, weight } = await params;
  const fam = decodeURIComponent(family);
  const w = parseInt(weight, 10);
  const klassParam = new URL(req.url).searchParams.get("class");
  const klass: FontClass = CLASSES.includes(klassParam as FontClass)
    ? (klassParam as FontClass)
    : "sans";

  let resolved;
  try {
    resolved = await resolveFont(fam, klass, Number.isNaN(w) ? 400 : w);
  } catch {
    return new NextResponse("Font not found", { status: 404 });
  }

  const ext = resolved.filePath.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "woff2" ? "font/woff2" :
    ext === "woff" ? "font/woff" :
    ext === "otf" ? "font/otf" :
    "font/ttf";

  return new NextResponse(new Uint8Array(resolved.data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
