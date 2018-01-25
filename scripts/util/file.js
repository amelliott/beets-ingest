let fs = require('fs-extra');
let path = require('path');

class FileUtils {

  static lsDir(dir) {
    // console.log('listDirP(' + "'" + dir + "')")
    return new Promise( (resolve, reject) => {
      fs.readdir(dir, (err, files) => {
        if (err) {
          console.log('fs.readdir err: ', err);
          reject('fs.readdir err: ' + err);
          return;
        }
        resolve(files);
      });
    });
  }

  static stats(path) {
    // console.log('statsP(' + "'" + path + "')")
    return new Promise( (resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (err) {
          console.log('fs.stat err: ', err);
          reject('fs.stat err: '+ err);
          return;
        }
        resolve(stats);
      })
    });
  }

  static dirTree(dir)  {
    return new Promise( (resolve, reject) => {
      let dirObj = { files: [], dirs: {} };
      return this.lsDir(dir)
        .then( (files) => {
            let s = Promise.resolve();
            files.forEach( (f) => {
              let fullpath = path.join(dir, f);
              s = s
                .then( () => {
                  return this.stats(fullpath);
                })
                .then( (stats) => {
                  if (stats.isFile()) {
                    dirObj.files.push(f);
                  } else if (stats.isDirectory()) {
                    return this.dirTree(fullpath)
                      .then( (d) => {
                        dirObj.dirs[f] = d;
                      });
                  }
                });
            });
            return s;
        })
        .then( () => {
          resolve(dirObj);
        });
    });
  }

  // dir: path of dir to traverse
  // filterFunc: (fullpath, stats), returns bool
  // result: list of full paths matching the filter
  static walkDir(dir, eachFunc) {
    return new Promise( (resolve, reject) => {
      let result = [];
      return this.lsDir(dir)
        .then( (files) => {
          let s = Promise.resolve();
          files.forEach( (f) => {
            let fullpath = path.join(dir, f);
            s = s
              .then( () => {
                return this.stats(fullpath);
              })
              .then( (stats) => {
                if (eachFunc(fullpath, stats)) {
                  result.push(fullpath);
                }
                if (stats.isDirectory()) {
                  return this.walkDir(fullpath, eachFunc)
                    .then( (r) => {
                      result = result.concat(r);
                    });
                }
              });
          });
          return s;
        })
        .then( () => {
          resolve(result);
        });
    });
  }

  static emptyChildDirs(dirPath) {
    return this.dirTree(dirPath)
      .then( (dirObj) => {
        return Promise.resolve(this._emptyChildDirs(dirPath, dirObj));
      });
  }

  static _emptyChildDirs(dirPath, dirObj) {
    let dirs = [];
    if (Object.keys(dirObj.dirs).length !== 0) {
      for (let sub in dirObj.dirs) {
        dirs = dirs.concat(this._emptyChildDirs(path.join(dirPath, sub), dirObj.dirs[sub]));
      }
    } else if (dirObj.files.length === 0) {
      // both empty
      dirs.push(dirPath);
    }
    return dirs;
  }

  static _searchLeafChildDirs(dirPath, dirObj) {
    let dirs = [];
    if (Object.keys(dirObj.dirs).length !== 0) {
      // not a leaf, maybe one of it's children?
      for (let sub in dirObj.dirs) {
        dirs = dirs.concat(this._searchLeafChildDirs(path.join(dirPath, sub), dirObj.dirs[sub]));
      }
    } else {
      // it's a leaf
      dirs.push(dirPath);
    }
    return dirs;
  }

  static leafChildDirs(dirPath) {
    return this.dirTree(dirPath)
      .then( (dirObj) => {
        let dirs = this._searchLeafChildDirs(dirPath, dirObj);
        return Promise.resolve(dirs);
      })
  }

  static deleteFile(file) {
    return new Promise( (resolve, reject) => {
      fs.unlink(file, (err) => {
        if (err) {
          reject('deleteFile error: ' + err);
          return;
        }
        resolve();
      })
    });
  }

  static moveDir(src, dest) {
    return new Promise( (resolve, reject) => {
      fs.move(src, dest, (err) => {
        if (err) {
          reject('fs.move error: ' + err)
          return;
        }
        resolve();
      });
    });
  }
}

//
// lsDir('to Home')
//   .then( (dir) => {
//     console.log(JSON.stringify(dir, null, 2));
//     // console.log('Empty dirs:');
//     // console.log(emptyDirs('to Home', dir))
//   })
//   // empty dirs
//   .then( () => {
//     return filterDir('to Home', (f, s) => {
//         return s.isDirectory() && s.size === 68;
//       })
//       .then( (result) => {
//         console.log('empty dirs: ', JSON.stringify(result, null, 2))
//       })
//   })
//   // files
//   .then ( () => {
//     return filterDir('to Home', (f, s) => {
//         return s.isFile();
//       })
//     .then( (result) => {
//       console.log('files: ', JSON.stringify(result, null, 2));
//     });
//   })
//   // hidden files
//   .then( () => {
//     return filterDir('to Home', (f, s) => {
//       return s.isFile() && path.basename(f).startsWith('.');
//     })
//     .then( (result) => {
//       console.log('hidden files: ', JSON.stringify(result, null, 2));
//     });
//   })
//   // hidden dirs
//   .then( () => {
//     return filterDir('to Home', (f, s) => {
//       return s.isDirectory() && path.basename(f).startsWith('.');
//     })
//     .then( (result) => {
//       console.log('hidden dirs: ', JSON.stringify(result, null, 2));
//     });
//   })

export default FileUtils;
