import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";

export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  provider: string;
}

export interface StorageProvider {
  upload(
    file: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<StoredFile>;
  download(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
}

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async upload(
    file: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<StoredFile> {
    const { promises: fs } = await import("fs");
    const path = await import("path");

    const id = uuidv4();
    const ext = path.extname(originalName);
    const storagePath = path.join(
      this.basePath,
      `${id}${ext}`
    );

    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.writeFile(storagePath, file);

    logger.info("File uploaded to local storage", {
      id,
      originalName,
      storagePath,
    });

    return {
      id,
      originalName,
      mimeType,
      sizeBytes: file.length,
      storagePath,
      provider: "local",
    };
  }

  async download(storagePath: string): Promise<Buffer> {
    const { promises: fs } = await import("fs");
    return fs.readFile(storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    const { promises: fs } = await import("fs");
    await fs.unlink(storagePath);
    logger.info("File deleted from local storage", { storagePath });
  }

  async exists(storagePath: string): Promise<boolean> {
    const { promises: fs } = await import("fs");
    try {
      await fs.access(storagePath);
      return true;
    } catch {
      return false;
    }
  }
}

let _storageProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (_storageProvider) return _storageProvider;

  const provider = process.env.STORAGE_PROVIDER ?? "local";

  switch (provider) {
    case "local": {
      // S7-DC2: Fail-closed — local storage is ephemeral on Vercel serverless.
      // Files written here ARE LOST on restart/re-deploy/cold-start.
      // DURABLE_STORAGE_NOT_REQUIRED: no owner workflow currently calls this.
      // In production: BLOCK the write path so accidental callers fail loudly
      // rather than silently losing data.
      // To enable persistent storage: set STORAGE_PROVIDER=s3 + S3_BUCKET + S3_REGION.
      const isProduction =
        process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
      if (isProduction) {
        throw new Error(
          "S7-DC2: LocalStorageProvider is not permitted in production. " +
            "Configure durable storage: set STORAGE_PROVIDER=s3 with S3_BUCKET, S3_REGION, and AWS credentials."
        );
      }
      _storageProvider = new LocalStorageProvider(
        process.env.STORAGE_LOCAL_PATH ?? "./uploads"
      );
      break;
    }
    case "s3":
      throw new Error(
        "S3 storage provider not yet configured. Set S3_BUCKET, S3_REGION, and AWS credentials."
      );
    default:
      throw new Error(`Unknown storage provider: ${provider}`);
  }

  return _storageProvider;
}
