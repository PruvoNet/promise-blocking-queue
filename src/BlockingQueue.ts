'use strict';

import {EventEmitter} from 'events';
import {StrictEventEmitter} from './EventEmitterTypesHelper';
import {IBlockingQueueOptions, IEnqueueResult, QueueFn} from './types';

interface IBlockingQueueEvents {
    idle: void;
    empty: void;
}

type MessageEmitter = StrictEventEmitter<EventEmitter, IBlockingQueueEvents>;

type PromiseResolve<T> = (value?: T | PromiseLike<T>) => void;

interface IPromiseParts<T> {
    promise: Promise<T>;
    resolve: PromiseResolve<T>;
}

interface IQueueItem<T, K extends any[]> {
    enqueueResolve: PromiseResolve<void>;
    fnResolve: PromiseResolve<T>;
    fn: QueueFn<T, K>;
    args: K;
}

export class BlockingQueue extends (EventEmitter as new() => MessageEmitter) {

    private readonly _options: IBlockingQueueOptions;
    private readonly _queue: Array<IQueueItem<any, any>> = [];
    private readonly _boundNext: any;
    private _activeCount: number = 0;

    constructor(options: IBlockingQueueOptions) {
        super();

        options = options || {};

        this._options = {
            ...options,
        };

        if (!(typeof this._options.concurrency === 'number' && this._options.concurrency >= 1)) {

            throw new TypeError(`Expected \`concurrency\` to be a number from 1 and up, got \`${
                this._options.concurrency}\` (${typeof this._options.concurrency})`);
        }

        this._boundNext = this._next.bind(this);
    }

    public enqueue<T, P extends any[]>(fn: QueueFn<T, P>, ...args: P): IEnqueueResult<T> {
        const fnPromiseParts = this._getPromiseParts<T>();
        const enqueuePromiseParts = this._getPromiseParts<void>();
        const item = {
            fn,
            args,
            fnResolve: fnPromiseParts.resolve,
            enqueueResolve: enqueuePromiseParts.resolve,
        };
        if (this.activeCount < this._options.concurrency) {
            this._run(item);
        } else {
            this._queue.push(item);
        }
        return {
            enqueuePromise: enqueuePromiseParts.promise,
            fnPromise: fnPromiseParts.promise,
        };
    }

    public get activeCount(): number {
        return this._activeCount;
    }

    public get pendingCount(): number {
        return this._queue.length;
    }

    private _next() {
        this._activeCount--;

        const item = this._queue.shift();
        if (item) {
            this._run(item);
        } else {
            this.emit('empty');
            if (this._activeCount === 0) {
                this.emit('idle');
            }
        }
    }

    private _run(item: IQueueItem<any, any>) {
        this._activeCount++;
        item.enqueueResolve();
        const result = Promise.resolve()
            .then(() => {
                return Promise.resolve(item.fn(...item.args));
            });
        item.fnResolve(result);
        result.then(this._boundNext, this._boundNext);
    }

    private _getPromiseParts<T>(): IPromiseParts<T> {
        let resolve: PromiseResolve<T>;
        const promise = new Promise<T>((_resolve) => {
            resolve = _resolve;
        });
        return {
            promise,
            // @ts-ignore
            resolve,
        };
    }
}
