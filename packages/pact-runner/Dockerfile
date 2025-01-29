# Use the Cypress included base image
FROM cypress/base as base

# RUN apt-get install ...

WORKDIR /usr/src/app

COPY cypress /usr/src/app/cypress
COPY cypress.config.js /usr/src/app/cypress.config.js
COPY package.json /usr/src/app/package.json
COPY package-lock.json /usr/src/app/package-lock.json

ENV CYPRESS_VERIFY_TIMEOUT=100000
# RUN Xvfb :99 &

# RUN npx cypress verify"
# Development stage
FROM base as dev

COPY .yalc /usr/src/app/.yalc
COPY yalc.lock /usr/src/app/yalc.lock

RUN npm install

CMD ["npm", "run", "test"]

# Production stage
FROM base as prod

RUN npm install

CMD ["npm", "run", "test"]

