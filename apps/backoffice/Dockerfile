FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backoffice/package.json apps/backoffice/package.json
RUN npm install --workspace apps/backoffice

FROM node:25-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:5000
ARG VITE_FRONTOFFICE_ORIGIN=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_FRONTOFFICE_ORIGIN=$VITE_FRONTOFFICE_ORIGIN
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backoffice/node_modules ./apps/backoffice/node_modules
COPY package.json ./
COPY apps/backoffice apps/backoffice
COPY apps/frontoffice apps/frontoffice
WORKDIR /app/apps/backoffice
RUN npm run build

FROM node:25-alpine
WORKDIR /app/apps/backoffice
RUN npm install -g serve
COPY --from=build /app/apps/backoffice/dist ./dist
EXPOSE 3001
CMD ["serve", "-s", "dist", "-l", "3001"]
