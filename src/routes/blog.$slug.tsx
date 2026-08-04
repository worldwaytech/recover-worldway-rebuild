import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { blogPosts } from "@/lib/data";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = blogPosts.find((p) => p.slug === params.slug);
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Not found" }, { name: "robots", content: "noindex" }] };
    const p = loaderData.post;
    return {
      meta: [
        { title: `${p.title} | Worldway Luxe` },
        { name: "description", content: p.excerpt },
        { property: "og:title", content: p.title },
        { property: "og:description", content: p.excerpt },
        { property: "og:image", content: p.image },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `/blog/${p.slug}` },
      ],
      links: [{ rel: "canonical", href: `/blog/${p.slug}` }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: p.title, datePublished: p.date, image: p.image }),
      }],
    };
  },
  component: BlogPost,
});

function BlogPost() {
  const { post } = Route.useLoaderData();
  return (
    <main>
      <section className="relative h-[60vh] min-h-[420px] overflow-hidden">
        <img src={post.image} alt={post.title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/40 to-ink/80" />
        <div className="container-lux relative z-10 flex h-full flex-col items-start justify-end pb-16 text-primary-foreground">
          <p className="eyebrow mb-4 text-gold">{post.read}</p>
          <h1 className="max-w-3xl font-serif text-5xl md:text-6xl">{post.title}</h1>
        </div>
      </section>
      <section className="container-lux py-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-lg leading-relaxed text-muted-foreground">{post.body}</p>
          <div className="mt-12 flex gap-3">
            <Link to="/blog"><Button variant="outline-ink">← Back to Journal</Button></Link>
            <Link to="/contact"><Button variant="gold">Plan Your Journey</Button></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
