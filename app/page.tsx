type TeamMember = {
  slot: number;
  name: string;
  position: string;
  image: string | null;
  status: string;
};

async function getWorshipTeam() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/worship-team`, {
    cache: "no-store",
  });

  return res.json();
}

export default async function Home() {
  const data = await getWorshipTeam();

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(() => window.location.reload(), 1800000);`,
        }}
      />

      <h1 className="text-5xl font-bold text-center uppercase mb-2">
        Apostolic Worship Mic Board
      </h1>

      <h2 className="text-2xl text-center mb-10 text-gray-300">
        {data.serviceName} - {data.planTitle}
      </h2>

      <div className="grid grid-cols-8 gap-4">
        {data.team.map((person: TeamMember) => (
          <div
            key={person.slot}
            className="border border-gray-700 rounded-xl overflow-hidden text-center bg-neutral-900"
          >
            <div className="aspect-square bg-neutral-800 flex items-center justify-center">
              {person.image ? (
                <img
                  src={person.image}
                  alt={person.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-500 text-xl">Photo</span>
              )}
            </div>

            <div className="p-4 min-h-24 flex items-center justify-center text-2xl font-bold">
              {person.name || "Unassigned"}
            </div>

            <div className="p-3 bg-neutral-950 text-lg text-gray-300 min-h-16 flex items-center justify-center">
              {person.position}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}