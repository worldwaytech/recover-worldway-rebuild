# Worldway Travels Group production container
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# The repository has mixed transitive requirements for entities. Keep dependency
# versions at their declared dependency scope instead of relying on npm hoisting.
# package-lock is intentionally not rewritten during the image build.
RUN npm install -g npm@12.2.0 && npm install --no-audit --no-fund --package-lock=false

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

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", ".output/server/index.mjs"]
