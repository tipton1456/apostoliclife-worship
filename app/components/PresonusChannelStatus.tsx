"use client";

import { useEffect, useState } from "react";

type ChannelState = {
  slot: number;
  channel: number;
  mute: boolean | null;
  level: number | null;
  signalPercent?: number;
  hasSignal?: boolean;
  signalHistory?: number[];
};

type BridgeResponse = {
  channels?: ChannelState[];
};

const BRIDGE_URLS = (
  process.env.NEXT_PUBLIC_PRESONUS_BRIDGE_URL ||
  "https://iBatMac.local:4310,http://localhost:4310"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

export default function PresonusChannelStatus({ slot }: { slot: number }) {
  const [channel, setChannel] = useState<ChannelState | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadChannel() {
      try {
        let data: BridgeResponse | null = null;

        for (const bridgeUrl of BRIDGE_URLS) {
          try {
            const res = await fetch(`${bridgeUrl}/channels?count=8`, {
              cache: "no-store",
            });

            if (!res.ok) continue;

            data = (await res.json()) as BridgeResponse;
            break;
          } catch {
            continue;
          }
        }

        if (!data) throw new Error("Bridge unavailable");

        const nextChannel =
          data.channels?.find((item) => item.slot === slot) || null;

        if (isMounted) {
          setChannel(nextChannel);
          setIsOnline(Boolean(nextChannel));
        }
      } catch {
        if (isMounted) {
          setIsOnline(false);
          setChannel(null);
        }
      }
    }

    loadChannel();
    const interval = window.setInterval(loadChannel, 1500);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [slot]);

  if (!isOnline || !channel) {
    return (
      <div className="border-t border-gray-800 bg-black px-3 py-2 text-xs font-semibold uppercase text-gray-500">
        Sound board offline
      </div>
    );
  }

  const muted = channel?.mute === true;
  const hasSignal = channel.hasSignal === true;
  const history = channel.signalHistory?.length
    ? channel.signalHistory
    : Array.from({ length: 24 }, () => 0);
  const statusText = muted ? "Muted" : hasSignal ? "Signal" : "No signal";
  const statusClass = muted
    ? "text-red-500"
    : hasSignal
      ? "text-green-500"
      : "text-yellow-400";
  const points = history
    .map((value, index) => {
      const x = (index / Math.max(history.length - 1, 1)) * 100;
      const y = 28 - (Math.min(100, Math.max(0, value)) / 100) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="border-t border-gray-800 bg-black px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase">
        <span className={statusClass}>{statusText}</span>
        <span className="text-gray-500">Input</span>
      </div>
      <svg
        className="mt-1 h-7 w-full"
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 28H100" stroke="rgb(31 41 55)" strokeWidth="1" />
        <polyline
          fill="none"
          points={points}
          stroke={muted ? "rgb(239 68 68)" : hasSignal ? "rgb(34 197 94)" : "rgb(250 204 21)"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
