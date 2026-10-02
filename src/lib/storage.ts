import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { AppError } from "../common/errors/AppError.js";

const UPLOAD_URL_TTL = 15 * 60;
const READ_URL_TTL = 60 * 60;

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    throw new AppError("Almacenamiento no configurado (S3_ACCESS_KEY / S3_SECRET_KEY)", 503, "STORAGE_NOT_CONFIGURED");
  }
  client ??= new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  return client;
}

export const storage = {
  uploadUrlTtl: UPLOAD_URL_TTL,

  /** URL prefirmada para subir directo al bucket (PUT). Fija tipo y tamaño. */
  async presignUpload(key: string, contentType: string, sizeBytes: number): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    return getSignedUrl(getClient(), cmd, { expiresIn: UPLOAD_URL_TTL });
  },

  /** URL para leer un objeto: publica si S3_PUBLIC_URL esta definida, si no prefirmada. */
  async urlFor(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
    const cmd = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
    return getSignedUrl(getClient(), cmd, { expiresIn: READ_URL_TTL });
  },

  /** Devuelve el tamaño del objeto, o null si no existe. */
  async objectSize(key: string): Promise<number | null> {
    try {
      const res = await getClient().send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return res.ContentLength ?? 0;
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  },

  async getBuffer(key: string): Promise<Buffer> {
    const res = await getClient().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!res.Body) throw new AppError("Objeto vacío en el almacenamiento", 502, "STORAGE_EMPTY");
    return Buffer.from(await res.Body.transformToByteArray());
  },

  async putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await getClient().send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
  },

  async remove(key: string): Promise<void> {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  },
};
