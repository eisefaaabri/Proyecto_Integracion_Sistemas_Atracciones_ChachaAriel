# Etapa 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Etapa 2: Producción
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /usr/src/app/dist ./dist

# Asignar entorno de producción
ENV NODE_ENV=production
ENV PORT=3000

# Usuario no root por seguridad (DevSecOps)
USER node

EXPOSE 3000

CMD ["node", "dist/main"]
