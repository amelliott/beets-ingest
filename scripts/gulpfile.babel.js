import gulp from 'gulp';
import path from 'path';
import fs from 'fs';
import { spawn, exec } from 'child_process';

import Docker from './util/docker';
import FileUtils from './util/file';

let config = {
  localLibrary: path.join(path.dirname(__dirname), 'config', 'library'),
  localDownloads: path.join(path.dirname(__dirname), 'downloads'),
  localConfig: path.join(path.dirname(__dirname), 'config'),
  downloads: '/downloads',
  beetsLog: '/config/beet.log',
  archive: '/downloads/Imported',
  skipped: '/downloads/Unable to Import'
}


class Process {
  static spawn(command, args, options) {
    // console.log('spawn: ', args.join(' '));
    return Promise.resolve(spawn(command, args, options));
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
        'PGID': 11001,
        'PUID': 1001
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

  static save() {
    return Docker.save(beetsImageName, beetsImageName + '.tar.gz');
  }
}



class Beets {
  static deleteEmptyChildDirs(dir) {
    let deletedDirs = [];
    return FileUtils.emptyChildDirs(dir)
      .then( (dirs) => {
        console.log('Found empty child dirs under ' + dir + ': ' + JSON.stringify(dirs, null, 2));
        let p = Promise.resolve();
        dirs.forEach( (d) => {
          p = p
            .then( () => {
              return new Promise( (resolve, reject) => {
                if (deletedDirs.includes(d)) {
                  // already deleted
                  resolve();
                  return;
                }
                console.log('Deleting empty dir "' + d + '"');
                fs.rmdir(d, (err) => {
                  if (err) {
                    reject('rmdir error: ' + err);
                    return;
                  }
                  deletedDirs.push(d);
                  // deleting this may have made the parent now empty, so run the process on it
                  this.deleteEmptyChildDirs(path.dirname(d))
                    .then((ds) => {
                      // make sure we add the deleted parent to the list so we
                      // don't try to delete it again
                      deletedDirs = deletedDirs.concat(ds);
                      resolve();
                    })
                });
              });
            });
        });
        return p.then( () => Promise.resolve(deletedDirs) );
      });
  }

  static sanitizeShellArg(arg) {
    let newArg = arg;
    if (arg.includes(' ') || arg.includes('(') || arg.includes(')') || arg.includes("'") || arg.includes('"')) {
      newArg = "'" + arg + "'";
      // use double quote if contains single quote
      if (arg.includes("'")) {
        newArg = '"' + arg + '"';
      } else
      // if it ended with a asterisk, move the asterisk outside the quote
      if (arg.endsWith('*')) {
        let quote = newArg.charAt(newArg.length-1);
        newArg = quote + arg.substr(0, arg.length-1) + quote + '*';
      }
    }
    return newArg;
  }

  // traverse from basedir to find all files with given extension
  // resolves with list of all matching files
  static _searchExt(basedir, extension) {
    return FileUtils.walkDir(basedir, (f, stats) => {
        return stats.isFile() && f.endsWith(extension);
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
    if (auto) {
      let args = [ 'beet', 'import', '-q', dir ];
      return this._runCmd(args)
        .then( (result) => {
          console.log('import result: ' + JSON.stringify(result));
          return Promise.resolve(result);
        });
    }
    return Process.spawn('beet', ['import', dir], { stdio: 'inherit' })
      .then( (proc) => {
        return new Promise( (resolve, reject) => {
          let result = {
            stdout: '',
            stderr: '',
            code: -1
          };

          // proc.stdout.on('data', (data) => {
          //   result.stdout += data;
          //   console.log(data.toString('utf8'));
          // });
          //
          // proc.stderr.on('data', (data) => {
          //   result.stderr += data;
          //   console.error(data.toString('utf8'));
          // });

          proc.on('close', (code) => {
            if (code !== 0) {
              reject('command failed. Command: `' + command + ' ' + args.join(' ') + '`, Exit: ' + code + ', Error: ' + result.stderr);
              return;
            }
            result.code = code;
            resolve(result);
          });
        });
      });
  }

  static safeRmDir(dir) {
    return this.rmEmptyChildDirs(dir)
      // .then( () => this._runCmd([ 'rmdir', '--ignore-fail-on-non-empty', dir ]))
  }

  static archive(origPath) {
    let archiveDir = config.archive;
    let archivePath = path.join(archiveDir, origPath.replace(config.downloads + path.sep, ''));
    console.log('Archiving "' + origPath + '" to "' + archivePath + '"');
    return FileUtils.moveDir(origPath, archivePath);
  }

  static skipped(dir) {
    let skippedDir = config.skipped;
    let skippedPath = path.join(skippedDir, dir.replace(config.downloads + path.sep, ''));
    console.log('Moving "' + dir + '" to "' + skippedPath + '"');
    return FileUtils.moveDir(dir, skippedPath);
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
              .then( () => this._runCmd([ 'mv', f, config.archive ]) )
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
    return FileUtils.leafChildDirs(basedir)
      .then( (dirs) => {
        return Promise.resolve(dirs.filter(d => d.length > 0 && !path.basename(d).startsWith('.') && !d.startsWith(config.archive) && (basedir === config.skipped || !d.startsWith(config.skipped)) && d !== basedir));
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

  static rmHiddenFiles(dir) {
    return FileUtils.walkDir(dir, (f, s) => {
        return s.isFile() && path.basename(f).startsWith('.');
      })
      .then( (files) => {
        let p = Promise.resolve();
        files.forEach( (f) => {
          p = p
            .then( () => {
              console.log('Deleting hidden file: ' + JSON.stringify(f));
              return FileUtils.deleteFile(f);
            })
        });
      });
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

gulp.task('beetsd:save', ['beetsd:build'], () => {
  return BeetsDocker.save();
})

gulp.task('beetsd:clean', () => {
  return BeetsDocker.clean();
});

gulp.task('beetsd:logs', () => {
  return BeetsDocker.logs();
})

gulp.task('beetsd:create', ['beetsd:clean'], () => {
  return BeetsDocker.create();
});

gulp.task('beetsd:export', ['beetsd:create'], () => {
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
  return Beets.rmHiddenFiles(dir)
    .then( () => Beets.deleteEmptyChildDirs(dir) )
    .then( () => Beets.unzip(dir) )
    .then( () => Beets.convertWav(dir) )
    .then( () => Beets.getDirsForImport(dir) )
    .then( (dirs) => {
      console.log('Dirs: ' + JSON.stringify(dirs))
      // delete empty dirs
      let p = Promise.resolve();
      dirs.forEach( (d) => {
        p = p
          .then(() => {
            console.log('Importing ' + d);
            return Beets.import(d, auto);
          })
          .then(( result ) => {
            if (!auto) {
              return Promise.resolve();
            }
            if ( result.stderr.includes('Skipped ') || result.stdout.includes('Skipping') ) {
              // when finished, check log to see if it was skipped
              console.log(d + ' was skipped');
              return Beets.skipped(d);
            }
            console.log('Archiving ' + d);
            return Beets.archive(d);
          })
          .then( () => {
            // clear out any empty dirs in the main dir
            return Beets.deleteEmptyChildDirs(dir);
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
})

gulp.task('beets:test', () => {
  // return Beets.archive('..\\downloads\\Hiss Golden Messenger\\Hallelujah Anyhow')
  // return Beets.rmHiddenFiles('../downloads')
  // return Beets.getDirsForImport('../downloads')
  //   .then( (dirs) => {
  //     console.log('dirs for import: ' + JSON.stringify(dirs, null, 2))
  //   })

  return Beets.deleteEmptyChildDirs('../downloads')
    .then( (deleted) => { console.log('deleted: ' + JSON.stringify(deleted, null, 2))})
  // return Beets._searchExt('../downloads', '.m4a')
  //   .then( (files) => { console.log(JSON.stringify(files, null, 2))})
});
