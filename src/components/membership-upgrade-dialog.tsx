import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";

export function MembershipUpgradeDialog({
  open,
  onOpenChange,
  reason = "ai",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason?: "ai" | "search";
}) {
  const isAi = reason === "ai";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="font-serif text-2xl text-primary">
            {isAi ? "An Elite privilege." : "Continue with a free account."}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isAi
              ? "AI Concierge and AI Trip Builder are reserved for Worldway Elite members — unlimited access, VIP luxury planning, and early access to premium experiences."
              : "You've used your complimentary search. Register for a free Traveler account to unlock unlimited searches, bookings, wishlist, and your personal dashboard."}
          </DialogDescription>
        </DialogHeader>
        {isAi ? (
          <ul className="space-y-2 rounded-xl border border-border/60 bg-background/50 p-4 text-sm text-muted-foreground">
            <li>· Unlimited AI Concierge & AI Trip Builder</li>
            <li>· VIP luxury travel concierge, human-assisted</li>
            <li>· Priority booking & personalized itineraries</li>
            <li>· Early access to exclusive luxury experiences</li>
            <li>· Highest-tier priority support</li>
          </ul>
        ) : null}
        <DialogFooter className="mt-2 gap-2 sm:justify-between">
          <Link
            to="/auth"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-border/60 px-5 py-2.5 text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-primary"
          >
            {isAi ? "Sign in" : "Register free"}
          </Link>
          <Link
            to="/membership"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-6 py-2.5 text-xs uppercase tracking-[0.25em] text-primary-foreground"
            style={{ background: "var(--gradient-gold)", boxShadow: "var(--shadow-glow)" }}
          >
            {isAi ? "Upgrade to Elite" : "View plans"}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
