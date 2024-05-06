FROM docker.io/oven/bun:latest as base

COPY package.json .
RUN bun install

USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "index.ts" ]
