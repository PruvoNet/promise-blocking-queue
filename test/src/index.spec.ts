'use strict';

import {BlockingQueue} from '../../dist';
import {expect} from 'chai';
import sleep = require('sleep-promise');

interface IEvent {
    name: string;
    time: number;
}

describe('promise blocking queue', () => {

    describe('constructor', () => {

        it('should fail if no concurrency was passed', (done) => {
            try {
                // @ts-ignore
                new BlockingQueue();
            } catch (error) {
                expect(error.message).to.eql(
                    `Expected \`concurrency\` to be a number from 1 and up, got \`undefined\` (undefined)`);
                done();
                return;
            }
            done(new Error('should fail'));
        });

        it('should fail if concurrency was not a number', (done) => {
            try {
                new BlockingQueue({
                    // @ts-ignore
                    concurrency: '1',
                });
            } catch (error) {
                expect(error.message).to.eql(
                    `Expected \`concurrency\` to be a number from 1 and up, got \`1\` (string)`);
                done();
                return;
            }
            done(new Error('should fail'));
        });

        it('should fail if concurrency is negative', (done) => {
            try {
                new BlockingQueue({
                    concurrency: -1,
                });
            } catch (error) {
                expect(error.message).to.eql(
                    `Expected \`concurrency\` to be a number from 1 and up, got \`-1\` (number)`);
                done();
                return;
            }
            done(new Error('should fail'));
        });

        it('should fail if concurrency is 0', (done) => {
            try {
                new BlockingQueue({
                    concurrency: 0,
                });
            } catch (error) {
                expect(error.message).to.eql(
                    `Expected \`concurrency\` to be a number from 1 and up, got \`0\` (number)`);
                done();
                return;
            }
            done(new Error('should fail'));
        });

    });

    describe('enqueue', () => {

        describe('result handling', () => {
            it('should return proper value (args with non promise result)', () => {
                const queue = new BlockingQueue({concurrency: 1});
                const item = queue.enqueue((x: number, y: number): string => {
                    return `${x + y}`;
                }, 5, 6);
                expect(queue.activeCount).to.eql(1);
                expect(queue.pendingCount).to.eql(0);
                return item.enqueuePromise
                    .then(() => {
                        return item.fnPromise;
                    })
                    .then((result) => {
                        expect(result).to.eql('11');
                        expect(queue.activeCount).to.eql(0);
                        expect(queue.pendingCount).to.eql(0);
                    });
            });

            it('should return proper value (args with promise result)', () => {
                const queue = new BlockingQueue({concurrency: 1});
                const item = queue.enqueue((x: number, y: number): Promise<string> => {
                    return Promise.resolve(`${x + y}`);
                }, 5, 6);
                expect(queue.activeCount).to.eql(1);
                expect(queue.pendingCount).to.eql(0);
                return item.enqueuePromise
                    .then(() => {
                        return item.fnPromise;
                    })
                    .then((result) => {
                        expect(queue.activeCount).to.eql(0);
                        expect(queue.pendingCount).to.eql(0);
                        expect(result).to.eql('11');
                    });
            });

            it('should return proper value (no args with non promise result)', () => {
                const queue = new BlockingQueue({concurrency: 1});
                const item = queue.enqueue((): string => {
                    return `11`;
                });
                expect(queue.activeCount).to.eql(1);
                expect(queue.pendingCount).to.eql(0);
                return item.enqueuePromise
                    .then(() => {
                        return item.fnPromise;
                    })
                    .then((result) => {
                        expect(queue.activeCount).to.eql(0);
                        expect(queue.pendingCount).to.eql(0);
                        expect(result).to.eql('11');
                    });
            });

            it('should return proper value (no args with promise result)', () => {
                const queue = new BlockingQueue({concurrency: 1});
                const item = queue.enqueue((): Promise<string> => {
                    return Promise.resolve(`11`);
                });
                expect(queue.activeCount).to.eql(1);
                expect(queue.pendingCount).to.eql(0);
                return item.enqueuePromise
                    .then(() => {
                        return item.fnPromise;
                    })
                    .then((result) => {
                        expect(queue.activeCount).to.eql(0);
                        expect(queue.pendingCount).to.eql(0);
                        expect(result).to.eql('11');
                    });
            });
        });

        describe('concurrency handling', () => {
            const constructRunFn = (timeout: number) => (name: string, events: IEvent[]): Promise<string> => {
                events.push({
                    name,
                    time: Date.now(),
                });
                return sleep(timeout)
                    .then(() => {
                        return name;
                    });
            };

            it('should run only a single task at a time', () => {
                const events: IEvent[] = [];
                const queue = new BlockingQueue({concurrency: 1});
                const resultOne = queue.enqueue(constructRunFn(100), 'one', events);
                expect(queue.activeCount).to.eql(1);
                expect(queue.pendingCount).to.eql(0);
                const resultTwo = queue.enqueue(constructRunFn(100), 'two', events);
                expect(queue.activeCount).to.eql(1);
                expect(queue.pendingCount).to.eql(1);
                return resultOne.enqueuePromise
                    .then(() => {
                        return resultOne.fnPromise;
                    })
                    .then((result) => {
                        expect(result).to.eql('one');
                        expect(queue.activeCount).to.eql(1);
                        expect(queue.pendingCount).to.eql(0);
                        return resultTwo.enqueuePromise;
                    })
                    .then(() => {
                        return resultTwo.fnPromise;
                    })
                    .then((result) => {
                        expect(result).to.eql('two');
                        expect(queue.activeCount).to.eql(0);
                        expect(queue.pendingCount).to.eql(0);
                        expect(events.length).to.eql(2);
                        expect(events[0].name).to.eql('one');
                        expect(events[1].name).to.eql('two');
                        expect(events[1].time - events[0].time).to.be.gt(50);
                    });
            });

            it('should run only 2 tasks at a time', () => {
                const events: IEvent[] = [];
                const queue = new BlockingQueue({concurrency: 2});
                const resultOne = queue.enqueue(constructRunFn(100), 'one', events);
                expect(queue.activeCount).to.eql(1);
                expect(queue.pendingCount).to.eql(0);
                const resultTwo = queue.enqueue(constructRunFn(100), 'two', events);
                expect(queue.activeCount).to.eql(2);
                expect(queue.pendingCount).to.eql(0);
                const resultThree = queue.enqueue(constructRunFn(100), 'three', events);
                expect(queue.activeCount).to.eql(2);
                expect(queue.pendingCount).to.eql(1);
                return Promise.all([resultOne.enqueuePromise, resultTwo.enqueuePromise])
                    .then(() => {
                        return Promise.all([resultOne.fnPromise, resultTwo.fnPromise]);
                    })
                    .then((results) => {
                        expect(results[0]).to.eql('one');
                        expect(results[1]).to.eql('two');
                        expect(queue.activeCount).to.eql(1);
                        expect(queue.pendingCount).to.eql(0);
                        return resultThree.enqueuePromise;
                    })
                    .then(() => {
                        return resultThree.fnPromise;
                    })
                    .then((result) => {
                        expect(result).to.eql('three');
                        expect(queue.activeCount).to.eql(0);
                        expect(queue.pendingCount).to.eql(0);
                        expect(events.length).to.eql(3);
                        expect(events[0].name).to.eql('one');
                        expect(events[1].name).to.eql('two');
                        expect(events[2].name).to.eql('three');
                        expect(events[1].time - events[0].time).to.be.lt(50);
                        expect(events[2].time - events[1].time).to.be.gte(99);
                    });
            });

            it('should block if too many are running', () => {
                const events: IEvent[] = [];
                const queue = new BlockingQueue({concurrency: 2});
                queue.enqueue(constructRunFn(200), 'one', events);
                queue.enqueue(constructRunFn(200), 'two', events);
                const resultThree = queue.enqueue(constructRunFn(0), 'three', events);
                return resultThree.enqueuePromise
                    .then(() => {
                        return resultThree.fnPromise;
                    })
                    .then(() => {
                        expect(events.length).to.eql(3);
                        expect(events[0].name).to.eql('one');
                        expect(events[1].name).to.eql('two');
                        expect(events[2].name).to.eql('three');
                        expect(events[1].time - events[0].time).to.be.lt(50);
                        expect(events[2].time - events[1].time).to.be.gte(200);
                    });
            });

            it('should emit proper events', () => {
                const events: IEvent[] = [];
                const queue = new BlockingQueue({concurrency: 2});
                let isEmpty = false;
                let isIdle = false;
                queue.on('empty', () => {
                    isEmpty = true;
                });
                queue.on('idle', () => {
                    isIdle = true;
                });
                queue.enqueue(constructRunFn(100), 'one', events);
                const resultTwo = queue.enqueue(constructRunFn(200), 'two', events);
                const resultThree = queue.enqueue(constructRunFn(200), 'three', events);
                return resultTwo.fnPromise
                    .then(() => {
                        expect(isEmpty).to.eql(true);
                        expect(isIdle).to.eql(false);
                        return resultThree.fnPromise;
                    })
                    .then(() => {
                        expect(isEmpty).to.eql(true);
                        expect(isIdle).to.eql(true);
                    });
            });

        });

    });

});
