FROM node:18-alpine AS build

WORKDIR /usr/src/app

# Run this early for caching
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:18-alpine

WORKDIR /usr/src/app

# Run installation early for caching
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/dist ./
ENTRYPOINT [ "node", "cli.js" ]
