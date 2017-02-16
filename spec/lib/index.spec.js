"use strict";

describe("lib/index.js", () => {
    var morePromises, timer;


    /**
     * Create a delayed promise that resolves or rejects
     *
     * @param {number} ms
     * @param {*} result
     * @param {boolean} [isFailure=false]
     * @return {Promise}
     */
    function delayedPromise(ms, result, isFailure) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (isFailure) {
                    reject(result);
                } else {
                    resolve(result);
                }
            }, ms);
        });
    }


    /**
     * Get timer's elapsed time in milliseconds.
     *
     * @return {number}
     */
    function elapsedTime() {
        if (!timer) {
            return null;
        }

        return new Date() - timer;
    }


    /**
     * Start a timer.
     */
    function startTimer() {
        timer = new Date();
    }


    beforeEach(() => {
        morePromises = require("../..");
        timer = null;
    });
    describe("all()", () => {
        it("waits for delayed promises and preserves indexes", () => {
            return morePromises.all([
                delayedPromise(15, 15),
                delayedPromise(5, 5),
                "some value"
            ]).then((result) => {
                expect(result).toEqual([
                    15,
                    5,
                    "some value"
                ]);
            });
        });
        it("rejects with the first rejection", () => {
            startTimer();

            return morePromises.all({
                fast: delayedPromise(10, 10),
                rejected: delayedPromise(15, 15, true),
                slow: delayedPromise(100),
                secondRejected: delayedPromise(150, 150, true)
            }).then(jasmine.fail, (rejection) => {
                expect(elapsedTime()).toBeLessThan(100);
                expect(rejection).toBe(15);
            });
        });
        it("works when there's nothing in the list", () => {
            return morePromises.all([]).then((result) => {
                expect(result).toEqual([]);
            });
        });
    });
    describe("callbackify()", () => {
        it("sends the resolved value", (done) => {
            morePromises.callbackify(delayedPromise(10, "ok"), (err, value) => {
                expect(err).toBe(null);
                expect(value).toBe("ok");
                done();
            });
        });
        it("sends an error", (done) => {
            morePromises.callbackify(delayedPromise(10, "fail", true), (err, value) => {
                expect(err).toBe("fail");
                expect(value).not.toBeDefined();
                done();
            });
        });
    });
    describe("delay()", () => {
        it("waits at least the necessary amount of time", () => {
            startTimer();

            return morePromises.delay(100).then(() => {
                expect(elapsedTime()).not.toBeLessThan(100);
                expect(elapsedTime()).toBeLessThan(500);
            });
        });
        it("chains onto a promise", () => {
            var promise;

            promise = new Promise((resolve) => {
                setTimeout(() => {
                    startTimer();
                    resolve("abc");
                }, 100);
            });

            return morePromises.delay(promise, 100).then((result) => {
                expect(result).toBe("abc");
                expect(elapsedTime()).not.toBeLessThan(100);
                expect(elapsedTime()).toBeLessThan(500);
            });
        });
        it("rejects immediately", () => {
            startTimer();

            return morePromises.delay(Promise.reject("reason"), 100).then(jasmine.fail, (rejection) => {
                expect(elapsedTime()).toBeLessThan(50);
                expect(rejection).toBe("reason");
            });
        });
    });
    describe("newPromise()", () => {
        it("creates a Promise and calls a defined function", () => {
            var promise, spy;

            spy = jasmine.createSpy("workFunction").and.callFake((resolve, reject) => {
                expect(resolve).toEqual(jasmine.any(Function));
                expect(reject).toEqual(jasmine.any(Function));
                resolve(delayedPromise(10, "this worked"));
            });
            promise = morePromises.newPromise(spy);
            expect(promise).toEqual(jasmine.any(Promise));

            return promise.then((result) => {
                expect(result).toBe("this worked");
            });
        });
        it("is used by other functions for promise generation", () => {
            var spy;

            spyOn(morePromises, "newPromise");
            spy = morePromises.newPromise;
            expect(spy.calls.count()).toBe(0);
            morePromises.all([]);
            expect(spy.calls.count()).toBe(1);
            morePromises.delay(1);
            expect(spy.calls.count()).toBe(2);
            morePromises.promisify(() => {})();
            expect(spy.calls.count()).toBe(3);
            morePromises.settle({});
            expect(spy.calls.count()).toBe(4);
            morePromises.race([]);
            expect(spy.calls.count()).toBe(5);
            morePromises.reflect({});
            expect(spy.calls.count()).toBe(6);
            morePromises.timeout({}, 1);
            expect(spy.calls.count()).toBe(7);
        });
    });
    describe("promisify()", () => {
        it("changes a callback-based function to promises", () => {
            var wrapped;

            wrapped = morePromises.promisify((callback) => {
                expect(callback).toEqual(jasmine.any(Function));
                setTimeout(() => {
                    callback(null, "something");
                }, 10);
            });

            return wrapped().then((result) => {
                expect(result).toBe("something");
            });
        });
        it("passes arguments", () => {
            var wrapped;

            wrapped = morePromises.promisify((one, two, callback) => {
                expect(one).toBe("one");
                expect(two).toBe("two");
                expect(callback).toEqual(jasmine.any(Function));
                setTimeout(() => {
                    callback(null, "something");
                }, 10);
            });

            return wrapped("one", "two").then((result) => {
                expect(result).toBe("something");
            });
        });
        it("uses a supplied context", () => {
            var context, wrapped;

            context = {};

            // Do not use an arrow function here
            /* eslint no-invalid-this:off */
            wrapped = morePromises.promisify(function (callback) {
                this.worked = true;
                callback();
            }, context);

            return wrapped().then(() => {
                expect(context.worked).toBe(true);
            });
        });
        it("sends errors as rejected promises", () => {
            var wrapped;

            wrapped = morePromises.promisify((callback) => {
                callback("this is an error");
            });

            return wrapped().then(jasmine.fail, (rejection) => {
                expect(rejection).toBe("this is an error");
            });
        });
    });
    describe("promisifyAll()", () => {
        it("promisifies only functions without Async at the end", () => {
            var obj;

            obj = {
                // Already has Async
                thingAsync: () => {},

                // Not a function
                num: 7,

                // Not a function
                str: "str",

                // This gets promisified
                func: () => {},

                // Avoid overwriting overwriteAsync
                overwrite: () => {},
                overwriteAsync: true
            };

            obj.prototype = {
                // Does not go up the prototype chain. Maybe at a later date.
                func: () => {},

                // Not a function and also not scanned
                proto: true
            };

            // Explicitly excluded
            Object.defineProperty(obj, "getter", {
                configurable: true,
                get: () => {}
            });

            // Explicitly excluded
            Object.defineProperty(obj, "setter", {
                configurable: true,
                get: () => {}
            });
            morePromises.promisifyAll(obj);
            expect(Object.keys(obj).sort()).toEqual([
                "func",
                "funcAsync",
                "num",
                "overwrite",
                "overwriteAsync",
                "prototype",
                "str",
                "thingAsync"
            ]);
            expect(obj.overwriteAsync).toBe(true);
        });
        it("converts callback functions to promises", () => {
            var obj;

            obj = {
                func: (callback) => {
                    callback(null, "ok!");
                }
            };
            morePromises.promisifyAll(obj);
            expect(obj.funcAsync).toEqual(jasmine.any(Function));

            return obj.funcAsync().then((result) => {
                expect(result).toBe("ok!");
            });
        });
    });
    describe("settle()", () => {
        it("waits for delayed promises and preserves indexes", () => {
            return morePromises.settle([
                delayedPromise(15, 15),
                delayedPromise(5, 5),
                "some value"
            ]).then((result) => {
                expect(result).toEqual([
                    15,
                    5,
                    "some value"
                ]);
            });
        });
        it("rejects only after all promises are done and preserves indexes", () => {
            startTimer();

            return morePromises.settle({
                fast: delayedPromise(10, 10),
                rejected: delayedPromise(5, 5, true),
                slow: delayedPromise(50, "last", true),
                value: "some value"
            }).then(jasmine.fail, (rejection) => {
                expect(elapsedTime()).not.toBeLessThan(50);
                expect(elapsedTime()).toBeLessThan(100);
                expect(rejection).toEqual({
                    rejected: 5,
                    slow: "last"
                });
            });
        });
    });
    describe("race()", () => {
        it("resolves if the first one is resolved", () => {
            startTimer();

            return morePromises.race([
                delayedPromise(15, 15),
                delayedPromise(5, 5),
                delayedPromise(10, 10, true),
                delayedPromise(100, 100)
            ]).then((result) => {
                expect(result).toEqual(5);
                expect(elapsedTime()).not.toBeLessThan(5);
                expect(elapsedTime()).toBeLessThan(20);
            });
        });
        it("rejects if the first one is rejected", () => {
            startTimer();

            return morePromises.race([
                delayedPromise(15, 15),
                delayedPromise(5, 5, true),
                delayedPromise(10, 10),
                delayedPromise(100, 100)
            ]).then(jasmine.fail, (result) => {
                expect(result).toEqual(5);
                expect(elapsedTime()).not.toBeLessThan(5);
                expect(elapsedTime()).toBeLessThan(20);
            });
        });
        it("resolves immediately if a non-promise is supplied", () => {
            startTimer();

            return morePromises.race([
                delayedPromise(10, 10, false),
                "thing"
            ]).then((result) => {
                expect(elapsedTime()).toBeLessThan(10);
                expect(result).toBe("thing");
            });
        });
        it("resolves if there's nothing in the list", () => {
            return morePromises.race({}).then((result) => {
                expect(result).not.toBeDefined();
            });
        });
    });
    describe("reflect()", () => {
        it("always resolves and provides all promise statuses", () => {
            return morePromises.reflect([
                delayedPromise(5, 5),
                delayedPromise(10, 10, true),
                "a value"
            ]).then((result) => {
                expect(result).toEqual([
                    {
                        state: "fulfilled",
                        value: 5
                    },
                    {
                        state: "rejected",
                        value: 10
                    },
                    {
                        state: "not-promise",
                        value: "a value"
                    }
                ]);
            });
        });
        it("resolves when given an empty list", () => {
            return morePromises.reflect({}).then((result) => {
                expect(result).toEqual({});
            });
        });
    });
    describe("timeout()", () => {
        it("lets a promise resolve", () => {
            return morePromises.timeout(delayedPromise(10, 10), 20).then((result) => {
                expect(result).toEqual(10);
            });
        });
        it("lets a promise fail and fails the returned promise", () => {
            return morePromises.timeout(delayedPromise(10, 10, true), 20).then(jasmine.fail, (result) => {
                expect(result).toEqual(10);
            });
        });
        it("times out with a generic error message", () => {
            return morePromises.timeout(delayedPromise(100, 100), 10).then(jasmine.fail, (result) => {
                expect(result).toEqual(jasmine.any(Error));
                expect(result.toString()).toContain("Timeout after 10 milliseconds");
            });
        });
        it("times out with a specific rejection", () => {
            return morePromises.timeout(delayedPromise(100, 100), 10, "sad").then(jasmine.fail, (result) => {
                expect(result).toEqual("sad");
            });
        });
    });
});
