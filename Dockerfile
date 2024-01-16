FROM node:18-alpine AS build

WORKDIR /usr
COPY .env tsconfig.json package*.json ./
COPY src ./src

# Seperate these steps to take advantage of Docker caching
RUN npm install && npm ci
RUN npm run build

FROM node:18
WORKDIR /usr
COPY package.json ./
RUN npm install --only=production
COPY --from=build /usr/dist .
CMD ["node", "-r", "dotenv/config", "index.js"]