import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitQuoteRequest } from "@/lib/catalogue-client";
import type { CatalogueProduct } from "@/lib/catalogue-types";

export function QuoteRequestDialog({
  product,
  trigger,
}: {
  product: CatalogueProduct;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get("full_name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    if (!full_name || !email) {
      toast.error("Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      await submitQuoteRequest(product, {
        full_name,
        email,
        phone: String(fd.get("phone") ?? "").trim() || undefined,
        travel_month: String(fd.get("travel_month") ?? "").trim() || undefined,
        party_size: Number(fd.get("party_size")) || undefined,
        budget: String(fd.get("budget") ?? "").trim() || undefined,
        message: String(fd.get("message") ?? "").trim() || undefined,
      });
      toast.success("Quote request received — a specialist replies within 24 hours.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Request a quotation</DialogTitle>
          <DialogDescription>
            {product.title} — {product.location}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" name="full_name" required autoComplete="name" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" autoComplete="tel" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="travel_month">Travel month</Label>
              <Input id="travel_month" name="travel_month" placeholder="March 2027" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party_size">Travellers</Label>
              <Input
                id="party_size"
                name="party_size"
                type="number"
                min={1}
                max={40}
                defaultValue={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budget">Budget</Label>
              <Input id="budget" name="budget" placeholder="$25,000" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="message">Anything we should know?</Label>
            <Textarea
              id="message"
              name="message"
              rows={4}
              placeholder="Occasion, preferences, must-sees…"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
