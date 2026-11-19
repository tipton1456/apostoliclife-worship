export type TechDoc = {
  id: string;
  title: string;
  category: string;
  description: string;
  uploadedBy: string;
  storagePath: string;
  /** Optional stored preview image path (PDF first page, etc.) */
  thumbnailPath?: string | null;
  originalFilename: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
  /** Folder this file came from when it was archived. Hidden from the library tree. */
  archivedFrom?: string | null;
};

export type FileKind =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "doc"
  | "sheet"
  | "presentation"
  | "file";

export type TechDocListItem = Omit<TechDoc, "storagePath"> & {
  kind: FileKind;
  /** Short-lived signed URL for image previews (null for non-images) */
  thumbnailUrl: string | null;
};
