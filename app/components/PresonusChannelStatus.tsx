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
