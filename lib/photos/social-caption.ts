type ResponseItem = {
  content?: { text?: string }[];
};

type CaptionResponse = {
  output?: ResponseItem[];
  output_text?: string;
  error?: { message?: string };
};

export async function suggestSocialCaption(input: { notes: string; folderPath: string }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("Caption help is not connected yet. Add an XAI_API_KEY on the server.");
  }

  const notes = input.notes.trim().slice(0, 2000);
  const folder = input.folderPath.split("/").filter(Boolean).pop() || "a worship service";
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-4.7",
      store: false,
      input: [
        {
          role: "system",
          content:
            "You write social captions for Apostolic Worship. Use warm, plain, reverent language. Keep it to 4 short lines or fewer. Do not invent names, song titles, quotes, or places. Do not add hashtags unless the notes already include them. Return only the caption.",
        },
        {
          role: "user",
          content: notes
            ? `Folder: ${folder}\n\nPhotographer notes:\n${notes}`
            : `Folder: ${folder}\n\nWrite a short caption for photos from this worship service. Do not invent details.`,
        },
      ],
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as CaptionResponse | null;
  if (!response.ok || body?.error) {
    throw new Error(body?.error?.message || "Caption help is unavailable right now.");
  }

  const text =
    body?.output_text?.trim() ||
    (body?.output ?? [])
      .flatMap((item) => item.content ?? [])
      .map((content) => content.text?.trim() || "")
      .filter(Boolean)
      .join("\n")
      .trim();

  if (!text) throw new Error("Caption help did not return any text.");
  return text.slice(0, 2000);
}
