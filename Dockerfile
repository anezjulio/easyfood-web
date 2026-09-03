FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

ARG VITE_USE_FAKE_API=true
ARG VITE_ORDER_PENDING_TIMEOUT_MINUTES=15

ENV NODE_ENV=production
ENV VITE_USE_FAKE_API=$VITE_USE_FAKE_API
ENV VITE_ORDER_PENDING_TIMEOUT_MINUTES=$VITE_ORDER_PENDING_TIMEOUT_MINUTES

RUN npm run build

CMD ["sh", "-c", "npm start -- --host 0.0.0.0 --port ${PORT}"]
