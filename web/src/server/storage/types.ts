export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}
