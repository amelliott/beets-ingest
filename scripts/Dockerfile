FROM linuxserver/beets:latest

# update
RUN apk update

# install node
RUN apk add nodejs

RUN npm install -g gulp

# add scripts
RUN mkdir /tasks
WORKDIR /tasks
COPY util/ ./util/
COPY gulpfile.babel.js .babelrc package.json run_daemon unzip wav_to_flac ./
RUN npm install

# run auto import
CMD ./run_daemon 60 gulp beets:downloads
