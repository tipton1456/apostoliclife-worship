export type GalleryFolder = { name: string; path: string };

export type GalleryImage = {
  id: string;
  name: string;
  path: string;
  size: number;
  modified: string | null;
};

export type PhotoDetails = {
  id: string;
  name: string;
  path: string;
  folder: string;
  size: number;
  modified: string | null;
  savedAt: string | null;
  taken: string | null;
  width: number | null;
  height: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type FolderStat = {
  path: string;
  name: string;
  parentPath: string | null;
  photoCount: number;
  sizeBytes: number;
};

export type PersonSummary = {
  tag: string;
  count: number;
  sizeBytes: number;
};
