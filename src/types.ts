'use strict';

export interface IBlockingQueueOptions {
    concurrency: number;
}

export type QueueFn<T, P extends any[]> = ((...args: P) => Promise<T> | T);

export interface IEnqueueResult<T> {
    enqueuePromise: Promise<void>;
    fnPromise: Promise<T>;
}
