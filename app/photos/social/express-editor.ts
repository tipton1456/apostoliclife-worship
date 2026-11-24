"use client";

const ADOBE_SDK = "https://cc-embed.adobe.com/sdk/v4/CCEverywhere.js";

type PublishParams = {
  asset?: { data?: string | Blob }[];
};

type ExpressEditor = {
  createWithAsset: (docConfig: unknown, appConfig: unknown, exportConfig: unknown) => void;
};

type AdobeSdk = {
  initialize: (hostInfo: { clientId: string; appName: string }, configParams?: { loginMode?: string }) => Promise<{ editor: ExpressEditor }>;
};

declare global {
  interface Window {
    CCEverywhere?: AdobeSdk;
  }
}

let loading: Promise<void> | null = null;
let editorPromise: Promise<ExpressEditor> | null = null;

function adobeErrorMessage(error: unknown) {
  const record = typeof error === "object" && error ? (error as { code?: string; message?: string; toString?: () => string }) : null;
  const code = typeof error === "string" ? error : record?.code || "";
  const detail = error instanceof Error ? error.message : record?.message || (record?.toString ? record.toString() : "");
  if (code === "INVALID_SIZE_VALUE" || code === "INVALID_ASPECT_RATIO_VALUE") {
    return "Adobe Express could not open that photo size. Try a JPG.";
  }
  if (code === "INVALID_IMAGE_DATA_URL" || code === "INVALID_ASSET_DATA_TYPE") {
    return "Adobe Express could not read that photo. Choose a JPG or PNG.";
  }
  const host = typeof window === "undefined" ? "" : window.location.host;
  const extra = [code, detail].filter((item) => item && item !== "[object Object]").join(": ");
  const where = host ? ` from ${host}` : "";
  return extra
    ? `Adobe Express could not open${where} (${extra}). The Adobe credential name must be exactly Apostolic Worship.`
    : `Adobe Express could not open${where}. The Adobe credential name must be exactly Apostolic Worship.`;
}

function loadSdk() {
  if (window.CCEverywhere) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = ADOBE_SDK;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Adobe Express did not load."));
    document.body.appendChild(script);
  });
  return loading;
}

async function editorFor(clientId: string) {
  if (!editorPromise) {
    editorPromise = (async () => {
      await loadSdk();
      if (!window.CCEverywhere) throw new Error("Adobe Express did not load.");
      const sdk = await window.CCEverywhere.initialize(
        { clientId, appName: "Apostolic Worship" },
        { loginMode: "delayed" },
      );
      if (!sdk.editor?.createWithAsset) throw new Error("Adobe Express did not start.");
      return sdk.editor;
    })().catch((error) => {
      editorPromise = null;
      throw error;
    });
  }
  return editorPromise;
}

export async function fileToBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function editPhotoInExpress(options: {
  clientId: string;
  base64: string;
  onSave: (data: string | Blob) => Promise<void>;
}) {
  const editor = await editorFor(options.clientId);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    editor.createWithAsset(
      {
        asset: {
          data: options.base64,
          dataType: "base64",
          type: "image",
        },
      },
      {
        callbacks: {
          onCancel: () => finish(new Error("Editing was cancelled.")),
          onError: (error: unknown) => finish(new Error(adobeErrorMessage(error))),
          onPublish: async (_intent: string, params: PublishParams) => {
            const data = params.asset?.[0]?.data;
            if (!data) throw new Error("Adobe Express did not return an image.");
            await options.onSave(data);
            finish();
          },
        },
      },
      [
        {
          id: "save-worship",
          label: "Save to Photos",
          action: {
            target: "publish",
            outputType: "base64",
            closeTargetOnExport: true,
          },
          style: { uiType: "button" },
        },
      ],
    );
  });
}
