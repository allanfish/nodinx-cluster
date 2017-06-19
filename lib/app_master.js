'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const ready = require('get-ready');
const debug = require('debug')('egg-cluster');
const ConsoleLogger = require('egg-logger').EggConsoleLogger;
const parseOptions = require('./utils/options');

class AppMaster extends EventEmitter {
  constructor(options) {
    super();
    this.options = parseOptions(options);
    ready.mixin(this);

    this.isProduction = isProduction();
    this.isDebug = isDebug();

      // app started or not
    this.isStarted = false;
    this.logger = new ConsoleLogger({ level: 'INFO' });

        // get the real framework info
    const frameworkPath = this.options.framework;
    const frameworkPkg = require(path.join(frameworkPath, 'package.json'));

    this.logger.info(`[worker] =================== ${frameworkPkg.name} start =====================`);
    this.logger.info(`[worker] ${frameworkPkg.name} version ${frameworkPkg.version}`);
    this.logger.info('[worker] start with options: %j', this.options);
    this.logger.info(`[worker] start with env: isProduction: ${this.isProduction}, isDebug: ${this.isDebug}, EGG_SERVER_ENV: ${process.env.EGG_SERVER_ENV}, NODE_ENV: ${process.env.NODE_ENV}`);

    const startTime = Date.now();

    this.ready(() => {
      this.isStarted = true;
      const stickyMsg = this.options.sticky ? ' with STICKY MODE!' : '';
      this.logger.info('[worker] %s started on %s://%s:%s (%sms)%s',
        frameworkPkg.name, this.options.https ? 'https' : 'http', this.options.useLocalHost ? '127.0.0.1' : getLocalIp(), this.options.port, Date.now() - startTime, stickyMsg);
      this.app.messenger.sendToApp('egg-ready', this.options);
      // this.app.emit(action, Object.assign({action}, this.options));
    });

    this.run();
  }

  run() {
    // $ node app_worker.js options
    const options = this.options;

    const Application = require(options.framework).Application;
    debug('new Application with options %j', options);
    const app = this.app = new Application(options);
    app.ready(startServer.bind(this));
    this.onExit();

    // exit if worker start error
    app.once('error', startErrorHanddler);
    function startErrorHanddler() {
      consoleLogger.error('[app_worker] App Worker start error, exiting now!');
      process.exit(1);
    }

    // exit if worker start timeout
    app.once('startTimeout', startTimeoutHanlder);
    function startTimeoutHanlder() {
      consoleLogger.error(
        '[app_worker] App Worker start timeout, exiting now!'
      );
      process.exit(1);
    }

    function startServer() {
      app.removeListener('error', startErrorHanddler);
      app.removeListener('startTimeout', startTimeoutHanlder);

      let server;
      if (options.https) {
        server = require('https').createServer(
          {
            key: fs.readFileSync(options.key),
            cert: fs.readFileSync(options.cert),
          },
          app.callback()
        );
      } else {
        server = require('http').createServer(app.callback());
      }

      // emit `server` event in app
      app.emit('server', server);

      if (options.sticky) {
        server.listen(0, '127.0.0.1', err => {
          if (err) return this.ready(err);
          this.ready(true);
        });
        // Listen to messages sent from the master. Ignore everything else.
        process.on('message', (message, connection) => {
          if (message !== 'sticky-session:connection') {
            return;
          }

          // Emulate a connection event on the server by emitting the
          // event with the connection the master sent us.
          server.emit('connection', connection);
          connection.resume();
        });
      } else {
        server.listen(options.port, err => {
          if (err) return this.ready(err);
          this.ready(true);
        });
      }
    }
  }

  onExit() {
    process.once('SIGINT', receiveSig.bind(null, 'SIGINT'));
    // kill(3) Ctrl-\
    process.once('SIGQUIT', receiveSig.bind(null, 'SIGQUIT'));
    // kill(15) default
    process.once('SIGTERM', receiveSig.bind(null, 'SIGTERM'));

    function receiveSig(sig) {
      debug('[app_worker] App Worker exit with signal %s, exit with code 0, pid %s', sig, process.pid);
      process.exit(0);
    }
  }
}

module.exports = AppMaster;


function isProduction() {
  const serverEnv = process.env.EGG_SERVER_ENV;
  if (serverEnv) {
    return serverEnv !== 'local' && serverEnv !== 'unittest';
  }
  return process.env.NODE_ENV === 'production';
}

function isDebug() {
  return process.execArgv.indexOf('--debug') !== -1 || typeof v8debug !== 'undefined';
}


function getLocalIp() {
    const ipInfos = require('os').networkInterfaces(); // eslint-disable-line
  const matchedIps = [];

  for (const key in ipInfos) {
     if (ipInfos[key] && ipInfos[key].splice) {
        ipInfos[key].some(ip => {
          if (ip.family.toLowerCase() === 'ipv4' && ip.internal === false && ip.address.indexOf('127') !== 0) {
            matchedIps.push(ip.address);
          }
          return false;
        });
      }
   }

  if (matchedIps.length === 0) throw new Error('Can not resolve local ip!');

  return matchedIps[0];
}
