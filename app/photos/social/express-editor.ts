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
        canvasSize: { width: 1080, height: 1080 },
      },
      {
        callbacks: {
          onCancel: () => finish(new Error("Editing was cancelled.")),
          onError: () => finish(new Error("Adobe Express ran into a problem. Check that this site is allowed on the Adobe API key.")),
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
            publishFileType: "JPEG",
            closeTargetOnExport: true,
          },
          style: { uiType: "button" },
        },
      ],
    );
  });
}
