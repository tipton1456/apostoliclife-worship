export type TechDoc = {
  id: string;
  title: string;
  category: string;
  description: string;
  uploadedBy: string;
  storagePath: string;
  originalFilename: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
};

export type TechDocListItem = Omit<TechDoc, "storagePath">;
