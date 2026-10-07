export interface BlobWrite {
  key: string;
  body: ReadableStream | ArrayBuffer | ArrayBufferView | string | null;
  contentType: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
}

export interface BlobStore {
  put(input: BlobWrite): Promise<R2Object>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  remove(key: string): Promise<void>;
}

function assertKey(key: string): void {
  if (!key || key.startsWith("/") || key.split("/").includes("..")) {
    throw new Error("Blob keys must be non-empty relative paths without parent segments.");
  }
}

export function createR2BlobStore(bucket: R2Bucket): BlobStore {
  return {
    async put(input) {
      assertKey(input.key);
      if (!input.contentType.trim()) throw new Error("Blob writes require a content type.");
      return bucket.put(input.key, input.body, {
        httpMetadata: {
          contentType: input.contentType,
          contentDisposition: input.contentDisposition,
        },
        customMetadata: input.metadata,
      });
    },
    async get(key) {
      assertKey(key);
      return bucket.get(key);
    },
    async head(key) {
      assertKey(key);
      return bucket.head(key);
    },
    async remove(key) {
      assertKey(key);
      await bucket.delete(key);
    },
  };
}
