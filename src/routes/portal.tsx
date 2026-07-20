import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "./agent";
import { Plane, MapPin, Heart, MessageCircle, CreditCard, User } from "lucide-react";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Guest Portal | Worldway Luxe" },
      { name: "description", content: "Manage your journeys, documents, itineraries and preferences in the Worldway guest portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <PortalShell
      eyebrow="For our guests"
      title="Guest Portal"
      intro="Your bookings, documents, itineraries and preferences — synchronised across every device."
      tiles={[
        { icon: Plane, title: "Upcoming journeys", text: "Full itineraries, flight status and destination briefings." },
        { icon: MapPin, title: "Live trip companion", text: "Offline day-by-day plan, contacts and reservations while you're away." },
        { icon: Heart, title: "Wishlist", text: "Save destinations, journeys and properties to plan next." },
        { icon: MessageCircle, title: "Concierge chat", text: "Direct line to your specialist and 24/7 in-country support." },
        { icon: CreditCard, title: "Wallet", text: "Deposits, payments, invoices and refunds — all in one place." },
        { icon: User, title: "Profile & preferences", text: "Dietary, medical, seating, room and honeymoon preferences." },
      ]}
    />
  ),
});
