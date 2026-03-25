FROM node:24

WORKDIR /app

ADD . /app/

RUN npm ci

RUN npm run build

CMD ["npm", "run", "start"]