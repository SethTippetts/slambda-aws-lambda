'use strict';


const execute = require('./execute');

module.exports.handler = (event, context, cb) => {
  context.callbackWaitsForEmptyEventLoop = false;
  execute.init
    .then(ctx => {
      execute
        .main(event, ctx)
        .asCallback(cb);
    })
}
