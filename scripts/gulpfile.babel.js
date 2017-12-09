import gulp from 'gulp';

import { spawn } from 'child_process';

let containerName = 'beets';

class Docker {
  /*
    options: {
      envVars: { varName: 'value' },
      ports: { external: internal },
      volumes: { 'hostPath': 'containerPath' }
    }
  */
  static run(args) {
    return new Promise( (resolve, reject) => {
      // console.log('Running docker', args)
      let proc = spawn('docker', args);

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
        result.code = code;
        resolve(result);
      });
    });
  }

  static create(image, name, options) {
    let args = ['create'];
    if (name) {
      args.push('--name=' + name);
    }
    if (options.env) {
      for (let varName in options.env) {
        args.push('-e');
        args.push(varName + '=' + options.env[varName]);
      }
    }
    if (options.ports) {
      for (let hostPort in options.ports) {
        args.push('-p');
        args.push(hostPort + ':' + options.ports[hostPort]);
      }
    }
    if (options.volumes) {
      for (let source in options.volumes) {
        args.push('-v');
        args.push(source + ':' + options.volumes[source]);
      }
    }
    args.push(image);

    return this.run(args);
  }

  static start(name) {
    return this.run(['start', name]);
  }

  static stop(name) {
    return this.run(['stop', name]);
  }

  static rm(name) {
    return this.run(['rm', '/'+name]);
  }

  static ps() {
    return this.run(['ps', '-a'])
      .then( (result) => {
        if (result.code !== 0) {
          return Promise.reject('ps failed, code: ' + result.code + ', stderr: ' + result.stderr);
        }
        let containers = result.stdout.split('\n').slice(1,-1).map( (line) => {
          let parts = line.split(/\s{2,}/);
          if (parts.length !== 7) {
            return;
          }
          return {
            id: parts[0].trim(),
            image: parts[1].trim(),
            command: parts[2].trim(),
            created: parts[3].trim(),
            status: parts[4].trim(),
            ports: parts[5].trim(),
            name: parts[6].trim()
          };
        });
        console.log(containers)
        return Promise.resolve(containers);
      });
  }

  static status(name) {
    return this._getRunningContainers()
      .then( (containers) => {
        return Promise.resolve(containers.find( (element) => {
          return element.name === name;
        }))
      })
  }
}

const beetsContainerName = 'beets';
class Beets {
  static start() {

  }

  static stop() {

  }
  static running() {
    return Docker.ps()
      .then( (containers) => {
        return Promise.resolve( containers.find( (c) => { return c.name === beetsContainerName }) !== undefined );
      });
  }
}

gulp.task('beets:clean', () => {
  return Docker.rm(containerName)
    .then( (result) => {
      if (result.code != 0) {
        return Promise.reject("Failed to rm container " + containerName + ". Exit: " + result.code + ". Error: " + result.stderr);
      }
      return Promise.resolve();
    });
});

gulp.task('beets:create', () => {
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
  return Docker.create('linuxserver/beets', containerName, options)
    .then( (result) => {
        if (result.code != 0) {
          return Promise.reject("Failed to create container. Exit code: " + result.code + ". Error: " + result.stderr);
        }
        return Promise.resolve(result.stdout.trim());
    })
    .then( (containerId) => {
      console.log(containerName + ' container created with id ' + containerId);
    });
});

gulp.task('beets:start', () => {
  return Docker.start(containerName);
});

gulp.task('beets:stop', () => {
  return Docker.stop(containerName);
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
