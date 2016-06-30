'use strict';

const FileSystem = require('fs');
const path = require('path');

const AWS = require('aws-sdk');
const slambdaUtils = require('slambda-utils');
const Bluebird = require('bluebird');
const get = require('lodash.get');

const Batch = slambdaUtils.Batch;
const compile = slambdaUtils.compile;
const bundle = slambdaUtils.bundle;

AWS.config.setPromisesDependency(Bluebird);

module.exports = class AWSLambda {
  constructor(options) {
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
    let Body = bundle(compile(container, functions), path.join(__dirname, 'handler.js'), container.dependencies);
    let Key = `${container.id}.zip`;
    let prefix = get(this, 'options', 'aws', 's3', 'prefix');
    if (prefix) Key = `${prefix}/${Key}`;

    return Bluebird.fromCallback(cb => {
      let req = this.s3
        .upload({
          Key,
          Body,
        }, {}, cb);

      req.on('httpUploadProgress', function(evt) { console.info(evt); })
    })
    .then((obj) => {
      return updateLambda(this.lambda, container.id.replace(/\W+/, '-'), {
        Key,
        Bucket: this.bucket,
      });
    })
    .catch(console.error.bind(console));
  }

  execute(id, calls) {
    return this.lambda.invoke({
      FunctionName: id.replace(/\W+/, '-'),
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(calls),
    }).promise();
  }
}

function updateLambda(service, FunctionName, s3Options) {
  return service.getFunction({
    FunctionName,
  }).promise().reflect()
  .then(fn => {
    if (fn.isRejected()) {
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
    }

    let params = {
      FunctionName,
      S3Key: s3Options.Key,
      S3Bucket: s3Options.Bucket,
    };
    if (s3Options.Version) params.S3ObjectVersion = s3Options.Version;
    return service.updateFunctionCode(params).promise();
  })

}
