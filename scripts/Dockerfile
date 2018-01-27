FROM linuxserver/beets:latest

# update
RUN apk update

# install node
RUN apk add nodejs

RUN npm install -g gulp

# add scripts
COPY util/ ./util/
COPY gulpfile.babel.js .babelrc package.json run_daemon unzip wav_to_flac ./
RUN npm install

# run auto import
CMD ./run_daemon 300 gulp beets:downloads | tee /config/beetsdownloads_$(date +%Y%m%d%H%M).log
