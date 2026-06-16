export type ChannelState = {
  slot: number;
  channel: number;
  mute: boolean | null;
  level: number | null;
  signalPercent?: number;
  hasSignal?: boolean;
  signalHistory?: number[];
};

export default function PresonusChannelStatus({
  channel,
  isOnline,
}: {
  channel: ChannelState | null;
  isOnline: boolean;
}) {
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
  const currentSignal = Math.min(100, Math.max(0, channel.signalPercent || 0));
  const peakSignal = Math.min(100, Math.max(currentSignal, ...history));
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
  const meterColor = muted
    ? "bg-red-500"
    : currentSignal >= 82
      ? "bg-red-500"
      : currentSignal >= 58
        ? "bg-yellow-400"
        : hasSignal
          ? "bg-green-500"
          : "bg-yellow-400";
  const lineColor = muted
    ? "rgb(239 68 68)"
    : hasSignal
      ? "rgb(34 197 94)"
      : "rgb(250 204 21)";

  return (
    <div className="border-t border-gray-800 bg-black px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase">
        <span className={statusClass}>{statusText}</span>
        <span className="tabular-nums text-gray-500">{currentSignal}%</span>
      </div>
      <div className="mt-1 flex h-12 items-stretch gap-2">
        <svg
          className="h-full min-w-0 flex-1"
          viewBox="0 0 100 42"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 38H100" stroke="rgb(31 41 55)" strokeWidth="1" />
          <polyline
            fill="none"
            points={points}
            stroke={lineColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="relative h-full w-5 overflow-hidden rounded-sm bg-neutral-900 ring-1 ring-gray-800">
          <div className="absolute inset-x-0 bottom-0 bg-green-500/20" style={{ height: "58%" }} />
          <div className="absolute inset-x-0 bottom-[58%] bg-yellow-400/20" style={{ height: "24%" }} />
          <div className="absolute inset-x-0 top-0 bg-red-500/20" style={{ height: "18%" }} />
          <div
            className={`absolute inset-x-0 bottom-0 ${meterColor}`}
            style={{ height: `${currentSignal}%` }}
          />
          <div
            className="absolute left-0 right-0 h-[2px] bg-white"
            style={{ bottom: `${peakSignal}%` }}
          />
        </div>
      </div>
    </div>
  );
}
