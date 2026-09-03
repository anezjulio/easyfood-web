FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Variables usadas por Vite durante npm run build
ARG VITE_FAKE_API_URL
ARG VITE_USE_FAKE_API=true
ARG VITE_IMAGE_BASE_URL
ARG VITE_IMAGE_UPLOAD_URL
ARG VITE_ORDER_PENDING_TIMEOUT_MINUTES=15

ENV VITE_FAKE_API_URL=$VITE_FAKE_API_URL \
    VITE_USE_FAKE_API=$VITE_USE_FAKE_API \
    VITE_IMAGE_BASE_URL=$VITE_IMAGE_BASE_URL \
    VITE_IMAGE_UPLOAD_URL=$VITE_IMAGE_UPLOAD_URL \
    VITE_ORDER_PENDING_TIMEOUT_MINUTES=$VITE_ORDER_PENDING_TIMEOUT_MINUTES

RUN npm run build


FROM nginx:1.27-alpine AS production

COPY nginx.conf /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/images /usr/share/nginx/html/images

CMD ["nginx", "-g", "daemon off;"]