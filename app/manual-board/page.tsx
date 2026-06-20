"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MicBoardGrid, { type TeamMember } from "../components/MicBoardGrid";

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

      <div className="flex-1 min-h-0">
        <MicBoardGrid
          team={(data.team || []) as TeamMember[]}
          teamRefreshUrl={`/api/worship-team-by-plan?serviceTypeId=${serviceTypeId}&planId=${planId}`}
        />
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
