'use strict';

const Master = require('./lib/master');
const AppMaster = require('./lib/app_master');

/**
 * cluster start flow:
 *
 * [startCluster] -> master -> agent_worker -> new [Agent]       -> agentWorkerLoader
 *                         `-> app_worker   -> new [Application] -> appWorkerLoader
 *
 */

/**
 * start egg app
 * @method Egg#startCluster
 * @param {Object} options {@link Master}
 * @param {Function} callback start success callback
 */
exports.startCluster = function(options, callback) {
  new Master(options).ready(callback);
};

/**
 * start single app master, use in un-mutli thread environment
 */
exports.startApp = function (options, callback) {
  new AppMaster(options).ready(callback);
}