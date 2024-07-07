FROM docker.io/oven/bun:latest as base

COPY package.json .
RUN bun install

COPY . .
RUN chown -R bun:bun .

USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "src/index.ts" ]