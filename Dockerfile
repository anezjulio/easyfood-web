FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

ENV NODE_ENV=production

CMD ["sh", "-c", "npm start -- --host 0.0.0.0 --port ${PORT}"]