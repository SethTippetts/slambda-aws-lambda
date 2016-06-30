# Slambda AWS Lambda

Execute Slambda code sandboxes in AWS Lambda

## Usage

```js
const Slambda = require('slambda');
const AWSLambda = require('slambda-aws-lambda');

const execution = new AWSLambda({
  region: '<AWS_REGION>',
  s3: {
    bucket: '<BUCKET_NAME>',
    prefix: '<PREFIX_NAME>',
  }
});
const slambda = new Slambda({ execution });
