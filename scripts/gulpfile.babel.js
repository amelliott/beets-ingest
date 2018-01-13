import gulp from 'gulp';
import path from 'path';
import { spawn } from 'child_process';

import Docker from './util/docker';

class Process {
  static spawn(command, args) {
    console.log('spawn: ', args.join(' '));
    let proc = spawn(command, args);

    let result = {
      stdout: '',
      stderr: '',
      code: 0
    };
    proc.stdout.on('data', (data) => {
      result.stdout += data;
    });

    proc.stderr.on('data', (data) => {
      result.stderr += data;
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject('command failed. Command: `' + command + ' ' + args.join(' ') + '`, Exit: ' + code + ', Error: ' + result.stderr);
        return;
      }
      result.code = code;
      resolve(result);
    });
  }
}

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

  static import() {
    return Docker.exec(beetsContainerName, [ 'beet', 'import', '/downloads' ])
  }

  static create() {
    let options = {
      volumes: { },
      ports: {
        '8337': '8337'
      },
      env: {
        'PGID': 20,
        'PUID': 501
      }
    };

    options.volumes[path.normalize(path.join(__dirname, '..', 'config'))] = '/config';
    options.volumes[path.normalize(path.join(__dirname, '..', 'music'))] = '/music';
    options.volumes[path.normalize(path.join(__dirname, '..', 'downloads'))] = '/downloads';


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

  // traverse from basedir to find all files with given extension
  // resolves with list of all matching files
  static _searchExt(basedir, extension) {
    return Docker.exec(beetsContainerName, [ 'find', basedir, '-name', '*.' + extension ])
      .then( (result) => {
        if (result.code !== 0) {
          return Promise.reject('find command failed');
        }
        return Promise.resolve(result.stdout.split('\n').filter( line => line.length > 0));
      });
  }

  static unzip(basedir) {
    return this._searchExt(basedir, 'zip')
      .then( (zipFiles) => {
        let run = Promise.resolve();
        zipFiles.forEach( (f) => {
          let dest = f.replace('.zip', '');
          run = run.then( () => Docker.exec(beetsContainerName, [ 'bash', '/config/unzip.sh', f, dest ]));
        });
      })
  }

  static convertWav(basedir) {
    return this._searchExt(basedir, 'wav')
      .then( (wavFiles) => {
        let convert = Promise.resolve();
        wavFiles.forEach( (f) => {
          let dest = path.dirname(f);
          convert = convert.then(
            () => {
              return Docker.exec(beetsContainerName, [ 'bash', '/config/wav_to_flac.sh', f, dest ])
                .then( (result) => {
                  console.log(result.stdout);
                });
            });
        });
        return convert;
    })
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

gulp.task('beets:restart', () => {
  return Beets.stop()
    .then( () => { return Beets.start() } );
})

gulp.task('beets:running', () => {
  return Beets.running()
    .then( (result) => {
      console.log(result);
    });
})

gulp.task('beets:import', ['beets:start'], () => {
  return Beets.import('/downloads');
});

gulp.task('beets:wav', () => {
  return Beets.convertWav('/downloads');
});

gulp.task('beets:unzip', () => {
  return Beets.unzip('/downloads');
});
