# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=4000 DB_PATH=/app/storage/db.json
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY data ./data
RUN mkdir -p /app/storage && chown -R node:node /app
USER node
EXPOSE 4000
VOLUME ["/app/storage"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/src/server.js"]
