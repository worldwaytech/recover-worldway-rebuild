import { createFileRoute, Link } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { portalNav } from "./portal.index";
import { EmptyState } from "@/components/enterprise";
import { useWishlist } from "@/hooks/use-wishlist";
import { journeys } from "@/lib/data";
import { JourneyCard } from "@/components/site";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist | Guest Portal" }, { name: "robots", content: "noindex" }] }),
  component: Wishlist,
});

function Wishlist() {
  const { ids, hydrated, clear } = useWishlist();
  const saved = journeys.filter((j) => ids.includes(j.slug));

  return (
    <PortalShell eyebrow="Saved" title="Wishlist" intro="Journeys and destinations you've saved on this device." nav={portalNav}>
      {!hydrated ? null : saved.length === 0 ? (
        <EmptyState
          title="Your wishlist is empty"
          text="Tap the heart on any journey to save it here."
          action={<Link to="/journeys"><Button variant="gold">Browse journeys</Button></Link>}
        />
      ) : (
        <div>
          <div className="mb-6 flex justify-end">
            <Button variant="outline-ink" onClick={clear}>Clear wishlist</Button>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((j) => <JourneyCard key={j.slug} journey={j} />)}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
