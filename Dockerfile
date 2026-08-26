FROM node:22-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install
COPY backend ./backend
COPY frontend ./frontend
WORKDIR /app/backend
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/backend/package.json /app/backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend ./frontend
WORKDIR /app/backend
EXPOSE 8080
CMD ["node", "dist/server.js"]
