FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 4173

CMD ["node", "dist/app.mjs", "--no-open", "--port", "4173"]
