"use strict";

var exportedObject;

/**
 * The library accepts these types of structures for a list.
 *
 * @typedef {(Array|Object)} morePromises~list
 */

/**
 * Iterate over an object or an array.  Calls the function with the following
 * arguments.
 *
 *   fn(value, key)
 *
 * @param {morePromises~list} list
 * @param {function} fn
 */
function iterate(list, fn) {
    if (Array.isArray(list)) {
        list.forEach(fn);
    } else {
        Object.keys(list).forEach((key) => {
            fn(list[key], key);
        });
    }
}


/**
 * Creates a new promise. Override this function in order to inject your
 * own Promise implementation.
 *
 * The function passed in is expected to receive a resolve function and
 * a reject function which will resolve/reject the promise that's returned
 * from this function.
 *
 * @param {Function} fn
 * @return {Promise.<*>}
 */
function newPromise(fn) {
    return new Promise(fn);
}


/**
 * Creates a destination object that is similar to what's passed in.
 *
 * @param {morePromises~list} list
 * @return {morePromises~list} Empty, new list
 */
function makeSimilarList(list) {
    if (Array.isArray(list)) {
        return [];
    }

    return {};
}


/**
 * Condenses a sparse array and returns the condensed array.
 * If the list isn't an array, this will just return the list.
 *
 * @param {morePromises~list} list
 * @return {morePromises~list}
 */
function condenseSparse(list) {
    var denseArray;

    if (Array.isArray(list)) {
        denseArray = list;
        denseArray = denseArray.filter((x) => {
            return x !== null;
        });

        return denseArray;
    }

    return list;
}


/**
 * Resolve all of the promises. When all of the promises are resolved, the
 * returned promise is resolved with a list, preserving keys, with the
 * resolved values.
 *
 * If any promise is rejected, this fails fast and bails. The first
 * rejection is provided.
 *
 * @param {morePromises~list} list
 * @return {Promise.<morePromises~list>}
 */
function all(list) {
    return exportedObject.newPromise((resolve, reject) => {
        var isDone, needed, result;

        isDone = false;
        result = makeSimilarList(list);
        needed = 1;
        iterate(list, (value, key) => {
            if (typeof value.then === "function") {
                needed += 1;
                value.then((resolution) => {
                    result[key] = resolution;

                    if (!isDone) {
                        needed -= 1;

                        if (!needed) {
                            isDone = true;
                            resolve(result);
                        }
                    }
                }, (rejection) => {
                    if (!isDone) {
                        isDone = true;
                        reject(rejection);
                    }
                });
            } else {
                result[key] = value;
            }
        });

        needed -= 1;

        if (!needed) {
            isDone = true;
            resolve(result);
        }
    });
}


/**
 * Chain a node-style callback to a promise's resolution.
 *
 * @param {Promise} promise
 * @param {function} callback
 * @return {Promise}
 */
function callbackify(promise, callback) {
    return promise.then((resolution) => {
        callback(null, resolution);
    }, callback);
}


/**
 * Wait a specified amount of time then continue promise resolution.
 * When a promise is supplied as the first argument, the delay happens
 * after the first promise is resolved. No delay is added if the first
 * promise is rejected.
 *
 * @param {Promise.<*>} [promise]
 * @param {number} ms
 * @return {Promise.<*>}
 */
function delay(promise, ms) {
    if (typeof promise === "number") {
        ms = promise;
        promise = null;
    }

    return exportedObject.newPromise((resolve, reject) => {
        /**
         * Start the delay and resolve the promise with the provided
         * value.
         *
         * @param {*} value
         */
        function trigger(value) {
            setTimeout(() => {
                resolve(value);
            }, ms);
        }

        if (promise) {
            promise.then((resolution) => {
                trigger(resolution);
            }, reject);
        } else {
            trigger();
        }
    });
}


/**
 * Wraps a node-style callback function and instead returns a Promise.
 *
 * @param {function} fn
 * @param {Object} [context]
 * @return {Promise.<*>}
 */
function promisify(fn, context) {
    // typeof null === "object", but that's ok in this instance
    if (typeof context !== "object") {
        context = null;
    }

    return function () {
        var args;

        args = [].slice.call(arguments);

        return exportedObject.newPromise((resolve, reject) => {
            args.push((err, val) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(val);
                }
            });
            fn.apply(context, args);
        });
    };
}


/**
 * Runs `promisify()` on all properties of an object, saving the promisified
 * version of the method with "Async" appended.
 *
 * If the object already has the ...Async property defined, this does not
 * overwrite. In this way it does not double-promisify any methods. Also,
 * nothing is promisified if it ends in Async.
 *
 * @param {(Object|function)} obj
 * @return {Object}
 */
function promisifyAll(obj) {
    Object.getOwnPropertyNames(obj).filter((name) => {
        var desc;

        desc = Object.getOwnPropertyDescriptor(obj, name);

        if (!desc || desc.get || desc.set) {
            return false;
        }

        if (typeof obj[name] !== "function") {
            return false;
        }

        if (name.match(/Async$/)) {
            return false;
        }

        if (Object.prototype.hasOwnProperty.call(obj, `${name}Async`)) {
            return false;
        }

        return true;
    }).forEach((name) => {
        obj[`${name}Async`] = promisify(obj[name], obj);
    });

    return obj;
}


/**
 * Resolve all of the promises. When all of the promises are resolved, the
 * returned promise is resolved with a list, preserving keys, with the
 * resolved values.
 *
 * If any promise is rejected, the rejections are collected and the returned
 * promise is rejected with that collection. Original indices of the list
 * are preserved.
 *
 * If the `settle` property in the `options` parameter is set, the returned
 * list won't have its original indices preserved. Instead, the undefined
 * indices will be removed.
 *
 * @param {morePromises~list} list
 * @param {Object} [options=false]
 * @return {Promise.<morePromises~list>}
 */
function settle(list, options) {
    options = options || {};

    return exportedObject.newPromise((resolve, reject) => {
        var isFailure, needed, rejections, result;

        /**
         * Send the result if we need nothing else.
         */
        function isSettleDone() {
            needed -= 1;

            if (!needed) {
                if (isFailure) {
                    if (options.sparse) {
                        rejections = condenseSparse(rejections);
                    }

                    reject(rejections);
                } else {
                    if (options.sparse) {
                        result = condenseSparse(result);
                    }

                    resolve(result);
                }
            }
        }

        isFailure = false;
        result = makeSimilarList(list);
        rejections = makeSimilarList(list);
        needed = 1;
        iterate(list, (value, key) => {
            if (typeof value.then === "function") {
                needed += 1;
                value.then((resolution) => {
                    result[key] = resolution;
                    isSettleDone();
                }, (rejection) => {
                    isFailure = true;
                    rejections[key] = rejection;
                    isSettleDone();
                });
            } else {
                result[key] = value;
            }
        });
        isSettleDone();
    });
}


/**
 * Resolve or reject based on the first promise that is settled. Ignore
 * all of the slower promises.
 *
 * @param {morePromises~list} list
 * @return {Promise.<morePromises~list>}
 */
function race(list) {
    return exportedObject.newPromise((resolve, reject) => {
        var isDone, otherPromises;

        /**
         * Send the result if this is the first result.
         *
         * @param {function} resolveOrReject
         * @param {*} value
         */
        function wasSettled(resolveOrReject, value) {
            if (!isDone) {
                isDone = true;
                resolveOrReject(value);
            }
        }

        isDone = false;
        otherPromises = false;
        iterate(list, (value) => {
            otherPromises = true;

            if (typeof value.then === "function") {
                value.then((resolution) => {
                    wasSettled(resolve, resolution);
                }, (rejection) => {
                    wasSettled(reject, rejection);
                });
            } else {
                wasSettled(resolve, value);
            }
        });

        if (!otherPromises) {
            wasSettled(resolve);
        }
    });
}


/**
 * Resolve all of the promises. When all of the promises are resolved or
 * rejected, the returned promise is resolved with a list, preserving keys,
 * with value objects that resemble this:
 *
 *   {
 *       state: "fulfilled" // or "rejected"
 *       value: ... // The resolution or rejection value
 *   }
 *
 * If the original value was not a promise, it instead will look like this:
 *
 *   {
 *       state: "not-promise"
 *       value: ... // The original value
 *   }
 *
 *
 * The returned promise is never rejected.
 *
 * @param {morePromises~list} list
 * @return {Promise.<morePromises~list>}
 */
function reflect(list) {
    return exportedObject.newPromise((resolve) => {
        var needed, result;

        /**
         * Store the result of the promise.  Send the result if we need
         * nothing else.
         *
         * @param {*} key
         * @param {string} state
         * @param {*} value
         */
        function wasSettled(key, state, value) {
            result[key] = {
                state,
                value
            };
            needed -= 1;

            if (!needed) {
                resolve(result);
            }
        }

        result = makeSimilarList(list);
        needed = 1;
        iterate(list, (value, key) => {
            needed += 1;

            if (typeof value.then === "function") {
                value.then((resolution) => {
                    wasSettled(key, "fulfilled", resolution);
                }, (rejection) => {
                    wasSettled(key, "rejected", rejection);
                });
            } else {
                wasSettled(key, "not-promise", value);
            }
        });

        needed -= 1;

        if (!needed) {
            resolve(result);
        }
    });
}


/**
 * Creates a promise that is resolved or rejected by the original promise.
 * However, a timer is also started and the timer can reject the promise
 * early if the time elapses.
 *
 * @param {Promise} promise
 * @param {number} ms
 * @param {*} [timeoutRejection=Error(`Timeout after ${ms} milliseconds`)]
 * @return {Promise}
 */
function timeout(promise, ms, timeoutRejection) {
    if (!timeoutRejection) {
        timeoutRejection = new Error(`Timeout after ${ms} milliseconds`);
    }

    return exportedObject.newPromise((resolve, reject) => {
        var settled;

        /**
         * Guards resolve/reject so the outgoing promise is only
         * resolved or rejected once.
         *
         * @param {function} fn resolve or reject
         * @param {*} value
         */
        function settleTimeout(fn, value) {
            if (!settled) {
                settled = true;
                fn(value);
            }
        }

        settled = false;
        promise.then((resolution) => {
            settleTimeout(resolve, resolution);
        }, (rejection) => {
            settleTimeout(reject, rejection);
        });
        setTimeout(() => {
            settleTimeout(reject, timeoutRejection);
        }, ms);
    });
}


module.exports = exportedObject = {
    all,
    callbackify,
    delay,
    newPromise,
    promisify,
    promisifyAll,
    settle,
    race,
    reflect,
    timeout
};
