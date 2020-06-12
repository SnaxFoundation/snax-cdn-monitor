FROM node:alpine

COPY . /usr/src/app

WORKDIR /usr/src/app

RUN yarn install

EXPOSE 3000

ENTRYPOINT ["/bin/sh", "docker-entrypoint.sh"]
