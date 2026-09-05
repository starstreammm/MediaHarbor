#!/bin/sh

set -e

CERT="/etc/nginx/certs/cert.crt"
KEY="/etc/nginx/certs/cert.key"
CONF="/etc/nginx/conf.d/default.conf"



# Wait for the backend to be healthy before starting Nginx
echo "Waiting for backend at localhost:38888/health/..."

until curl -fsS http://127.0.0.1:38888/health/ >/dev/null 2>&1; do
    sleep 1
done

echo "Backend is healthy, starting nginx..."



# Configure Nginx based on the presence of SSL certificates
if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    echo "SSL certificates found, enabling HTTPS"

    cat > "$CONF" <<EOF
server {
    listen 80;
    server_name _;

    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate $CERT;
    ssl_certificate_key $KEY;
EOF

else
    echo "SSL certificates not found, using HTTP"

    cat > "$CONF" <<EOF
server {
    listen 80;
    server_name _;
EOF

fi

cat >> "$CONF" <<'EOF'

    root /usr/share/nginx/html;
    index index.html;

    # React Router fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to the backend
    location /api/ {
        proxy_pass http://127.0.0.1:38888;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        access_log off;

        # Buffer Settings
        client_max_body_size 100m;
        client_body_buffer_size 10m;
        proxy_request_buffering off;
        proxy_buffering off;
        gzip off;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
EOF



# Start Nginx in the foreground
exec nginx -g "daemon off;"