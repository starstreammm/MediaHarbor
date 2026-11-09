FROM python:3.14.10-slim-trixie

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    UV_PYTHON_DOWNLOADS=0 \
    UV_LINK_MODE=copy \
    CLOAKBROWSER_AUTO_UPDATE=false

EXPOSE 80
VOLUME /app/cache

# Install system dependencies. CloakBrowser requires glibc and Chromium's system libraries.
RUN apt-get update && apt-get install --no-install-recommends -y \
    ca-certificates curl git nginx tini supervisor ffmpeg \
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 \
    libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default

# Install Python dependencies separately from application code.
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv \
    && uv sync --locked --no-dev \
    && python -m cloakbrowser install

# Copy frontend
COPY build/client /usr/share/nginx/html

# Copy service configuration
COPY nginx_entrypoint.sh /usr/local/bin/nginx_entrypoint.sh
RUN chmod +x /usr/local/bin/nginx_entrypoint.sh
COPY supervisord.conf .
COPY src ./src

# Health check
HEALTHCHECK \
    --interval=33s \
    --timeout=3s \
    --start-period=63s \
    --start-interval=3s \
    --retries=3 \
    CMD curl -fsS --max-time 3 http://127.0.0.1:38888/health

# Start: Python + Nginx
ENTRYPOINT ["tini", "--"]
CMD ["supervisord", "-c", "/app/supervisord.conf"]
