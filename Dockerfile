FROM node:24 AS build-stage

WORKDIR /app

ADD . /app/

RUN npm ci

RUN npm run build

FROM nginx:alpine

COPY --from=build-stage /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
