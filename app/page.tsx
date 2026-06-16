import { headers } from "next/headers";
import PresonusChannelStatus from "./components/PresonusChannelStatus";

type TeamMember = {
  slot: number;
  name: string;
  position: string;
  image: string | null;
  status: string;
};

type WorshipTeamResponse = {
  serviceName?: string;
  planTitle?: string | null;
  team?: TeamMember[];
  error?: string;
  message?: string;
};

function photoFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getWorshipTeam() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = host?.includes("localhost") ? "http" : "https";
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || (host ? `${protocol}://${host}` : "");

  const res = await fetch(`${siteUrl}/api/worship-team`, {
    cache: "no-store",
  });

  return res.json() as Promise<WorshipTeamResponse>;
}

export default async function Home() {
  const data = await getWorshipTeam();
  const team = Array.isArray(data.team) ? data.team : [];
  const statusMessage =
    data.error || data.message || (team.length === 0 ? "No worship team found." : null);

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
		 <div
		  className="grid gap-3 w-full h-full"
		  style={{
		    gridTemplateColumns: `repeat(${team.length}, minmax(0, 1fr))`,
		  }}
		>
        {team.map((person: TeamMember) => (
          <div
			  key={person.slot}
			  className="w-full h-full min-h-0 border border-gray-700 rounded-xl overflow-hidden text-center bg-neutral-900 flex flex-col"
			>
            <div className="w-full flex-1 min-h-0 bg-neutral-800 overflow-hidden">
              {person.image ? (
			<img
			  src={`/team-photos/${photoFileName(person.name)}.jpg`}
			  alt={person.name}
			  className="w-full h-full object-cover object-top translate-x-2"
			/>
              ) : (
                <span className="text-gray-500 text-xl">Photo</span>
              )}
            </div>

			<div className="min-h-12 bg-neutral-950 px-3 py-2 text-gray-100">
			  <div className="flex items-center justify-center gap-2 text-base font-semibold leading-tight">
			    <span className="tabular-nums text-gray-400">{person.position}</span>
			    <span className="text-gray-600">|</span>
			    <span className="min-w-0 truncate">{person.name || "Unassigned"}</span>
			    <span className="text-gray-600">|</span>
			    {person.status === "C" ? (
			      <span className="text-green-500">●</span>
			    ) : person.status === "D" ? (
			      <span className="text-red-500">●</span>
			    ) : (
			      <span className="text-yellow-500">●</span>
			    )}
			  </div>
			</div>
            <PresonusChannelStatus slot={person.slot} />
          </div>
        ))}
      </div>
    </main>
  );
}
