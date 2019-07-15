[![Npm Version](https://img.shields.io/npm/v/promise-blocking-queue.svg?style=popout)](https://www.npmjs.com/package/promise-blocking-queue)
[![Build Status](https://travis-ci.org/PruvoNet/promise-blocking-queue.svg?branch=master)](https://travis-ci.org/PruvoNet/promise-blocking-queue)
[![Coverage Status](https://coveralls.io/repos/github/PruvoNet/promise-blocking-queue/badge.svg?branch=master)](https://coveralls.io/github/PruvoNet/promise-blocking-queue?branch=master)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/58abd1713b064f4c9af7dc88d7178ebe)](https://www.codacy.com/app/regevbr/promise-blocking-queue?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=PruvoNet/promise-blocking-queue&amp;utm_campaign=Badge_Grade)
[![Known Vulnerabilities](https://snyk.io/test/github/PruvoNet/promise-blocking-queue/badge.svg?targetFile=package.json)](https://snyk.io/test/github/PruvoNet/promise-blocking-queue?targetFile=package.json)
[![dependencies Status](https://david-dm.org/PruvoNet/promise-blocking-queue/status.svg)](https://david-dm.org/PruvoNet/promise-blocking-queue)
[![devDependencies Status](https://david-dm.org/PruvoNet/promise-blocking-queue/dev-status.svg)](https://david-dm.org/PruvoNet/promise-blocking-queue?type=dev)

# Promise Blocking Queue
Memory optimized promise blocking queue with concurrency control, specially designed to handle large data sets that must 
be consumed using streams.  

Useful for rate-limiting async (or sync) operations that consume large data sets. 
For example, when interacting with a REST API or when doing CPU/memory intensive tasks.

## Why
If we use `Bluebird.map()` for example, we are forced to load all the data in memory, 
before being able to consume it - Out Of Memory Exception is right around the corner.   

If we use [p-queue](https://github.com/sindresorhus/p-limit) (by the amazing [sindresorhus](https://github.com/sindresorhus)) 
for example, we can utilize streams to avoid memory bloat, but we have no (easy) way to control 
the stream flow without hitting that Out Of Memory Exception.

The solution - a blocking queue that returns a promise that will be resolved when the added item gain an available slot in the 
queue, thus, allowing us to pause the stream consumption, until there is a _real_ need to consume the next item - keeping us 
memory smart while maintaining concurrency level of data handling.

## Install

```shell
npm install promise-blocking-queue
```

## Usage

Let's assume we have a very large (a couple of GBs) file called `users.json` which contains a long list of users we want to add to our DB.
Also, let's assume that our DB instance it very cheap, and as such we don't want to load it to much, so we only want to handle
100 concurrent DB insert operations.
We can achieve a short scalable solution like:

```typescript
import * as JSONStream from 'JSONStream';
import * as fs from 'fs';
import * as _ from 'underscore';
import * as es from 'event-stream';
import { BlockingQueue } from 'promise-blocking-queue';

const queue = new BlockingQueue({ concurrency: 100 });
let count = 0;

const mapper = (user, cb) => {
  queue.enqueue(() => {
    // Add user to DB
    return Promise.resolve();
  }).enqueuePromise
    .then(() => {
      console.log('handled', count++);
      cb();
    })
    .catch((err) => {
      cb(err);
    });
  return false;
};

const readStream = fs.createReadStream('./users.json', { flags: 'r', encoding: 'utf-8' });
const jsonReadStream = JSONStream.parse('*');
const mapStream = es.map(mapper);

readStream
  .pipe(jsonReadStream)
  .pipe(mapStream)
  .on('data', _.noop)
  .on('error', (err) => {
    console.log('error streaming', err);
    process.exit(1);
  })
  .on('end', () => {
    console.log('done streaming');
    queue.on('idle', () => {
      console.log('done processing', count);
      process.exit(0);
    });
  });
```

## API

### BlockingQueue(options)

Returns a new `queue` instance, which is an `EventEmitter` subclass.

#### options

Type: `object`

##### concurrency

Type: `number`  
Default: `Infinity`  
Minimum: `1`

Concurrency limit.

### queue

`BlockingQueue` instance.

#### .enqueue(fn, ...args)

Adds a sync or async task to the queue

##### Return value

Type: `object`

###### enqueuePromise

Type: `Promise<void>`

A promise that will be resolved when the queue has an available slot to run the task.  
Used to realize that it is a good time to add another task to the queue.

###### fnPromise

Type: `Promise<T>`

A promise that will be resolved with the result of `fn`.

##### fn

Type: `Function`

Promise/Value returning function.

##### args

Type: `any[]`

The arguments to pass to the function

#### activeCount

The number of promises that are currently running.

#### pendingCount

The number of promises that are waiting to run.

### Events

#### empty

Emitted when the queue becomes empty.
Useful if, for example, you add additional items at a later time.

#### idle

Emitted when the queue becomes empty, and all promises have completed: `queue.activeCount === 0 && queue.pendingCount === 0`.

The difference with `empty` is that `idle` guarantees that all work from the queue has finished.
`empty` merely signals that the queue is empty, but it could mean that some promises haven't completed yet.

## Credits
The library is based on 
[p-limit](https://github.com/sindresorhus/p-limit) and [p-queue](https://github.com/sindresorhus/p-queue) (by the amazing [sindresorhus](https://github.com/sindresorhus))

## Versions

Promise Blocking Queue supports Node 6 LTS and higher.

## Contributing

All contributions are happily welcomed!  
Please make all pull requests to the `master` branch from your fork and ensure tests pass locally.
