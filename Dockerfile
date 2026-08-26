FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
# The liquid-glass UI dependency publishes a consumer-facing postinstall hook
# that calls a development-only binary. Production builds do not need package
# lifecycle scripts, and disabling them also reduces supply-chain exposure.
RUN npm ci --ignore-scripts
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    YANGE_WEB_ROOT=/app/apps/web/dist

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.mjs"]
