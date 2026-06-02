FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/frontoffice/package.json apps/frontoffice/package.json
RUN npm install --workspace apps/frontoffice

FROM node:25-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontoffice/node_modules ./apps/frontoffice/node_modules
COPY package.json ./
COPY apps/frontoffice apps/frontoffice
WORKDIR /app/apps/frontoffice
RUN npm run build

FROM node:25-alpine
WORKDIR /app/apps/frontoffice
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/apps/frontoffice/.next/standalone ./
COPY --from=build /app/apps/frontoffice/.next/static ./apps/frontoffice/.next/static
COPY --from=build /app/apps/frontoffice/public ./apps/frontoffice/public
EXPOSE 3000
CMD ["node", "apps/frontoffice/server.js"]
