"use client";

import { useEffect, useState } from "react";

type ChannelState = {
  slot: number;
  channel: number;
  mute: boolean | null;
  level: number | null;
};

type BridgeResponse = {
  channels?: ChannelState[];
};

const BRIDGE_URL =
  process.env.NEXT_PUBLIC_PRESONUS_BRIDGE_URL || "http://localhost:4310";

export default function PresonusChannelStatus({ slot }: { slot: number }) {
  const [channel, setChannel] = useState<ChannelState | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadChannel() {
      try {
        const res = await fetch(`${BRIDGE_URL}/channels?count=8`, {
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Bridge unavailable");

        const data = (await res.json()) as BridgeResponse;
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
      <div className="border-t border-gray-800 bg-black px-3 py-2 text-xs font-semibold text-gray-500">
        Sound board offline
      </div>
    );
  }

  const level = channel?.level == null ? "--" : Math.round(channel.level);
  const muted = channel?.mute === true;

  return (
    <div className="border-t border-gray-800 bg-black px-3 py-2 text-xs font-semibold text-gray-300">
      <div className="flex items-center justify-between gap-2">
        <span className={muted ? "text-red-500" : "text-green-500"}>
          {muted ? "MUTED" : "LIVE"}
        </span>
        <span>LVL {level}</span>
      </div>
    </div>
  );
}
