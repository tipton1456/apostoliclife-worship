import type { Metadata, Viewport } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Choir Sunday",
  description:
    "Choir Sunday — August 23rd. With special guests LifePoint Church and Tupelo Children's Mansion / Restoration Chapel. Practice schedule and vocal part helpers.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

const events = [
  {
    date: "August 20",
    items: [
      {
        time: "6:30 PM – 7:30 PM",
        title: "Vocal Practice",
        location: "Youth Sanctuary in the Family Life Center",
      },
    ],
  },
  {
    date: "August 23",
    items: [
      {
        time: "3:30 PM – 4:30 PM",
        title: "Band Practice",
        location: "Sanctuary",
      },
      {
        time: "4:30 PM – 5:30 PM",
        title: "Full Choir Practice",
        location: "Sanctuary",
      },
    ],
  },
] as const;

const songs = [
  {
    title: "Ask Me Why",
    artist: "David Jennings",
    filePrefix: "Ask Me Why",
  },
  {
    title: "Let the Alabaster Break",
    artist: "Indiana Bible College",
    filePrefix: "Alabaster Break",
  },
] as const;

const parts = ["Alto", "Tenor", "Soprano"] as const;

function partHref(filePrefix: string, part: (typeof parts)[number]) {
  return encodeURI(`/PART HELPERS/${filePrefix} - ${part}.mp3`);
}

export default function ChoirSundayPage() {
  return (
    <main className="relative min-h-dvh text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <Image
          src="/Choir4.jpeg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_28%] opacity-[0.38]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/72 to-black/92" />
        <div className="absolute inset-0 bg-[#7bbc07]/[0.07]" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col items-center overflow-x-hidden px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:max-w-3xl sm:px-8 lg:max-w-6xl lg:px-10">
        <div className="flex w-full max-w-full items-center justify-center gap-2 sm:gap-6 lg:gap-8">
          <Image
            src="/ApostolicWorship_DarkBackGround_Transparent.png"
            alt="Apostolic Worship"
            width={500}
            height={500}
            priority
            className="h-20 w-20 shrink-0 object-contain sm:h-36 sm:w-36 lg:h-44 lg:w-44"
          />
          <h1 className="min-w-0 text-left text-4xl font-black uppercase leading-[0.82] tracking-tight text-[#7bbc07] drop-shadow-[0_0_28px_rgba(123,188,7,0.5)] sm:text-7xl lg:text-8xl">
            Choir
            <br />
            Sunday
          </h1>
        </div>

        <p className="mt-5 text-center text-2xl font-semibold tracking-wide text-white sm:mt-7 sm:text-4xl">
          August 23rd
        </p>

        <div
          aria-hidden
          className="mt-5 h-px w-24 bg-gradient-to-r from-transparent via-[#7bbc07] to-transparent sm:w-40"
        />

        <h2 className="mt-5 w-full max-w-3xl text-center text-sm font-semibold leading-relaxed text-white/90 sm:text-xl">
          With Special Guests
          <span className="mt-1 block text-base font-bold text-white sm:text-2xl">
            LifePoint Church
          </span>
          <span className="mt-1 block text-[13px] font-medium leading-snug text-white/80 sm:text-lg">
            and Tupelo Children&apos;s Mansion
            <br className="sm:hidden" />
            <span className="hidden sm:inline"> </span>
            / Restoration Chapel
          </span>
        </h2>

        <section className="mt-10 w-full" aria-labelledby="schedule-heading">
          <h3
            id="schedule-heading"
            className="mb-3 text-center text-xs font-bold uppercase tracking-[0.28em] text-[#7bbc07] sm:text-sm"
          >
            Practice Schedule
          </h3>

          <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-5">
            {events.map((event) => (
              <li
                key={event.date}
                className="rounded-2xl border border-white/12 bg-black/55 px-4 py-4 shadow-lg shadow-black/30 backdrop-blur-md sm:px-6 sm:py-5"
              >
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#7bbc07]">
                  {event.date}
                </p>
                <ul className="mt-3 space-y-3">
                  {event.items.map((item) => (
                    <li
                      key={`${event.date}-${item.title}`}
                      className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0"
                    >
                      <p className="text-base font-bold leading-tight text-white sm:text-xl">
                        {item.title}
                      </p>
                      <p className="mt-1 text-[15px] font-medium text-white/90 sm:text-lg">
                        {item.time}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-white/70 sm:text-base">
                        {item.location}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 w-full lg:mt-10" aria-labelledby="songs-heading">
          <h3
            id="songs-heading"
            className="mb-3 text-center text-xs font-bold uppercase tracking-[0.28em] text-[#7bbc07] sm:text-sm"
          >
            Songs
          </h3>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-5">
            {songs.map((song) => (
              <article
                key={song.title}
                className="rounded-2xl border border-white/12 bg-black/55 px-3 py-5 shadow-lg shadow-black/30 backdrop-blur-md sm:px-6"
              >
                <h4 className="text-center text-xl font-bold leading-tight text-white sm:text-2xl">
                  {song.title}
                </h4>
                <p className="mt-1 text-center text-sm text-white/65 sm:text-base">
                  {song.artist}
                </p>

                <nav
                  aria-label={`${song.title} vocal parts`}
                  className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"
                >
                  {parts.map((part) => (
                    <a
                      key={part}
                      href={partHref(song.filePrefix, part)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-14 min-w-0 items-center justify-center rounded-xl border border-[#7bbc07]/50 bg-[#7bbc07]/15 px-3 text-base font-bold text-[#7bbc07] transition-colors active:bg-[#7bbc07]/30"
                    >
                      {part}
                    </a>
                  ))}
                </nav>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
