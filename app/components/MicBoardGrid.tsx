"use client";

import { useEffect, useMemo, useState } from "react";
import PresonusChannelStatus, { type ChannelState } from "./PresonusChannelStatus";

export type TeamMember = {
  slot: number;
  name: string;
  position: string;
  image: string | null;
  status: string;
};

type BridgeResponse = {
  channels?: ChannelState[];
};

const SLOT_COUNT = 8;
const BRIDGE_URLS = (
  process.env.NEXT_PUBLIC_PRESONUS_BRIDGE_URL ||
  "https://iBatMac.local:4310,http://localhost:4310"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

function photoFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function planningStatusClass(status: string) {
  if (status === "C") return "text-green-500";
  if (status === "D") return "text-red-500";
  if (!status) return "text-gray-600";
  return "text-yellow-500";
}

function cardStateClass(channel: ChannelState | null, isOnline: boolean) {
  if (!isOnline || !channel) return "border-gray-700";
  if (channel.mute === true) return "border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.22)]";
  if (channel.hasSignal === false) return "border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.16)]";
  const signal = Math.min(100, Math.max(0, channel.signalPercent || 0));
  if (signal >= 70) return "border-green-300 shadow-[0_0_30px_rgba(34,197,94,0.36)]";
  if (signal >= 35) return "border-green-400 shadow-[0_0_24px_rgba(34,197,94,0.26)]";
  return "border-green-500/70 shadow-[0_0_18px_rgba(34,197,94,0.16)]";
}

function fillSlots(team: TeamMember[]) {
  const bySlot = new Map(team.map((person) => [person.slot, person]));

  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const slot = index + 1;
    return (
      bySlot.get(slot) || {
        slot,
        name: "",
        position: String(slot),
        image: null,
        status: "",
      }
    );
  });
}

export default function MicBoardGrid({ team }: { team: TeamMember[] }) {
  const slots = useMemo(() => fillSlots(team), [team]);
  const [channels, setChannels] = useState<ChannelState[]>([]);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      let data: BridgeResponse | null = null;

      for (const bridgeUrl of BRIDGE_URLS) {
        try {
          const res = await fetch(`${bridgeUrl}/channels?count=${SLOT_COUNT}`, {
            cache: "no-store",
          });

          if (!res.ok) continue;

          data = (await res.json()) as BridgeResponse;
          break;
        } catch {
          continue;
        }
      }

      if (!isMounted) return;

      setChannels(data?.channels || []);
      setIsOnline(Boolean(data?.channels?.length));
    }

    loadChannels();
    const interval = window.setInterval(loadChannels, 1500);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div
        className={`absolute right-0 top-0 z-10 rounded-bl-md px-3 py-1 text-xs font-bold uppercase ${
          isOnline ? "bg-green-500 text-black" : "bg-neutral-800 text-gray-400"
        }`}
      >
        {isOnline ? "Board Online" : "Board Offline"}
      </div>

      <div
        className="grid h-full w-full gap-3"
        style={{
          gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))`,
        }}
      >
        {slots.map((person) => {
          const channel =
            channels.find((item) => item.slot === person.slot) || null;
          const hasPhoto = Boolean(person.image && person.name);

          return (
            <div
              key={person.slot}
              className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border-2 bg-neutral-900 text-center ${cardStateClass(
                channel,
                isOnline
              )}`}
            >
              <div className="flex min-h-0 flex-1 items-start justify-center overflow-hidden bg-neutral-800">
                {hasPhoto ? (
                  <img
                    src={`/team-photos/${photoFileName(person.name)}.jpg`}
                    alt={person.name}
                    className="h-full w-full translate-x-2 object-cover object-top"
                  />
                ) : (
                  <span className="mt-10 text-xl text-gray-600">Unassigned</span>
                )}
              </div>

              <div className="min-h-12 bg-neutral-950 px-3 py-2 text-gray-100">
                <div className="flex items-center justify-center gap-2 text-base font-semibold leading-tight">
                  <span className="tabular-nums text-gray-400">{person.position}</span>
                  <span className="text-gray-600">|</span>
                  <span className="min-w-0 truncate">
                    {person.name || "Unassigned"}
                  </span>
                  <span className="text-gray-600">|</span>
                  <span className={planningStatusClass(person.status)}>●</span>
                </div>
              </div>

              <PresonusChannelStatus channel={channel} isOnline={isOnline} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
