import type { Viewport } from "next";
import { headers } from "next/headers";
import WorshipLogo from "@/app/worship-logo";
import MicBoardGrid, { type TeamMember } from "../components/MicBoardGrid";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0c14",
};

type WorshipTeamResponse = {
  serviceName?: string;
  planTitle?: string | null;
  team?: TeamMember[];
  error?: string;
  message?: string;
};

function protocolForHost(host: string | null) {
  if (!host) return "https";

  const hostname = host.split(":")[0];
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  return isLocalHost ? "http" : "https";
}

async function getWorshipTeam() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = protocolForHost(host);
  const localSiteUrl = host ? `${protocol}://${host}` : "";
  const siteUrl =
    protocol === "http"
      ? localSiteUrl
      : process.env.NEXT_PUBLIC_SITE_URL || localSiteUrl;

  const res = await fetch(`${siteUrl}/api/worship-team`, {
    cache: "no-store",
  });

  return res.json() as Promise<WorshipTeamResponse>;
}

export default async function MicBoardPage() {
  const data = await getWorshipTeam();
  const team = Array.isArray(data.team) ? data.team : [];
  const statusMessage = data.error || data.message || null;

  if (statusMessage) {
    return (
      <main className="mx-auto flex h-screen w-screen max-h-[1920px] max-w-[1080px] flex-col items-center justify-center overflow-hidden bg-black p-6 text-center text-white">
        <WorshipLogo href={null} className="mb-6 h-12 w-auto" />
        <h1 className="mb-6 text-5xl font-black uppercase tracking-wide text-[#c9d3f7]">
          Mic Board
        </h1>
        <div className="text-3xl font-semibold mb-3">Unable to load worship team</div>
        <p className="text-xl text-gray-300 max-w-3xl">{statusMessage}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen w-screen max-h-[1920px] max-w-[1080px] flex-col overflow-hidden bg-black px-4 pb-4 text-white">
      <div className="flex justify-center py-2">
        <WorshipLogo href={null} className="h-8 w-auto" />
      </div>
      <div className="min-h-0 flex-1">
        <MicBoardGrid
          team={team}
          teamRefreshUrl="/api/worship-team"
          columns={4}
        />
      </div>
    </main>
  );
}
