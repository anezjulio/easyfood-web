# =========================
# Build Vite application
# =========================

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# Dejar que Vite tome las variables desde:
# .env
# .env.production
# etc.
#
# No forzamos VITE_* vacías desde Docker.

RUN npm run build


# =========================
# Production Nginx
# =========================

FROM nginx:1.27-alpine AS production

# Railway necesita sustituir ${PORT}
COPY nginx.conf /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

# Copiar imágenes solamente si existe esta carpeta en tu proyecto
COPY --from=build /app/images /usr/share/nginx/html/images

CMD ["nginx", "-g", "daemon off;"]