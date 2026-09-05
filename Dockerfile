# ===== 1. Frontend Build =====
FROM node:24-alpine AS frontend-build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build



# ===== 2. Python Build =====
FROM python:3.14-alpine3.24 AS backend-build

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install pip build dependencies
RUN apk add --no-cache build-base libffi-dev

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt



# ===== 3. Final Runtime Image =====
FROM nginx:alpine3.24

WORKDIR /app

EXPOSE 80

VOLUME /app/cache

# Install Supervisor + FFmpeg
RUN apk add --no-cache tini supervisor ffmpeg

# Copy Python environment
COPY --from=backend-build /usr/local/lib/python3.14 /usr/local/lib/python3.14
COPY --from=backend-build /usr/local/bin /usr/local/bin

# Copy frontend build artifacts to Nginx html directory
COPY --from=frontend-build /app/build/client /usr/share/nginx/html

# Nginx Entry Point
COPY nginx_entrypoint.sh /usr/local/bin/nginx_entrypoint.sh
RUN chmod +x /usr/local/bin/nginx_entrypoint.sh

# Copy application code
COPY supervisord.conf .
COPY api ./api

# Start: Python + Nginx
ENTRYPOINT ["tini", "--"]
CMD ["supervisord", "-c", "/app/supervisord.conf"]