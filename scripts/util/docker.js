import { spawn } from 'child_process';

class Docker {
  /*
    options: {
      envVars: { varName: 'value' },
      ports: { external: internal },
      volumes: { 'hostPath': 'containerPath' }
    }
  */

  static _runCmd(args) {
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
        if (code !== 0) {
          reject('docker command failed. Command: `docker ' + args.join(' ') + '`, Exit: ' + code + ', Error: ' + result.stderr);
          return;
        }
        result.code = code;
        resolve(result);
      });
    });
  }

  static images() {
    this._runCmd(['images'])
      .then( (result) => {
        let images = [];
        result.stdout.split('\n').slice(1, -1).forEach( (line) => {
          let parts = line.split(/\s{2,}/);
          if (parts.length === 5) {
            images.push({
              repository: parts[0].trim(),
              tag: parts[1].trim(),
              image: parts[2].trim(),
              created: parts[3].trim(),
              size: parts[4].trim()
            });
          }
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

    return this._runCmd(args);
  }

  static start(name) {
    return this._runCmd(['start', name]);
  }

  static stop(name) {
    return this._runCmd(['stop', name]);
  }

  static rm(name) {
    return this._runCmd(['rm', '/'+name]);
  }

  static ps(all) {
    let args = ['ps'];
    if (all) {
      args.push('-a');
    }
    return this._runCmd(args)
      .then( (result) => {
        let containers = result.stdout.split('\n').slice(1,-1).map( (line) => {
          let parts = line.split(/\s{2,}/);
          if (parts.length < 6) {
            console.log('Unexpected container description: ' + line);
            return;
          }
          let container = {
            id: parts[0].trim(),
            image: parts[1].trim(),
            command: parts[2].trim(),
            created: parts[3].trim(),
            status: parts[4].trim()
          }
          if (parts.length === 6) {
            container.name = parts[5].trim();
          } else {
            container.ports = parts[5].trim();
            container.name = parts[6].trim();
          }
          return container;

        });
        console.log(containers)
        return Promise.resolve(containers);
      });
  }
}

export default Docker;
