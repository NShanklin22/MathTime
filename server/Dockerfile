# The MathTime API: see deploy/compose.yaml and deploy/README.md. Only Node's own modules, no npm.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3006 \
    HOST=0.0.0.0 \
    DB_PATH=/data/mathtime.db \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

WORKDIR /app
# Only the server's modules; the tests stay out (.dockerignore).
COPY *.mjs ./

# The database lives in /data, a folder on mainframe mounted by deploy/compose.yaml. The image's own
# /data belongs to the node user, for a run without the mount.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:3006/api/healthz || exit 1
CMD ["node", "server.mjs"]
