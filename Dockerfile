FROM node:22-slim

ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/app/storage/uploads

WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/storage/uploads && chown -R node:node /app/storage

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
