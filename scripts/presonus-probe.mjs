import { Client } from "@featherbear/presonus-studiolive-api";

const host = process.env.PRESONUS_HOST || "192.168.1.123";
const port = Number(process.env.PRESONUS_PORT || 53000);
const channelCount = Number(process.env.PRESONUS_CHANNELS || 8);

function inputChannel(type, channel) {
  return { type, channel };
}

function formatValue(value) {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "number") return Number(value.toFixed(3));
  return value;
}

const client = new Client(
  { host, port },
  {
    autoreconnect: false,
    logLevel: "fatal",
  }
);

try {
  console.log(`Connecting to StudioLive at ${host}:${port}...`);
  await client.connect();

  const inputType = (client.channelCounts.LINE ?? 0) >= channelCount ? "LINE" : "MONO";

  console.log("Connected.");
  console.log("Detected channel counts:");
  console.log(JSON.stringify(client.channelCounts, null, 2));
  console.log("");
  console.log(`MicBoard slot -> PreSonus ${inputType} input`);

  for (let channel = 1; channel <= channelCount; channel += 1) {
    const selector = inputChannel(inputType, channel);
    const mute = client.getMute(selector);
    const level = client.getLevel(selector);

    console.log(
      `W${channel} -> channel ${channel}: mute=${formatValue(mute)} level=${formatValue(level)}`
    );
  }
} finally {
  await client.close().catch(() => {});
}
