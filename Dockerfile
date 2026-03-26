FROM node:24 AS build-stage

WORKDIR /app

ADD . /app/

ARG REACT_APP_FORECAST_API_BASE=""
ARG REACT_APP_ENV_API_BASE=""
ENV REACT_APP_FORECAST_API_BASE=${REACT_APP_FORECAST_API_BASE}
ENV REACT_APP_ENV_API_BASE=${REACT_APP_ENV_API_BASE}
ENV PORT=8050

RUN npm ci

RUN npm run build

FROM nginx:alpine

COPY --from=build-stage /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
