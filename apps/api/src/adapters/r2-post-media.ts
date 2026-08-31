import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  POST_MEDIA_MAX_BYTES,
  PostImageContentTypeSchema,
} from "@aifans/contracts";
import { z } from "zod";
import type { PostMediaAssetPort } from "../ports/post-media-assets.js";

export type R2PostMediaEnvironment = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  endpoint: string;
};
type Driver = {
  sign(input: {
    bucket: string;
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn: number;
  }): Promise<string>;
  inspect(input: {
    bucket: string;
    key: string;
  }): Promise<{ contentType?: string; sizeBytes?: number } | null>;
  now?: () => Date;
};
const keySchema = z
  .string()
  .regex(/^public\/posts\/[0-9a-f-]+\.(?:jpg|png|webp)$/);

function awsDriver(configuration: R2PostMediaEnvironment): Driver {
  const client = new S3Client({
    region: "auto",
    endpoint: configuration.endpoint,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });
  return {
    sign: (input) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
        }),
        { expiresIn: input.expiresIn },
      ),
    async inspect(input) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: input.bucket, Key: input.key }),
        );
        return {
          ...(result.ContentType ? { contentType: result.ContentType } : {}),
          ...(result.ContentLength === undefined
            ? {}
            : { sizeBytes: result.ContentLength }),
        };
      } catch (error) {
        const status =
          error && typeof error === "object" && "$metadata" in error
            ? (error.$metadata as { httpStatusCode?: unknown }).httpStatusCode
            : undefined;
        if (status === 404) return null;
        throw error;
      }
    },
  };
}

export function createR2PostMediaPort(
  configuration: R2PostMediaEnvironment,
  dependencies?: Driver,
): PostMediaAssetPort {
  const driver = dependencies ?? awsDriver(configuration);
  const now = driver.now ?? (() => new Date());
  return {
    async createUploadIntent(input) {
      const key = keySchema.parse(input.objectKey);
      const contentType = PostImageContentTypeSchema.parse(input.contentType);
      if (
        !Number.isInteger(input.sizeBytes) ||
        input.sizeBytes < 1 ||
        input.sizeBytes > POST_MEDIA_MAX_BYTES
      )
        throw new Error("POST_MEDIA_INVALID");
      const expiresIn = Math.ceil(
        (Date.parse(input.expiresAt) - now().getTime()) / 1000,
      );
      if (expiresIn < 1 || expiresIn > 600)
        throw new Error("POST_MEDIA_INVALID");
      return {
        method: "PUT",
        url: await driver.sign({
          bucket: configuration.bucket,
          key,
          contentType,
          contentLength: input.sizeBytes,
          expiresIn,
        }),
        headers: { "content-type": contentType },
        expiresAt: input.expiresAt,
        maxBytes: POST_MEDIA_MAX_BYTES,
      };
    },
    async inspectUpload(input) {
      const key = keySchema.parse(input.objectKey);
      const metadata = await driver.inspect({
        bucket: configuration.bucket,
        key,
      });
      if (!metadata) throw new Error("POST_MEDIA_NOT_FOUND");
      if (
        metadata.contentType !== input.contentType ||
        metadata.sizeBytes !== input.sizeBytes
      )
        throw new Error("POST_MEDIA_INVALID");
      return { contentType: input.contentType, sizeBytes: input.sizeBytes };
    },
  };
}
