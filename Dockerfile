FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund
COPY server ./server
COPY shared ./shared
COPY sdk ./sdk
ENV NODE_ENV=production
EXPOSE 2567
CMD ["npm","run","server"]
