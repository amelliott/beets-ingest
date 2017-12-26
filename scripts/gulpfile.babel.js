import gulp from 'gulp';

import Docker from './util/docker';

const beetsContainerName = 'beets';
class Beets {
  static created() {
    return Docker.ps(true)
      .then( (containers) => {
        return Promise.resolve( this._findContainer(containers) !== undefined );
      });
  }

  static start() {
    return Docker.start(beetsContainerName);
  }

  static stop() {
    return Docker.stop(beetsContainerName);
  }

  static create() {
    let options = {
      volumes: {
        'config': '/config',
        'music': '/music',
        'downloads': '/downloads'
      },
      ports: {
        '8337': '8337'
      },
      env: {
        'PGID': 20,
        'PUID': 501
      }
    };
    return Docker.create('linuxserver/beets', beetsContainerName, options)
      .then( (result) => {
          if (result.code != 0) {
            return Promise.reject("Failed to create container. Exit code: " + result.code + ". Error: " + result.stderr);
          }
          return Promise.resolve(result.stdout.trim());
      })
      .then( (containerId) => {
        console.log(beetsContainerName + ' container created with id ' + containerId);
      });

  }

  static _findContainer(containers) {
    return containers.find( (c) => { return c.name === beetsContainerName });
  }

  static running() {
    return Docker.ps()
      .then( (containers) => {
        return Promise.resolve( this._findContainer(containers) !== undefined );
      });
  }

  static clean() {
    return Docker.rm(beetsContainerName)
      .then( (result) => {
        if (result.code != 0) {
          return Promise.reject("Failed to rm container " + beetsContainerName + ". Exit: " + result.code + ". Error: " + result.stderr);
        }
        return Promise.resolve();
      });
  }
}

gulp.task('beets:created', () => {
  return Beets.created()
    .then( (result) => {
      console.log(result);
    });
});

gulp.task('beets:clean', () => {
  return Beets.clean();
});

gulp.task('beets:create', () => {
  return Beets.create();
});

gulp.task('beets:start', () => {
  return Beets.start();
});

gulp.task('beets:stop', () => {
  return Beets.stop();
});

gulp.task('beets:running', () => {
  return Beets.running()
    .then( (result) => {
      console.log(result);
    });
})

// gulp.task('beets:import', ['beets:start'], () => {
//   return
// })
