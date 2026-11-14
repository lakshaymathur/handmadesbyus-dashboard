"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { validateThenRun } from "@/lib/client-action";
import { shrinkPhoto } from "@/lib/shrink-photo";
import type { FormMessageState } from "@/lib/use-action-form";
import {
  deleteProductPhoto,
  makeMainPhoto,
  uploadProductPhoto,
} from "../actions";
import type { ProductPhoto } from "../queries";
import { MAX_PHOTOS, photoIdSchema, uploadPhotoSchema } from "../schema";

/** A product's photos (§2.2): add up to 5, choose the main one, delete. */
export function PhotoManager({
  productId,
  productName,
  photos,
}: {
  productId: string;
  productName: string;
  photos: ProductPhoto[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<FormMessageState>(null);
  const room = MAX_PHOTOS - photos.length;

  function upload(files: File[]) {
    setMessage(null);
    startTransition(async () => {
      const chosen = files.slice(0, room);
      const problems: string[] = [];
      if (files.length > room) {
        problems.push(
          `Only ${room} more photo${room === 1 ? "" : "s"} fit, so the rest were skipped.`,
        );
      }
      for (const [index, file] of chosen.entries()) {
        setStatus(`Uploading ${index + 1} of ${chosen.length}…`);
        let photo: File;
        try {
          photo = await shrinkPhoto(file);
        } catch {
          problems.push(`Couldn't read “${file.name}” as a photo.`);
          continue;
        }
        const result = await validateThenRun(
          uploadPhotoSchema,
          { productId, photo },
          uploadProductPhoto,
        );
        if (result && !result.ok) problems.push(result.error);
      }
      setStatus(null);
      if (problems.length > 0) {
        setMessage({ ok: false, text: problems.join(" ") });
      }
      if (input.current) input.current.value = "";
    });
  }

  function run(action: typeof makeMainPhoto, id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await validateThenRun(photoIdSchema, { id }, action);
      if (result && !result.ok) setMessage({ ok: false, text: result.error });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- photos come from /api/photos, which needs the session cookie; the image optimiser fetches without it */}
                <img
                  src={photo.url}
                  alt={
                    index === 0
                      ? `${productName}, main photo`
                      : `${productName}, photo ${index + 1}`
                  }
                  className="size-full object-cover"
                />
                {index === 0 && (
                  <span className="absolute top-2 left-2 rounded bg-background/90 px-2 py-0.5 text-xs font-medium">
                    Main
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {index > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1"
                    disabled={pending}
                    onClick={() => run(makeMainPhoto, photo.id)}
                  >
                    Make main
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Delete this photo?")) {
                      run(deleteProductPhoto, photo.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {room > 0 ? (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="sr-only"
            id={`${productId}-photos`}
            onChange={(e) => upload([...(e.target.files ?? [])])}
            disabled={pending}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:w-fit"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <ImagePlus aria-hidden />
            {status ??
              (photos.length === 0
                ? "Add photos"
                : `Add photos (${photos.length} of ${MAX_PHOTOS})`)}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {MAX_PHOTOS} photos, the most a product can have. Delete one to add
          another.
        </p>
      )}
      <FormMessage message={message} />
    </div>
  );
}
