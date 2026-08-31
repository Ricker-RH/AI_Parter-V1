"use client";

import {
  POST_MEDIA_MAX_BYTES,
  PostMediaUploadIntentResponseSchema,
  RegisteredPostMediaSchema,
} from "@aifans/contracts";
import { useEffect, useRef, useState } from "react";

export type SelectedPostMedia = {
  reservationId: string;
  altText: string | null;
};
type Item = SelectedPostMedia & { previewUrl: string; name: string };

async function dimensions(file: File) {
  const bitmap = await createImageBitmap(file);
  const value = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return value;
}

async function json<T>(
  url: string,
  body: unknown,
  parse: { parse(value: unknown): T },
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("upload");
  return parse.parse(await response.json());
}

export function PostMediaUploader({
  disabled,
  labels,
  onChange,
}: {
  disabled: boolean;
  labels: {
    images: string;
    imageHint: string;
    imageAlt: string;
    removeImage: string;
    uploadingImages: string;
    imageError: string;
  };
  onChange(value: SelectedPostMedia[]): void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const currentItems = useRef(items);
  currentItems.current = items;
  useEffect(
    () => () => {
      for (const item of currentItems.current)
        URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  function commit(next: Item[]) {
    setItems(next);
    onChange(
      next.map(({ reservationId, altText }) => ({ reservationId, altText })),
    );
  }
  async function select(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, 4 - items.length);
    if (
      selected.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size < 1 ||
          file.size > POST_MEDIA_MAX_BYTES,
      )
    ) {
      setError(labels.imageError);
      return;
    }
    setPending(true);
    setError("");
    try {
      const uploaded: Item[] = [];
      for (const file of selected) {
        const intent = await json(
          "/api/admin/post-media/upload-intents",
          { contentType: file.type, sizeBytes: file.size },
          PostMediaUploadIntentResponseSchema,
        );
        const upload = await fetch(intent.url, {
          method: "PUT",
          headers: intent.headers,
          body: file,
        });
        if (!upload.ok) throw new Error("upload");
        await json(
          `/api/admin/post-media/${intent.reservationId}/register`,
          await dimensions(file),
          RegisteredPostMediaSchema,
        );
        uploaded.push({
          reservationId: intent.reservationId,
          altText: null,
          previewUrl: URL.createObjectURL(file),
          name: file.name,
        });
      }
      commit([...items, ...uploaded]);
    } catch {
      setError(labels.imageError);
    } finally {
      setPending(false);
    }
  }
  return (
    <fieldset className="post-media-uploader" disabled={disabled || pending}>
      <legend>{labels.images}</legend>
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label={labels.images}
        disabled={items.length >= 4}
        multiple
        onChange={(event) => void select(event.target.files)}
        type="file"
      />
      <p className="admin-field-hint">
        {pending ? labels.uploadingImages : labels.imageHint}
      </p>
      {error ? (
        <p className="admin-status admin-status-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="post-media-previews">
        {items.map((item, index) => (
          <div className="post-media-preview" key={item.reservationId}>
            <img alt="" src={item.previewUrl} />
            <label>
              {labels.imageAlt}
              <input
                maxLength={1000}
                onChange={(event) => {
                  const next = items.map((value, position) =>
                    position === index
                      ? { ...value, altText: event.target.value.trim() || null }
                      : value,
                  );
                  commit(next);
                }}
                value={item.altText ?? ""}
              />
            </label>
            <button
              onClick={() => {
                URL.revokeObjectURL(item.previewUrl);
                commit(items.filter((_, position) => position !== index));
              }}
              type="button"
            >
              {labels.removeImage}
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
