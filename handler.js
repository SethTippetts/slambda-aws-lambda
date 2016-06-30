'use strict';


const execute = require('./execute');

const initialize = execute.init();

module.exports.handler = (event, context, cb) => {
  context.callbackWaitsForEmptyEventLoop = false;
  initialize
    .then(ctx => {
      execute
        .main(event, ctx)
        .asCallback(cb);
    })
}
