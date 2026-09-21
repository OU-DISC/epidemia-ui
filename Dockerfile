FROM public.ecr.aws/docker/library/node:22-alpine AS build-stage

WORKDIR /app

COPY . /app/

ARG REACT_APP_FORECAST_API_BASE=""
ARG REACT_APP_ENV_API_BASE=""
ARG REACT_APP_CARTO_API_KEY=""
ENV REACT_APP_FORECAST_API_BASE=${REACT_APP_FORECAST_API_BASE}
ENV REACT_APP_ENV_API_BASE=${REACT_APP_ENV_API_BASE}
ENV REACT_APP_CARTO_API_KEY=${REACT_APP_CARTO_API_KEY}
ENV PORT=8050

## npm in the Node 22 alpine image can lag behind local npm,
## causing `npm ci` to fail due to lockfile incompatibilities.
RUN npm install -g npm@11.16.0

RUN npm ci

RUN npm run build

FROM public.ecr.aws/docker/library/nginx:1.27-alpine

COPY --from=build-stage /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
