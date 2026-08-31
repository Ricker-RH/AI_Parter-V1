"use client";

import {
  CreateIpCommentSchema,
  CreateIpCommentResponseSchema,
  CreateIpSchema,
  CreateIpResponseSchema,
  CreatePostSchema,
  CreatePostResponseSchema,
  type PublicIp,
} from "@aifans/contracts";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Locale } from "../../i18n/config";
import { PostMediaUploader, type SelectedPostMedia } from "./PostMediaUploader";

export interface AdminLabels {
  title: string;
  eyebrow: string;
  description: string;
  createIpTitle: string;
  createIpDescription: string;
  username: string;
  displayName: string;
  bio: string;
  languages: string;
  languagesHint: string;
  createIp: string;
  creatingIp: string;
  publishPostTitle: string;
  publishPostDescription: string;
  ipProfileId: string;
  createdIpSelector: string;
  manualIpOption: string;
  body: string;
  language: string;
  publishPost: string;
  publishingPost: string;
  publishCommentTitle: string;
  publishCommentDescription: string;
  postId: string;
  parentCommentId: string;
  publishComment: string;
  publishingComment: string;
  optional: string;
  createdIpSuccess: string;
  publishedPostSuccess: string;
  publishedCommentSuccess: string;
  publicId: string;
  viewPost: string;
  authRequired: string;
  operatorRequired: string;
  serviceUnavailable: string;
  requestFailed: string;
  invalidResponse: string;
  images: string;
  imageHint: string;
  imageAlt: string;
  removeImage: string;
  uploadingImages: string;
  imageError: string;
}

type FormState =
  | { kind: "idle" | "pending" }
  | { kind: "error"; message: string }
  | { kind: "success"; id: string };
type ResponseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AdminRequestError extends Error {
  constructor(
    readonly kind:
      "auth" | "operator" | "unavailable" | "request" | "invalid-response",
  ) {
    super(kind);
  }
}

function errorMessage(error: unknown, labels: AdminLabels): string {
  if (!(error instanceof AdminRequestError)) return labels.serviceUnavailable;
  if (error.kind === "auth") return labels.authRequired;
  if (error.kind === "operator") return labels.operatorRequired;
  if (error.kind === "invalid-response") return labels.invalidResponse;
  if (error.kind === "request") return labels.requestFailed;
  return labels.serviceUnavailable;
}

async function postJson<T>(
  path: string,
  payload: object,
  schema: ResponseSchema<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AdminRequestError("unavailable");
  }
  if (!response.ok) {
    if (response.status === 401) throw new AdminRequestError("auth");
    if (response.status === 403) throw new AdminRequestError("operator");
    if (response.status === 503) throw new AdminRequestError("unavailable");
    throw new AdminRequestError("request");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AdminRequestError("invalid-response");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AdminRequestError("invalid-response");
  return parsed.data;
}

function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-field">
      <div className="admin-field-label">
        {label}
        {optional ? <span>{optional}</span> : null}
      </div>
      {children}
      {hint ? <p className="admin-field-hint">{hint}</p> : null}
    </div>
  );
}

function FormStatus({
  state,
  successLabel,
  labels,
  link,
}: {
  state: FormState;
  successLabel: string;
  labels: AdminLabels;
  link?: string;
}) {
  if (state.kind === "error")
    return (
      <p className="admin-status admin-status-error" role="alert">
        {state.message}
      </p>
    );
  if (state.kind !== "success") return null;
  return (
    <div
      aria-live="polite"
      className="admin-status admin-status-success"
      role="status"
    >
      <strong>{successLabel}</strong>
      <span>
        {labels.publicId}: <code>{state.id}</code>
      </span>
      {link ? (
        <Link href={link}>
          {labels.viewPost}
          <span aria-hidden="true"> →</span>
        </Link>
      ) : null}
    </div>
  );
}

function IpProfileFields({
  id,
  createdIps,
  labels,
  onChange,
  prefix,
}: {
  id: string;
  createdIps: PublicIp[];
  labels: AdminLabels;
  onChange(value: string): void;
  prefix: string;
}) {
  return (
    <>
      {createdIps.length ? (
        <Field label={labels.createdIpSelector}>
          <select
            aria-label={labels.createdIpSelector}
            onChange={(event) => onChange(event.target.value)}
            value={createdIps.some((ip) => ip.id === id) ? id : ""}
          >
            <option value="">{labels.manualIpOption}</option>
            {createdIps.map((ip) => (
              <option key={ip.id} value={ip.id}>
                {ip.displayName} (@{ip.username})
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label={labels.ipProfileId}>
        <input
          aria-label={labels.ipProfileId}
          id={`${prefix}-ip-profile-id`}
          onChange={(event) => onChange(event.target.value)}
          required
          value={id}
        />
      </Field>
    </>
  );
}

export function AdminConsole({
  locale,
  labels,
}: {
  locale: Locale;
  labels: AdminLabels;
}) {
  const [createdIps, setCreatedIps] = useState<PublicIp[]>([]);
  const [postIpId, setPostIpId] = useState("");
  const [commentIpId, setCommentIpId] = useState("");
  const [commentPostId, setCommentPostId] = useState("");
  const [ipState, setIpState] = useState<FormState>({ kind: "idle" });
  const [postState, setPostState] = useState<FormState>({ kind: "idle" });
  const [commentState, setCommentState] = useState<FormState>({ kind: "idle" });
  const [postMedia, setPostMedia] = useState<SelectedPostMedia[]>([]);

  async function createIp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIpState({ kind: "pending" });
    const data = new FormData(event.currentTarget);
    const username = String(data.get("username") ?? "").trim();
    const displayName = String(data.get("displayName") ?? "").trim();
    const bio = String(data.get("bio") ?? "").trim();
    const languageCodes = String(data.get("languages") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const payload = CreateIpSchema.safeParse({
      username,
      displayName,
      ...(bio ? { bio } : {}),
      ...(languageCodes.length ? { languageCodes } : {}),
    });
    if (!payload.success) {
      setIpState({ kind: "error", message: labels.requestFailed });
      return;
    }
    try {
      const ip = await postJson(
        "/api/admin/ips",
        payload.data,
        CreateIpResponseSchema,
      );
      setCreatedIps((current) =>
        current.some((item) => item.id === ip.id) ? current : [...current, ip],
      );
      setPostIpId(ip.id);
      setCommentIpId(ip.id);
      setIpState({ kind: "success", id: ip.id });
    } catch (error) {
      setIpState({ kind: "error", message: errorMessage(error, labels) });
    }
  }

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPostState({ kind: "pending" });
    const data = new FormData(event.currentTarget);
    const body = String(data.get("body") ?? "").trim();
    const languageCode = String(data.get("language") ?? "").trim();
    const payload = CreatePostSchema.safeParse({
      ipProfileId: postIpId.trim(),
      body,
      ...(languageCode ? { languageCode } : {}),
      ...(postMedia.length ? { media: postMedia } : {}),
    });
    if (!payload.success) {
      setPostState({ kind: "error", message: labels.requestFailed });
      return;
    }
    try {
      const post = await postJson(
        "/api/admin/posts",
        payload.data,
        CreatePostResponseSchema,
      );
      setCommentPostId(post.id);
      setPostState({ kind: "success", id: post.id });
      setPostMedia([]);
    } catch (error) {
      setPostState({ kind: "error", message: errorMessage(error, labels) });
    }
  }

  async function publishComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentState({ kind: "pending" });
    const data = new FormData(event.currentTarget);
    const body = String(data.get("body") ?? "").trim();
    const parentCommentId = String(data.get("parentCommentId") ?? "").trim();
    const payload = CreateIpCommentSchema.safeParse({
      ipProfileId: commentIpId.trim(),
      body,
      ...(parentCommentId ? { parentCommentId } : {}),
    });
    if (!payload.success || !uuid.test(commentPostId.trim())) {
      setCommentState({ kind: "error", message: labels.requestFailed });
      return;
    }
    try {
      const comment = await postJson(
        `/api/admin/posts/${encodeURIComponent(commentPostId.trim())}/comments`,
        payload.data,
        CreateIpCommentResponseSchema,
      );
      setCommentState({ kind: "success", id: comment.id });
    } catch (error) {
      setCommentState({ kind: "error", message: errorMessage(error, labels) });
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <p className="admin-eyebrow">{labels.eyebrow}</p>
        <h1>{labels.title}</h1>
        <p>{labels.description}</p>
      </header>
      <div className="admin-forms">
        <section className="admin-card" aria-labelledby="create-ip-title">
          <header>
            <span>01</span>
            <div>
              <h2 id="create-ip-title">{labels.createIpTitle}</h2>
              <p>{labels.createIpDescription}</p>
            </div>
          </header>
          <form noValidate onSubmit={createIp}>
            <Field label={labels.username}>
              <input
                aria-label={labels.username}
                autoComplete="off"
                maxLength={30}
                minLength={3}
                name="username"
                pattern="[a-z0-9_]{3,30}"
                required
              />
            </Field>
            <Field label={labels.displayName}>
              <input
                aria-label={labels.displayName}
                maxLength={80}
                name="displayName"
                required
              />
            </Field>
            <Field label={labels.bio} optional={labels.optional}>
              <textarea
                aria-label={labels.bio}
                maxLength={500}
                name="bio"
                rows={3}
              />
            </Field>
            <Field
              hint={labels.languagesHint}
              label={labels.languages}
              optional={labels.optional}
            >
              <input
                aria-label={labels.languages}
                autoComplete="off"
                name="languages"
                placeholder="en, zh-CN"
              />
            </Field>
            <button disabled={ipState.kind === "pending"} type="submit">
              {ipState.kind === "pending" ? labels.creatingIp : labels.createIp}
            </button>
            <FormStatus
              labels={labels}
              state={ipState}
              successLabel={labels.createdIpSuccess}
            />
          </form>
        </section>

        <section className="admin-card" aria-labelledby="publish-post-title">
          <header>
            <span>02</span>
            <div>
              <h2 id="publish-post-title">{labels.publishPostTitle}</h2>
              <p>{labels.publishPostDescription}</p>
            </div>
          </header>
          <form noValidate onSubmit={publishPost}>
            <IpProfileFields
              createdIps={createdIps}
              id={postIpId}
              labels={labels}
              onChange={setPostIpId}
              prefix="post"
            />
            <Field label={labels.body} optional={labels.optional}>
              <textarea
                aria-label={labels.body}
                maxLength={5000}
                name="body"
                rows={5}
              />
            </Field>
            <PostMediaUploader
              disabled={postState.kind === "pending"}
              labels={labels}
              onChange={setPostMedia}
            />
            <Field label={labels.language} optional={labels.optional}>
              <input
                aria-label={labels.language}
                maxLength={6}
                name="language"
                pattern="[a-z]{2,3}(-[A-Z]{2})?"
                placeholder="en"
              />
            </Field>
            <button disabled={postState.kind === "pending"} type="submit">
              {postState.kind === "pending"
                ? labels.publishingPost
                : labels.publishPost}
            </button>
            <FormStatus
              labels={labels}
              state={postState}
              successLabel={labels.publishedPostSuccess}
              {...(postState.kind === "success"
                ? { link: `/${locale}/posts/${postState.id}` }
                : {})}
            />
          </form>
        </section>

        <section className="admin-card" aria-labelledby="publish-comment-title">
          <header>
            <span>03</span>
            <div>
              <h2 id="publish-comment-title">{labels.publishCommentTitle}</h2>
              <p>{labels.publishCommentDescription}</p>
            </div>
          </header>
          <form noValidate onSubmit={publishComment}>
            <Field label={labels.postId}>
              <input
                aria-label={labels.postId}
                onChange={(event) => setCommentPostId(event.target.value)}
                required
                value={commentPostId}
              />
            </Field>
            <IpProfileFields
              createdIps={createdIps}
              id={commentIpId}
              labels={labels}
              onChange={setCommentIpId}
              prefix="comment"
            />
            <Field label={labels.body}>
              <textarea
                aria-label={labels.body}
                maxLength={2000}
                name="body"
                required
                rows={4}
              />
            </Field>
            <Field label={labels.parentCommentId} optional={labels.optional}>
              <input
                aria-label={labels.parentCommentId}
                name="parentCommentId"
              />
            </Field>
            <button disabled={commentState.kind === "pending"} type="submit">
              {commentState.kind === "pending"
                ? labels.publishingComment
                : labels.publishComment}
            </button>
            <FormStatus
              labels={labels}
              state={commentState}
              successLabel={labels.publishedCommentSuccess}
            />
          </form>
        </section>
      </div>
    </main>
  );
}
