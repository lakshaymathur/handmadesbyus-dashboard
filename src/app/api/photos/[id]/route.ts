import { z } from "zod";
import { getPhotoFile } from "@/features/products/queries";
import { getStorage } from "@/lib/storage";

// Streams a product photo from the private bucket to a signed-in user. Photos go through
// the app rather than signed storage URLs, so they're as private as the rest of the app
// and work wherever the app does (a phone on the LAN, production behind a proxy).

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/photos/[id]">,
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  // Redirects to /login when signed out (like every query).
  const photo = await getPhotoFile(id);
  if (!photo) return notFound();
  const file = await getStorage().get(photo.key);
  if (!file) return notFound();

  return new Response(file.body, {
    headers: {
      "Content-Type": photo.type,
      ...(file.size === null ? {} : { "Content-Length": String(file.size) }),
      // A photo id's bytes never change (a new photo gets a new id), so the browser may
      // keep it; "private" keeps shared caches and proxies from storing it.
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      // If anything ever got past the upload checks, it still can't run as a page.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
