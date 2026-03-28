FROM node:18-bullseye AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:18-bullseye-slim
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/.next ./.next
# `public` directory is optional; avoid failing the build if it doesn't exist.
# If you have a `public/` folder, add a COPY here. Otherwise Next.js will work without it.
EXPOSE 3000
CMD ["npm", "start"]
