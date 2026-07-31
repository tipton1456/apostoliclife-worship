import { headers } from "next/headers";
import MicBoardGrid, { type TeamMember } from "../components/MicBoardGrid";

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
      <main className="w-screen h-screen max-w-[1920px] max-h-[1080px] mx-auto overflow-hidden bg-black text-white p-6 flex flex-col items-center justify-center text-center">
        <h1 className="text-6xl font-black uppercase mb-6 text-[#7bbc07] tracking-wide">
          Apostolic Worship Mic Board
        </h1>
        <div className="text-3xl font-semibold mb-3">Unable to load worship team</div>
        <p className="text-xl text-gray-300 max-w-3xl">{statusMessage}</p>
      </main>
    );
  }

  return (
    <main className="w-screen h-screen max-w-[1920px] max-h-[1080px] mx-auto overflow-hidden bg-black text-white p-4">
      <MicBoardGrid team={team} teamRefreshUrl="/api/worship-team" />
    </main>
  );
}
