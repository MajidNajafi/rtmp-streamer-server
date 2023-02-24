FROM node:16 AS stage-one
RUN \
	set -x \
	&& apt-get update \
	&& apt-get install -y net-tools build-essential python3 python3-pip valgrind ffmpeg

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
RUN mkdir -p /usr/src/app/dist
RUN chown -R node:node /usr/src/app/dist && chmod -R 755 /usr/src/app/dist
COPY . .
RUN npm install
EXPOSE 3000
RUN npm run build
RUN node node /usr/src/app/dist/index.js
