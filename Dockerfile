FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_USE_FAKE_API=true
ARG VITE_ORDER_PENDING_TIMEOUT_MINUTES=15

ENV VITE_USE_FAKE_API=$VITE_USE_FAKE_API
ENV VITE_FAKE_API_URL=""
ENV VITE_IMAGE_BASE_URL=""
ENV VITE_IMAGE_UPLOAD_URL=""
ENV VITE_ORDER_PENDING_TIMEOUT_MINUTES=$VITE_ORDER_PENDING_TIMEOUT_MINUTES

RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_ROOT=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/mock-api ./mock-api
COPY --from=build /app/images ./images
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist-server/index.js"]
