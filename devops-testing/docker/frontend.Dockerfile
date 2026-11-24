# Frontend image (React + Vite built to static files, served by nginx). Build context = repo root.
FROM node:20-slim AS build
WORKDIR /app/Frontend
COPY Frontend/package*.json ./
RUN npm ci
COPY Frontend/ ./
# VITE_* values are baked in at build time
ARG VITE_API_URL=http://localhost:4000/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY devops-testing/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/Frontend/dist /usr/share/nginx/html
EXPOSE 80
