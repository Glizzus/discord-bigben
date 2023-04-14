FROM node:18-alpine AS build

WORKDIR /usr
COPY .env tsconfig.json package*.json ./
COPY src ./src
RUN npm install && npm ci && npm run build

FROM node:18-alpine
WORKDIR /usr
COPY package.json ./
RUN npm install --only=production
COPY --from=build /usr/dist .
CMD ["node", "-r", "dotenv/config", "index.js"]