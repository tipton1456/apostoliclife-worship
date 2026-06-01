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

async function getWorshipTeam() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/worship-team`, {
    cache: "no-store",
  });

  return res.json();
}

export default async function Home() {
  const data = await getWorshipTeam();

  return (
    <main className="w-screen h-screen overflow-hidden bg-black text-white p-6">
	
     <h1 className="text-6xl font-black text-center uppercase mb-2 text-[#7bbc07] tracking-wide">
        Apostolic Worship Mic Board
      </h1>

      <h2 className="text-2xl text-center mb-10 text-gray-300">
        {data.serviceName} - {data.planTitle}
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
            <div className="w-[160px] h-[360px] bg-neutral-800 overflow-hidden">
              {person.image ? (
			<img
			  src={`/team-photos/${photoFileName(person.name)}.jpg`}
			  alt={person.name}
			  className="w-full h-full object-cover object-center translate-x-2"
			/>
              ) : (
                <span className="text-gray-500 text-xl">Photo</span>
              )}
            </div>

			<div className="p-4 min-h-24 flex items-center justify-center text-3xl font-medium leading-tight">
			  {person.name || "Unassigned"}
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