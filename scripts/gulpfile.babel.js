import gulp from 'gulp';
import path from 'path';
import fs from 'fs';
import { spawn, exec } from 'child_process';

import Docker from './util/docker';

let config = {
  localLibrary: path.dirname(__dirname) + '/config/library',
  localDownloads: path.dirname(__dirname) + '/downloads',
  localConfig: path.dirname(__dirname) + '/config',
  downloads: '/downloads',
  beetsLog: '/config/beet.log',
  archive: '/downloads/Imported',
  skipped: '/downloads/Unable to Import'
}


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

const beetsContainerName = 'beets-auto-run';
const beetsImageName = 'beets-auto';
class BeetsDocker {
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

  static exportContainer() {
    return Docker.exportContainer(beetsContainerName, beetsContainerName + '.tar.gz');
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

    options.volumes[config.localConfig] = '/config';
    options.volumes[config.localLibrary] = '/music';
    options.volumes[config.localDownloads] = '/downloads';


    return Docker.create(beetsImageName, beetsContainerName, options)
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
    return containers.find( (c) => { return c.name === beetsContainerName } );
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
      })
  }

  static build() {
    return Docker.build('.', beetsImageName);
  }

  static logs() {
    return Docker.logs(beetsContainerName)
      .then( (result) => {
        console.log(result.stdout);
      })
  }
}



class Beets {
  static sanitizeShellArg(arg) {
    if (arg.includes(' ') || arg.includes('(') || arg.includes(')') || arg.includes("'") || arg.includes('"')) {
      // use double quote if contains single quote
      if (arg.includes("'")) {
        return '"' + arg + '"';
      }
      // use single quote otherwise
      return "'" + arg + "'";
    }
    return arg;
  }

  // traverse from basedir to find all files with given extension
  // resolves with list of all matching files
  static _searchExt(basedir, extension) {
    return this._runCmd([ 'find', basedir, '-name', "'*.'" + extension, '-not', '-name', "'.*'" ])
      .then( (result) => {
        return Promise.resolve(result.stdout.split('\n').filter( line => line.length > 0).filter( line => !line.includes( config.archive ) ).filter( line => !line.includes( config.skipped )));
      });
  }

  static _runCmd(args) {
    return new Promise( (resolve, reject) => {
      let sargs = [];
      args.forEach( (a) => {
          sargs.push(this.sanitizeShellArg(a));
      });
      let command = sargs.join(' ');
      console.log('Running command `' + command + '`');
      exec(command, {shell: '/bin/bash'}, (err, stdout, stderr) => {
        if (err) {
          reject('Command `' + command + '` failed. Error: ' + err);
          return;
        }

        resolve({ stdout: stdout, stderr: stderr });
      });
    });
  }

  static import(dir, auto) {
    let args = [ 'beet', 'import' ];
    if (auto) {
      args.push('-q');
    }
    args.push(dir);
    return this._runCmd(args)
      .then( (result) => {
        console.log('import result: ' + JSON.stringify(result));
        return Promise.resolve(result);
      });
  }

  static archive(origPath) {
    let archiveDir = config.archive;
    let archivePath = path.join(archiveDir, origPath.replace('/downloads/', ''));
    console.log('Archiving "' + origPath + '" to "' + archivePath + '"');
    return this._runCmd([ 'mkdir', '-p', path.dirname(archivePath) ])
      .then( () => this._runCmd([ 'mv', origPath, archivePath ]) );
  }

  static skipped(dir) {
    let skippedDir = config.skipped;
    let skippedPath = path.join(skippedDir, dir.replace('/downloads/', ''));
    console.log('Moving "' + dir + '" to "' + skippedPath + '"');
    return this._runCmd([ 'mkdir', '-p', path.dirname(skippedPath)])
      .then( () => this._runCmd([ 'mv', dir, skippedPath ]) );
  }

  static unzip(basedir) {
    return this._searchExt(basedir, 'zip')
      .then( (zipFiles) => {
        let run = Promise.resolve();
        zipFiles.forEach( (f) => {
          let dest = f.replace('.zip', '');
          run = run.then( () => { return this._runCmd([ '/bin/bash', './unzip', f, dest ]) })
              .then( (result) => {
                console.log('Unzip finished');
                console.log(result.stdout);
              })
              .then( () => this.archive(f) );
        });
        return run;
      })
  }

  static convertWav(basedir) {
    return this._searchExt(basedir, 'wav')
      .then( (wavFiles) => {
        let convert = Promise.resolve();
        wavFiles.forEach( (f) => {
          let dest = path.dirname(f);
          convert = convert
            .then( () => this._runCmd([ '/bin/bash', './wav_to_flac', f, dest ]))
            .then( (result) => { console.log(result.stdout); })
            .then( () => this.archive(f));
        });
        return convert;
    })
  }

  static getDirsForImport(basedir) {
    return this._runCmd([ 'find', basedir, '-type', 'd', '-exec', 'sh', '-c', '(ls -p "{}"|grep />/dev/null)||echo "{}"', '\\;'])
      .then( (result) => {
        return new Promise( (resolve, reject) => {
          let dirs = result.stdout.split('\n').filter(d => d.length > 0 && !d.startsWith('.') && !d.startsWith(config.archive) && !d.startsWith(config.skipped) && d !== basedir);
          resolve(dirs);
        });
      });
  }

  static importWasSkipped(dir) {
    let beetsLog = config.beetsLog;
    return new Promise( (resolve, reject) => {
      fs.readFile(beetsLog, 'utf8', ( err, data ) => {
        if (err) {
          reject('Error reading beets log ' + beetsLog + ', Error: ' + err);
          return;
        }
        data.split('\n').forEach( ( line ) => {
          if (line.includes(dir)) {
            resolve(true);
            return;
          }
        });
        resolve(false);
      });
    });
  }

  static cleanLog() {
    let beetsLog = config.beetsLog;
    let archivedLog = beetsLog.replace('.log', '_' + new Date() + '.log');
    console.log('Moving old log to ' + archivedLog);
    return this._runCmd([ 'mv', beetsLog, archivedLog ]);
  }

}

gulp.task('beetsd:created', () => {
  return BeetsDocker.created()
    .then( (result) => {
      console.log(result);
    });
});

gulp.task('beetsd:build', () => {
  return BeetsDocker.build();
});

gulp.task('beetsd:clean', () => {
  return BeetsDocker.clean();
});

gulp.task('beetsd:logs', () => {
  return BeetsDocker.logs();
})

gulp.task('beetsd:create', () => {
  return BeetsDocker.create();
});

gulp.task('beetsd:export', () => {
  return BeetsDocker.exportContainer();
})

gulp.task('beetsd:start', () => {
  return BeetsDocker.start();
});

gulp.task('beetsd:stop', () => {
  return BeetsDocker.stop();
});

gulp.task('beetsd:restart', () => {
  return BeetsDocker.stop()
    .then( () => { return Beets.start() } );
})

gulp.task('beetsd:running', () => {
  return Beets.running()
    .then( (result) => {
      console.log(result);
    });
})


function importDir(dir, auto) {
  return Beets.unzip(dir)
    .then( () => Beets.convertWav(dir) )
    .then( () => Beets.getDirsForImport(dir) )
    .then( (dirs) => {
      console.log('Dirs: ' + JSON.stringify(dirs))
      let p = Promise.resolve();
      dirs.forEach( (d) => {
        p = p
          .then(() => {
            console.log('Importing ' + d);
            return Beets.import(d, auto);
          })
          .then(( result ) => {
            if (auto && ( result.stderr.includes('Skipped ') || result.stdout.includes('Skipping') )) {
              // when finished, check log to see if it was skipped
              console.log(d + ' was skipped');
              return Beets.skipped(d);
            }
            console.log('Archiving ' + d);
            return Beets.archive(d);
          });
      });
      return p;
    });
}

gulp.task('beets:downloads', () => {
  return importDir(config.downloads, true);
});

gulp.task('beets:skipped', () => {
  return importDir(config.skipped, false);
});

gulp.task('beets:wav', () => {
  return Beets.convertWav(config.downloads);
});

gulp.task('beets:unzip', () => {
  return Beets.unzip(config.downloads);
});
