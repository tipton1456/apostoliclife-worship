import { createServer } from "http";
import { Client } from "@featherbear/presonus-studiolive-api";

const mixerHost = process.env.PRESONUS_HOST || "192.168.1.123";
const mixerPort = Number(process.env.PRESONUS_PORT || 53000);
const bridgePort = Number(process.env.PRESONUS_BRIDGE_PORT || 4310);
const defaultChannelCount = Number(process.env.PRESONUS_CHANNELS || 8);

const client = new Client(
  { host: mixerHost, port: mixerPort },
  {
    autoreconnect: true,
    logLevel: "fatal",
  }
);

let connectPromise;
let connectedAt = null;

function selector(channel) {
  return { type: "LINE", channel };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);

  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function ensureConnected() {
  if (!connectPromise) {
    connectPromise = client.connect().then(() => {
      connectedAt = new Date().toISOString();
      return client;
    });
  }

  return connectPromise;
}

function readChannels(count) {
  return Array.from({ length: count }, (_, index) => {
    const channel = index + 1;
    const channelSelector = selector(channel);

    return {
      slot: channel,
      channel,
      mute: client.getMute(channelSelector),
      level: client.getLevel(channelSelector),
    };
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  try {
    if (url.pathname === "/health") {
      await ensureConnected();
      json(res, 200, {
        ok: true,
        mixerHost,
        mixerPort,
        connectedAt,
        channelCounts: client.channelCounts,
      });
      return;
    }

    if (url.pathname === "/channels") {
      await ensureConnected();

      const count = Number(url.searchParams.get("count") || defaultChannelCount);
      json(res, 200, {
        mixerHost,
        mixerPort,
        inputType: "LINE",
        channels: readChannels(count),
      });
      return;
    }

    json(res, 404, {
      error: "Not found",
      routes: ["/health", "/channels"],
    });
  } catch (error) {
    connectPromise = undefined;
    connectedAt = null;
    json(res, 500, {
      error: error instanceof Error ? error.message : "Unknown bridge error",
    });
  }
});

server.listen(bridgePort, () => {
  console.log(`PreSonus bridge listening on http://localhost:${bridgePort}`);
  console.log(`Connecting to StudioLive at ${mixerHost}:${mixerPort}`);
});

async function shutdown() {
  server.close();
  await client.close().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
