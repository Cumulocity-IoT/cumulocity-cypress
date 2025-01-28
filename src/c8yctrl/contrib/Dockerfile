FROM node:21 as base

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src
COPY packages/pact-http-controller/ ./packages/pact-http-controller/

RUN rm ./packages/pact-http-controller/.env

EXPOSE 3000

WORKDIR /app/packages/pact-http-controller

RUN npm install

CMD [ "npx", "tsx", "--env-file=/app/.env", "src/startup.ts", "--port=3000", "--folder=/app/recordings", "--static=/app/static" ]
