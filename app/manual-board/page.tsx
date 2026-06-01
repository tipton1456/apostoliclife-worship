"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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

export default function ManualBoardPage() {
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
    return (
      <div className="text-white p-10">
        Loading...
      </div>
    );
  }

  return (
    <main className="w-screen h-screen overflow-hidden bg-black text-white p-6">

      <h1 className="text-5xl font-black text-center uppercase mb-2 text-[#7bbc07]">
        Apostolic Worship Mic Board
      </h1>

      <h2 className="text-2xl text-center mb-10 text-gray-300">
        {data.planTitle}
      </h2>

      <div
        className="grid gap-4 justify-center"
        style={{
          gridTemplateColumns: `repeat(${data.team.length}, 180px)`,
        }}
      >
        {data.team.map((person: TeamMember) => (
          <div
            key={person.slot}
            className="w-[180px] border border-gray-700 rounded-xl overflow-hidden text-center bg-neutral-900"
          >
            <div className="w-[180px] h-[405px] bg-neutral-800 overflow-hidden">
              <img
                src={`/team-photos/${photoFileName(person.name)}.jpg`}
                alt={person.name}
                className="w-full h-full object-cover object-center"
              />
            </div>

            <div className="p-4 min-h-24 flex items-center justify-center text-3xl font-medium leading-tight">
              {person.name}
            </div>

            <div className="p-3 bg-neutral-950 text-xl text-gray-300 min-h-16 flex flex-col items-center justify-center font-semibold">
              <div>{person.position}</div>

              <div className="mt-2 text-2xl">
                {person.status === "C" ? (
                  <span className="text-green-500">●</span>
                ) : person.status === "D" ? (
                  <span className="text-red-500">●</span>
                ) : (
                  <span className="text-yellow-500">●</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}