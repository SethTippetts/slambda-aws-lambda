'use strict';

const FileSystem = require('fs');
const path = require('path');

const AWS = require('aws-sdk');
const Local = require('slambda-local');
const Batch = require('slambda').Batch;
const Bluebird = require('bluebird');
const Archiver = require('archiver');
const get = require('lodash.get');

const debug = require('debug')('slambda:execution:Lambda');

const HANDLER = path.join(__dirname, 'handler.js');

AWS.config.setPromisesDependency(Bluebird);

module.exports = class AWSLambda extends Local {
  constructor(options) {
    super(options);
    debug('constructor');
    let region = options.region;
    let Bucket = options.s3.bucket;
    this.bucket = Bucket;
    this.options = options;
    this.lambda = new AWS.Lambda({ region });
    this.s3 = new AWS.S3({ region, params: { Bucket } });

    // Batching
    let batch = new Batch(this.execute.bind(this));
    this.run = batch.run.bind(batch);
  }

  deploy(container, functions) {
    debug(`#deploy() Container: ${container.id}`);
    return super.deploy(container, functions)
      .then(cwd => {
        debug(`#deploy() Local directory created: ${cwd}`)
        let Key = `${container.id}.zip`;
        let prefix = get(this, ['options', 's3', 'prefix']);
        if (prefix) Key = `${prefix}/${Key}`;

        let Body = bundle(cwd);

        return Bluebird.fromCallback(cb => this.s3.upload({ Key, Body }, cb))
        .tap(() => debug(`#deploy Uploaded to S3`))
        .then((obj) => {
          return updateLambda(this.lambda, container.id.replace(/\W+/, '-'), {
            Key,
            Bucket: this.bucket,
          });
        })
        .tap(() => debug(`#deploy Lambda ${container.id} deployed`))
        .catch(console.error.bind(console));
      })
  }

  execute(id, calls) {
    return this.lambda.invoke({
      FunctionName: id.replace(/\W+/, '-'),
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(calls),
    })
    .promise()
    .then(results => JSON.parse(results.Payload))
    .catch(ex => console.error(ex));
  }
}

function bundle(cwd) {
  let archive = new Archiver('zip');

  archive.on('error', console.error.bind(console));

  archive.append(FileSystem.createReadStream(HANDLER), {
    name: 'handler.js',
  });

  archive.glob('**', { cwd });
  archive.finalize();

  return archive;
}

function lambdaExists(service, FunctionName) {
  return service
    .getFunction({
      FunctionName,
    })
    .promise()
    .reflect()
    .then(fn => !fn.isRejected())
}

function updateLambda(service, FunctionName, s3Options) {
  return lambdaExists(service, FunctionName)
    .then(exists => {
      if (exists) {
        let params = {
          FunctionName,
          S3Key: s3Options.Key,
          S3Bucket: s3Options.Bucket,
        };
        if (s3Options.Version) params.S3ObjectVersion = s3Options.Version;
        return service.updateFunctionCode(params).promise();
      }

      let params = {
        Code: { /* required */
          S3Bucket: s3Options.Bucket,
          S3Key: s3Options.Key,
        },
        FunctionName,
        Handler: 'handler.handler',
        Role: 'arn:aws:iam::611601652995:role/graphyte-microservices-dev-r-IamRoleLambda-16OO7ZHGUUC5A', /* required */
        Runtime: 'nodejs4.3',
        MemorySize: 1024,
        Publish: true,
        Timeout: 10,
      };
      if (s3Options.Version) params.Code.S3ObjectVersion = s3Options.Version;
      return service.createFunction(params).promise();
    });

}
