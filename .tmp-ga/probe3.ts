const key = process.env.TOURS_API_KEY!;
const r0 = await fetch("https://rest.gadventures.com/", { headers: { "X-Application-Key": key, Accept:"application/json" }});
const j = await r0.json() as { links: {resource:string}[] };
console.log(j.links.map(l=>l.resource).join(", "));
