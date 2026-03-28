FROM node:18-bullseye-slim
WORKDIR /usr/src/app
# install production deps only; app source is mounted at runtime
COPY package.json package-lock.json* ./
RUN npm ci --only=production --no-audit --no-fund
ENV NODE_ENV=production
# At container start, if .next is missing (fresh mount), build then start
EXPOSE 3000
CMD ["sh", "-c", "if [ ! -d .next ]; then npm run build; fi && npm start"]
