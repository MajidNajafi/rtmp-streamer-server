FROM node:16-alpine

# Install build tools
RUN apk update \
    && apk add build-base net-tools

RUN apk add linux-headers

# Install python/pip
ENV PYTHONUNBUFFERED=1
ENV PIP_ROOT_USER_ACTION=ignore
RUN apk add python3 && ln -sf python3 /usr/bin/python
RUN python3 -m ensurepip
RUN pip3 install pip setuptools

RUN apk add ffmpeg

# RUN set -eux \
#     & apk add \
#         --no-cache \
#         nodejs \
#         yarn

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
RUN mkdir -p /usr/src/app/dist
RUN chown -R node:node /usr/src/app/dist && chmod -R 755 /usr/src/app/dist
COPY . .
RUN yarn install
RUN yarn build
EXPOSE 3000
CMD ["node", "/usr/src/app/dist/index.js"]
