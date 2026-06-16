import { createServer } from "http";
import { Client } from "@featherbear/presonus-studiolive-api";

const mixerHost = process.env.PRESONUS_HOST || "192.168.1.123";
const mixerPort = Number(process.env.PRESONUS_PORT || 53000);
const bridgePort = Number(process.env.PRESONUS_BRIDGE_PORT || 4310);
const defaultChannelCount = Number(process.env.PRESONUS_CHANNELS || 8);
const signalThreshold = Number(process.env.PRESONUS_SIGNAL_THRESHOLD || 3);
const signalScale = Number(process.env.PRESONUS_SIGNAL_SCALE || 32);
const historySize = Number(process.env.PRESONUS_HISTORY_SIZE || 24);

const client = new Client(
  { host: mixerHost, port: mixerPort },
  {
    autoreconnect: true,
    logLevel: "fatal",
  }
);

let connectPromise;
let connectedAt = null;
const inputSignals = new Map();
const signalHistory = new Map();

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
      client.meterSubscribe().catch((error) => {
        console.error("Unable to subscribe to StudioLive meters:", error.message);
      });
      return client;
    });
  }

  return connectPromise;
}

client.on("meter", (data) => {
  const inputMeters = data[0];
  if (!Array.isArray(inputMeters)) return;

  inputMeters.forEach((rawValue, index) => {
    const channel = index + 1;
    const signal = Math.max(0, Number(rawValue) || 0);
    const history = signalHistory.get(channel) || [];

    inputSignals.set(channel, signal);
    history.push(signal);

    if (history.length > historySize) {
      history.splice(0, history.length - historySize);
    }

    signalHistory.set(channel, history);
  });
});

function normalizeSignal(value) {
  return Math.min(100, Math.round((value / signalScale) * 100));
}

function readChannels(count) {
  return Array.from({ length: count }, (_, index) => {
    const channel = index + 1;
    const channelSelector = selector(channel);
    const signal = inputSignals.get(channel) ?? 0;
    const history = signalHistory.get(channel) || [];
    const recentPeak = Math.max(signal, ...history);

    return {
      slot: channel,
      channel,
      mute: client.getMute(channelSelector),
      level: client.getLevel(channelSelector),
      signal,
      signalPercent: normalizeSignal(signal),
      recentPeak,
      hasSignal: recentPeak > signalThreshold,
      signalHistory: history.map(normalizeSignal),
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
