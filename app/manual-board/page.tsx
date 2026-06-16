"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PresonusChannelStatus from "../components/PresonusChannelStatus";

type TeamMember = {
  slot: number;
  name: string;
  position: string;
  image: string | null;
  status: string;
};

function photoFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function ManualBoardContent() {
  const searchParams = useSearchParams();

  const serviceTypeId = searchParams.get("serviceTypeId");
  const planId = searchParams.get("planId");

  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!serviceTypeId || !planId) return;

    fetch(
      `/api/worship-team-by-plan?serviceTypeId=${serviceTypeId}&planId=${planId}`
    )
      .then((r) => r.json())
      .then((result) => setData(result));
  }, [serviceTypeId, planId]);

  if (!data) {
    return <div className="text-white p-10">Loading...</div>;
  }

  return (
    <main className="w-screen h-screen max-w-[1920px] max-h-[1080px] mx-auto overflow-hidden bg-black text-white p-4 flex flex-col">
      <h1 className="text-5xl font-black text-center uppercase mb-2 text-[#7bbc07]">
        Apostolic Worship Mic Board
      </h1>

      <h2 className="text-xl text-center mb-4 text-gray-300">
        {data.planTitle}
      </h2>

		<div
		  className="grid gap-3 w-full flex-1 min-h-0"
		  style={{
		    gridTemplateColumns: `repeat(${data.team.length}, minmax(0, 1fr))`,
		  }}
		>
        {data.team.map((person: TeamMember) => (
          <div
            key={person.slot}
           className="w-full h-full min-h-0 border border-gray-700 rounded-xl overflow-hidden text-center bg-neutral-900 flex flex-col"
          >
            <div className="w-full flex-1 min-h-0 bg-neutral-800 overflow-hidden">
              <img
                src={`/team-photos/${photoFileName(person.name)}.jpg`}
                alt={person.name}
                className="w-full h-full object-cover object-top"
              />
            </div>

            <div className="min-h-12 bg-neutral-950 px-3 py-2 text-gray-100">
              <div className="flex items-center justify-center gap-2 text-base font-semibold leading-tight">
                <span className="tabular-nums text-gray-400">{person.position}</span>
                <span className="text-gray-600">|</span>
                <span className="min-w-0 truncate">{person.name}</span>
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

export default function ManualBoardPage() {
  return (
    <Suspense fallback={<div className="text-white p-10">Loading...</div>}>
      <ManualBoardContent />
    </Suspense>
  );
}
