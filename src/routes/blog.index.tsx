import { createFileRoute, Link } from "@tanstack/react-router";
import { blogPosts } from "@/lib/data";
import { SectionHeading } from "@/components/site";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Inspiration & Travel Journal | Worldway Luxe" },
      { name: "description", content: "Insights, guides and inspiration from our travel specialists — stories from the world's most extraordinary destinations." },
      { property: "og:title", content: "Inspiration & Travel Journal | Worldway Luxe" },
      { property: "og:url", content: "/blog" },
    ],
    links: [{ rel: "canonical", href: "/blog" }],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  return (
    <main className="pt-24">
      <section className="container-lux py-16">
        <SectionHeading eyebrow="The journal" title="Inspiration & insight" intro="Stories, guides and reflections from our specialists in the field." />
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {blogPosts.map((p) => (
            <Link key={p.slug} to="/blog/$slug" params={{ slug: p.slug }} className="group block">
              <div className="aspect-[4/3] overflow-hidden rounded-sm">
                <img src={mediaUrl(p.image)} alt={p.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
              <p className="mt-4 text-xs uppercase tracking-widest text-gold">{p.read}</p>
              <h3 className="mt-2 font-serif text-2xl group-hover:text-gold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{p.excerpt}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
