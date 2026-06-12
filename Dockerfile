FROM oven/bun:1.3.7-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN HUSKY=0 bun install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json vite.config.ts ./
COPY client ./client
COPY shared ./shared
COPY server ./server
RUN bun run build
RUN HUSKY=0 bun install --frozen-lockfile --production

FROM oven/bun:1.3.7-debian AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "start"]
