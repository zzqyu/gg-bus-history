FROM node:22-bookworm-slim
WORKDIR /usr/src/app
# install production deps only; app source is mounted at runtime
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
ENV NODE_ENV=production
# At container start, if .next is missing (fresh mount), build then start
EXPOSE 3000
CMD ["sh", "-c", "if [ ! -d .next ]; then npm run build; fi && npm start"]
