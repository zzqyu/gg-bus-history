FROM node:18-bullseye
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
# Use npm install to allow building without a lockfile inside the image
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 3000
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]
