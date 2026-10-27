import type { GalleryImage } from "@/lib/photos/types";

// face-api.js distances below this are the same person. Lower is closer.
export const FACE_MATCH_DISTANCE = 0.48;

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FaceReference = {
  tag: string;
  tagKey: string;
  embedding: number[];
};

export type FaceMatch = {
  tag: string;
  tagKey: string;
  distance: number;
};

export type FaceJobImage = GalleryImage & {
  tags: string[];
};

export type FaceSuggestionView = {
  id: number;
  path: string;
  fileName: string;
  crop: string;
  suggestedTag: string | null;
  distance: number | null;
  photoTags: string[];
};

export type FaceJob = {
  folder: string;
  images: FaceJobImage[];
  pending: FaceSuggestionView[];
  references: FaceReference[];
  skipped: number;
  total: number;
};

export function photoInFolder(photoPath: string, folder: string) {
  const path = photoPath.replace(/^\/+|\/+$/g, "");
  const root = folder.replace(/^\/+|\/+$/g, "");
  if (!path || path.includes("..")) return false;
  if (!root) return true;
  return path === root || path.startsWith(`${root}/`);
}

export function euclideanDistance(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

export function bestFaceMatch(
  descriptor: number[],
  references: FaceReference[],
  threshold = FACE_MATCH_DISTANCE,
): FaceMatch | null {
  let best: FaceMatch | null = null;

  for (const reference of references) {
    const distance = euclideanDistance(descriptor, reference.embedding);
    if (!best || distance < best.distance) {
      best = { tag: reference.tag, tagKey: reference.tagKey, distance };
    }
  }

  if (!best || best.distance > threshold) return null;
  return best;
}
