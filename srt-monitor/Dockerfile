FROM node:20-alpine
WORKDIR /app
COPY index.js brand-proxy.js history-store.js history-routes.js ./
COPY public ./public
EXPOSE 9091
CMD ["node", "index.js"]
