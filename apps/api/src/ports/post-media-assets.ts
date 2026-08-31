import type { PostImageContentType } from "@aifans/contracts";

export type PostMediaAssetPort = {
  createUploadIntent(input: {
    objectKey: string;
    contentType: PostImageContentType;
    sizeBytes: number;
    expiresAt: string;
  }): Promise<{
    method: "PUT";
    url: string;
    headers: { "content-type": PostImageContentType };
    expiresAt: string;
    maxBytes: 10485760;
  }>;
  inspectUpload(input: {
    objectKey: string;
    contentType: PostImageContentType;
    sizeBytes: number;
  }): Promise<{ contentType: PostImageContentType; sizeBytes: number }>;
};
