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

The solution - a blocking queue that returns a promise that will be resolved when the added item gains an available slot in the 
queue, thus, allowing us to pause the stream consumption, until there is a _real_ need to consume the next item - keeping us 
memory smart while maintaining concurrency level of data handling.

## Install

```shell
npm install promise-blocking-queue
```

## Usage example

Let's assume we have a very large (a couple of GBs) file called `users.json` which contains a long list of users we want to add to our DB.  
Also, let's assume that our DB instance it very cheap, and as such we don't want to load it too much, so we only want to handle
2 concurrent DB insert operations.  

We can achieve a short scalable solution like so:

```typescript
import * as JSONStream from 'JSONStream';
import * as fs from 'fs';
import * as es from 'event-stream';
import * as sleep from 'sleep-promise';
import { BlockingQueue } from 'promise-blocking-queue';

const queue = new BlockingQueue({ concurrency: 2 });
let handled = 0;
let failed = 0;
let awaitDrain: Promise<void> | undefined;

const readStream = fs.createReadStream('./users.json', { flags: 'r', encoding: 'utf-8' });
const jsonReadStream = JSONStream.parse('*');
const jsonWriteStream = JSONStream.stringify();
const writeStream = fs.createWriteStream('./results.json');

const addUserToDB = async (user) => {
    try {
        console.log(`adding ${user.username}`);
        // Simulate long running task
        await sleep((handled + 1) * 100);
        console.log(`added ${user.username} #${++handled}`);
        const writePaused = !jsonWriteStream.write(user.username);
        if (writePaused && !awaitDrain) {
            // Down stream asked to pause the writes for now
            awaitDrain = new Promise((resolve) => {
                jsonWriteStream.once('drain', resolve);
            });
        }
    } catch (err) {
        console.log(`failed ${++failed}`, err);
    }
};

const handleUser = async (user) => {
    // Wait until the down stream is ready to receive more data without increasing the memory footprint
    if (awaitDrain) {
        await awaitDrain;
        awaitDrain = undefined;
    }
    return queue.enqueue(addUserToDB, user).enqueuePromise;
};

// Do not use async!
const mapper = (user, cb) => {
    console.log(`streamed ${user.username}`);
    handleUser(user)
        .then(() => {
            cb();
        });
    // Pause the read stream until we are ready to handle more data
    return false;
};

const onReadEnd = () => {
    console.log('done read streaming');
    // If nothing was written, idle event will not be fired
    if (queue.pendingCount === 0 && queue.activeCount === 0) {
        jsonWriteStream.end();
    } else {
        // Wait until all work is done
        queue.on('idle', () => {
            jsonWriteStream.end();
        });
    }
};

const onWriteEnd = () => {
    console.log(`done processing - ${handled} handled, ${failed} failed`);
    process.exit(0);
};

jsonWriteStream
    .pipe(writeStream)
    .on('error', (err) => {
        console.log('error wrtie streaming', err);
        process.exit(1);
    })
    .on('end', onWriteEnd)
    .on('finish', onWriteEnd);

readStream
    .pipe(jsonReadStream)
    .pipe(es.map(mapper))
    .on('data', () => {
        // Do nothing
    })
    .on('error', (err) => {
        console.log('error read streaming', err);
        process.exit(1);
    })
    .on('finish', onReadEnd)
    .on('end', onReadEnd);
```

If `users.json` is like:

```json
[
  {
    "username": "a"
  },
  {
    "username": "b"
  },
  {
    "username": "c"
  },
  {
    "username": "d"
  }
]
```

Output will be:

```bash
streamed a
adding a
streamed b
adding b
streamed c // c now waits in line to start and streaming is paused until then
added a #1
adding c // c only gets handled after a is done
streamed d // d only get streamed after c has a spot in the queue
added b #2
adding d // d only gets handled after b is done
done read streaming
added c #3
added d #4
done processing - 4 handled, 0 failed
```

`results.json` will be:

```json
[
"a"
,
"b"
,
"c"
,
"d"
]
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

###### started

Type: `boolean`

Indicates if the task has already started to run

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
