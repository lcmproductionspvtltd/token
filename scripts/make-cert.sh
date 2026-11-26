#!/usr/bin/env sh
# Creates a self-signed HTTPS certificate for testing on your local network (phone cameras need https).
# Usage: sh scripts/make-cert.sh 192.168.1.20      (your computer's LAN IP)
# For a real domain use Let's Encrypt (certbot) or a reverse proxy such as Caddy/Nginx instead.
IP="${1:-127.0.0.1}"
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=BQuee" -addext "subjectAltName=IP:${IP},DNS:localhost" && \
echo "Created certs/cert.pem and certs/key.pem. Add to .env:" && \
echo "  HTTPS_CERT=./certs/cert.pem" && echo "  HTTPS_KEY=./certs/key.pem" && echo "  PORT=8443" && \
echo "Then open https://${IP}:8443 on your phone (accept the warning once)."
