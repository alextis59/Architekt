# syntax=docker/dockerfile:1.6

FROM node:20-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/domain/package.json packages/domain/
COPY packages/frontend/package.json packages/frontend/

RUN npm install

COPY . .

RUN npm run build && npm prune --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=base /app/package.json ./
COPY --from=base /app/package-lock.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages

EXPOSE 8080
CMD ["node", "packages/backend/dist/index.js"]
