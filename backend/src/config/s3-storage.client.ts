/**
 * S3-compatible client (MinIO). Lazy singleton; null if env incomplete.
 */

import { S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null | undefined;

export interface S3StorageConfig {
  client: S3Client;
  bucket: string;
}

/**
 * Returns configured client + bucket, or null if required env vars are missing.
 */
export function getS3StorageConfig(): S3StorageConfig | null {
  if (client === undefined) {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    const accessKey = process.env.S3_ACCESS_KEY?.trim();
    const secretKey = process.env.S3_SECRET_KEY?.trim();
    const bucket = process.env.S3_BUCKET?.trim();
    const region = process.env.S3_REGION?.trim() || "us-east-1";
    const forcePathStyle =
      process.env.S3_FORCE_PATH_STYLE === "true" ||
      process.env.S3_FORCE_PATH_STYLE === "1";

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      client = null;
    } else {
      client = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle,
      });
    }
  }
  if (client === null) return null;
  return {
    client,
    bucket: process.env.S3_BUCKET!.trim(),
  };
}
