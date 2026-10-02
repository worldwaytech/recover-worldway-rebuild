# Worldway Travels Group production container
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# Resolve the dependency graph from package.json instead of allowing the stale
# package-lock transitive tree to force an incompatible parse5/entities layout.
# The lockfile is intentionally not rewritten inside the image build.
RUN npm install --no-audit --no-fund --package-lock=false

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN NITRO_PRESET=node-server npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# ECS can use this without requiring curl/wget in the image.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", ".output/server/index.mjs"]
