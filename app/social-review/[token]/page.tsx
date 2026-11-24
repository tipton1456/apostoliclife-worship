import ReviewPanel from "@/app/social-review/review-panel";
import WorshipLogo from "@/app/worship-logo";

export const metadata = { title: "Approve photos" };

export default async function SocialReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <main className="min-h-[100dvh] bg-black px-4 py-4 text-white sm:px-6">
      <header className="mx-auto mb-6 w-full max-w-3xl">
        <WorshipLogo href="/home" className="h-9 w-auto" />
      </header>
      <ReviewPanel endpoint={`/api/social-review/${encodeURIComponent(token)}`} />
    </main>
  );
}
