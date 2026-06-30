import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";

function contentTypeFor(name: string | undefined): string {
  const ext = name?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "svg": return "image/svg+xml";
    case "webp": return "image/webp";
    case "mp4": return "video/mp4";
    case "webm": return "video/webm";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "srt": return "application/x-subrip";
    default: return "image/jpeg";
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const segments = params.path;

  // Prevent path traversal
  if (segments.some((s) => s.includes("..") || s === "")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = join(process.cwd(), "public", "media", ...segments);
  if (!existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const size = statSync(filePath).size;
  const contentType = contentTypeFor(segments.at(-1));
  const cacheControl = "public, max-age=31536000, immutable";

  // Honor HTTP Range requests. Browsers require a 206 response to play and seek
  // <video>/<audio> — without it the element often renders blank. Stream only
  // the requested slice instead of loading the whole file into memory.
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end)) end = size - 1;
      end = Math.min(end, size - 1);

      if (start > end || start >= size) {
        return new NextResponse("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
        });
      }

      const stream = Readable.toWeb(
        createReadStream(filePath, { start, end })
      ) as ReadableStream<Uint8Array>;
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  const stream = Readable.toWeb(
    createReadStream(filePath)
  ) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
    },
  });
}
