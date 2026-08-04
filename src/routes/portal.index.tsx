import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/PortalShell";
import { Plane, MapPin, Heart, MessageCircle, CreditCard, User, Bell, FileText, Shield, Sliders, Star, Users } from "lucide-react";

const portalNav = [
  { label: "Overview", to: "/portal", exact: true },
  { label: "Profile", to: "/portal/profile" },
  { label: "Travelers", to: "/portal/travelers" },
  { label: "Wishlist", to: "/portal/wishlist" },
  { label: "Documents", to: "/portal/documents" },
  { label: "Notifications", to: "/portal/notifications" },
  { label: "Preferences", to: "/portal/preferences" },
  { label: "Security", to: "/portal/security" },
  { label: "Support", to: "/portal/support" },
];

export const Route = createFileRoute("/portal/")({
  head: () => ({ meta: [{ title: "Guest Portal | Worldway Luxe" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <PortalShell
      eyebrow="For our guests"
      title="Guest Portal"
      intro="Your bookings, documents, itineraries and preferences — synchronised across every device."
      nav={portalNav}
      tiles={[
        { icon: Plane, title: "Upcoming journeys", text: "Full itineraries, flight status and destination briefings." },
        { icon: MapPin, title: "Live trip companion", text: "Offline day-by-day plan, contacts and reservations." },
        { icon: Heart, title: "Wishlist", text: "Saved destinations, journeys and properties.", to: "/portal/wishlist" },
        { icon: MessageCircle, title: "Concierge chat", text: "Direct line to your specialist and 24/7 support." },
        { icon: CreditCard, title: "Wallet", text: "Deposits, payments, invoices and refunds.", to: "/wallet" },
        { icon: User, title: "Profile", text: "Personal information and travel identity.", to: "/portal/profile" },
        { icon: Users, title: "Travelers", text: "Traveling companions, passports and preferences.", to: "/portal/travelers" },
        { icon: FileText, title: "Documents", text: "Vouchers, tickets, visas and travel insurance.", to: "/portal/documents" },
        { icon: Bell, title: "Notifications", text: "Departure alerts, gate changes and status updates.", to: "/portal/notifications" },
        { icon: Sliders, title: "Preferences", text: "Dietary, seating, room and honeymoon preferences.", to: "/portal/preferences" },
        { icon: Shield, title: "Security", text: "Password, MFA and active session control.", to: "/portal/security" },
        { icon: Star, title: "Reviews", text: "Rate your journeys and share private feedback.", to: "/portal/reviews" },
      ]}
    />
  ),
});

export { portalNav };
