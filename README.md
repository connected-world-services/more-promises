More Promises
=============

`Promise` objects are a wonderful escape from "callback hell", though the standard set of functions to manipulate groups of them is a bit lacking. This module lets a developer track an array or an object consisting of `Promise` values and actual values, then has prescribed rejection and resolution behavior that can be beneficial depending on the type of software being written.

[![npm version][npm-badge]][npm-link]
[![Build Status][travis-badge]][travis-link]
[![Dependencies][dependencies-badge]][dependencies-link]
[![Dev Dependencies][devdependencies-badge]][devdependencies-link]
[![codecov.io][codecov-badge]][codecov-link]


Overview
--------

`Promises.all()` and `Promise.race()` are provided by the ES6 / ES2015 specification and deal wonderfully with arrays. They also can provide only one rejection and `Promise.all()` is specifically designed to fail fast. This may not be what you'd like to have happened.

    // Using an Array here
    var morePromises = require("more-promises");
    var list = [
        12345,
        Promise.resolve("successful 1"),
        Promise.resolve("successful 2"),
        Promise.reject("failure 1"),
        Promise.reject("failure 2")
    ];

    // This is the built-in operation
    Promise.all(list).then((resolvedList) => {
        console.log("this never happens because one was rejected");
    }, (rejection) => {
        // This is usually "failure 1" but could be any failure, depending on implementation
        console.log(rejection);
    });

    // Here is an alternate implementation that waits for all of
    // the promises to be resolved or rejected.
    morePromises.settle(list).then((resolvedList) => {
        console.log("this never happens because one was rejected");
    }, (rejectionList) => {
        // "[ , , , 'failure 1', 'failure 2' ]"
        // Note that the array indices are preserved.
        console.log(rejectionList);
    });

This library was created because there weren't other implementations that settled all promises and then rejected the consolidated promise with the failures (as in the `.settle()` function). Also, some implementations decided to change all rejections into `Error` objects, which means they modified the value and potentially corrupted vital information. Lastly, it is nice to track promises in an object and promisification shouldn't be limited to the great Bluebird library.

    var fs = require("fs");

    morePromises.promisifyAll(fs);
    var list = {
        configFile: fs.readFileAsync("config.txt"),
        sslCert: fs.readFileAsync("ssl.crt")
    };
    morePromises.settle(list).then((resolvedList) => {
        startServer(resolvedList.configFile, resolvedList.sslCert);
    }, (rejectionList) => {
        Object.keys(rejectionList).forEach((key) => {
            console.error(`Error reading file: ${key}`);
        });
        console.error("Aborting.");
    });


Installation
------------

Use `npm` to install this package easily.

    $ npm install --save more-promises

Alternately you may edit your `package.json` and add this to your `dependencies` object:

    {
        ...
        "dependencies": {
            ...
            "more-promises": "*"
            ...
        }
        ...
    }


API
---

When you use `morePromises = require("more-promises")`, the resulting object exposes several functions. Several of them take a `list`, which can be either an array or an object.


### `returnedPromise = morePromises.all(list)`

Returns a promise that is fulfilled when every promise in `list` is fulfilled. If any promise in `list` is rejected, the returned promise is rejected with the first rejection. This is the same as `Promise.all()` except it also works with objects.

When resolved, the array indexes or object property names are preserved.

    // The list can be an array or an object.
    var list = {
        regularValue: 12345,
        aPromise: Promise.resolve() // Resolves with undefined
    };

    morePromises.all(list).then((resolvedList) => {
        // { regularValue: 12345, aPromise: undefined }
        console.log(resolvedList);
    });

    list.rejected = Promise.reject("testing");

    morePromises.all(list).then(() => {
        console.log("This will not happen because one of the promises is rejected");
    }, (rejected) => {
        // "testing"
        console.log(rejected);
    });


### `returnedPromise = morePromises.callbackify(promise, callback)`

Calls the `callback` when the `promise` is rejected or resolved. When rejected, the rejection value is supplied as the first argument. When resolved, the resolution value is supplied as the second argument. In this way you can call a standard Node-style callback from a promise.

    function whenDone(err, result) {
        if (err) {
            console.log(err);
        } else {
            continueToDoWork(result);
        }
    }

    var fs = require("fs");
    var readFileAsync = morePromises.promisify(fs.readFile, fs);

    var promise = readFileAsync("config.txt").then((buffer) => {
        // Convert to a string
        return buffer.toString("utf8");
    });

    // This chains the whenDone() callback to the promise
    morePromises.callbackify(promise, whenDone);


### `returnedPromise = morePromises.delay(ms)`
### `returnedPromise = morePromises.delay(promise, ms)`

When called without `promise`, this creates a promise that will be resolved after at least `ms` milliseconds.

When called with `promise`, the returned promise will be rejected immediately if `promise` is rejected. If `promise` is resolved, a delay of at least `ms` milliseconds will elapse before the returned promise is resolved.

    // Simulate key presses
    var promise = Promise.resolve();

    [ "h", "e", "l", "l", "o" ].forEach((letter) => {
        promise = promise.then(() => {
            sendLetter(letter);
        });
        promise = morePromises.delay(Math.random() * 3);
    });


### `morePromises.newPromise = function ....`

This property is exposed on `morePromises` to allow a programmer to replace the use of the built-in `Promise` object with another type of promise. The new type of promise must follow the A+ Promises Specification.

The `newPromise()` function can be replaced as shown in the following example. When called, `newPromise()` is passed a function that expects a resolver function and a rejection function, just like how `new Promise()` works.  In this example we use `fid-promise`, which is an A+ Promise that has a different method for resolving and rejecting.

    var FidPromise = require("fid-promise");

    morePromises.newPromise = (fn) => {
        var promise;

        function resolver(value) {
            promise.resolve(value);
        }

        function rejector(value) {
            promise.reject(value);
        }

        promise = new FidPromise();

        fn(resolver, rejector);

        return promise;
    };


### `wrappedFunction = morePromises.promisify(nodeCallbackStyleFunction)`

This takes a normal Node-style callback-enabled function and changes it to return a `Promise` instead.

    function nodeStyle(stringToLog, callback) {
        // Normally a function like this is asynchronous
        if (!logger.write(stringToLog)) {
            callback(logger.lastError);
        } else {
            callback("ok");
        }
    }

    var wrapped = morePromises.promisify(nodeStyle);

    wrapped("log this string").then((value) => {
        console.log("successful logging");

        // "ok"
        console.log(value)
    }, (err) => {
        console.log("failed to log");

        // Whatever logger.lastError is
        console.log(err);
    });


### `objectOrFunction = morePromises.promisifyAll(objectOrFunction)`

Scans through all properties on `objectOrFunction` and checks if they are functions. When they are, and there's no conflict, a wrapped version of the function is added to the object with "Async" appended to its name.

    var fs = require("fs");

    // "undefined"
    console.log(typeof fs.readFileAsync);

    var result = morePromises.promisifyAll(fs);

    // "function"
    console.log(typeof fs.readFileAsync);

    // The returned object is the same as the one passed in.
    // true
    console.log(result === fs);

When all methods are changed, you're able to change you calls to node-style methods (eg. `fs.readFile()`) into ones that rely on returning `Promise` objects instead (eg. `fs.readFileAsync()`).


### `returnedPromise = morePromises.settle(list, [options])`

Returns a promise that is fulfilled when every promise in `list` is fulfilled. If any promise in `list` is rejected, the returned promise is rejected with a list of all rejections.

When resolved, the array indexes or object property names are preserved. When rejected, the array indexes will not be preserved, unless the `sparse` property on the `options` object is set to `true`.

    // The list can be an array or an object.
    var list = {
        regularValue: 12345,
        fail1: Promise.reject("fail 1"),
        fail2: Promise.reject() // Rejects with undefined
    };

    // When every promise is resolved, this is the same as morePromises.all()
    // so only showing failure.
    morePromises.settle(list).then(() => {
        console.log("This will not happen because at least one promise is rejected");
    }, (rejectedList) => {
        // { fail1: "fail 1", fail2: undefined }
        console.log(rejectedList);
    });


    // Create an array of promises.
    var promiseList = [
        Promise.resolve("anything"),
        Promise.reject(new Error("bad things")),
        Promise.reject() // Rejecting with undefined
    ];

    // The rejected promise list will have the indexes of resolved promises removed.
    morePromises.settle(promiseList).then(() => {}, (rejectedList) => {
        // Notice that the rejection with an undefined value is preserved
        // in rejectedList.
        // [ Error("bad things"), undefined ]
        console.log(rejectedList);
    });

    // Same thing, but the rejectionList will preserve the indexes of the original array.
    morePromises.settle(promiseList, {
        sparse: true
    }).then(() => {}, (rejectedList) => {
        // Careful - the first element is not defined, but the rejectedList does
        // not even have the key 0 defined.
        // [ , Error("bad things"), undefined ]
        console.log(rejectedList);
        // [ 1, 2 ]
        console.log(Object.keys(rejectedList));
    })


### `returnedPromise = morePromises.race(list)`

Returns a promise that is settle when the first promise in the `list` is settled. If the first promise is resolved, the returned promise is resolved with the same value. Likewise, if the first promise is rejected, the returned promise is rejected with the same value. This is the same as `Promise.race()` except it also works with objects. If something in the list is not a promise, the returned promise will be immediately resolved with the first non-promise value encountered. Depending on promise implementation, iteration order and promise states, this could pick one of a number of promises or non-promise values when they are all resolved during the function call.

    // The list can be an array or an object
    var list = {
        regularValue: 12345,
        aPromise: Promise.resolve() // Resolves with undefined
    };

    morePromises.race(list).then((resolved) => {
        // Normally this writes 12345 but it could write undefined
        // if the "aPromise" promise is selected.
        console.log(resolvedList);
    });

    list = {
        first: morePromises.delay(100).then(() => {
            return "first promise";
        }),
        second: morePromises.delay(1000).then(() => {
            return "second promise";
        })
    }

    morePromises.all(list).then((value) => {
        // Unless you have a heavily loaded system, this will write out
        // first promise
        console.log(value);
    });


### `returnedPromise = morePromises.reflect(list)`

Waits for all promises in `list` to be resolved or rejected, then supplies a new list through the returned promise. The returned promise is *always resolved*. Its contents is changed to contain special objects, similar to what was proposed for `Promise.allSettled()`. This preserves the promise resolution/rejection value.

When resolved, the array indexes or object property names are preserved.

    // The list can be an array or an object
    var list = {
        regularValue: 12345,
        resolvedPromise: Promise.resolve(), // Resolves with undefined
        rejectedPromise: Promise.reject("some string")
    };

    morePromises.reflect(list).then((resultList) => {
        // {
        //     regularValue: {
        //         state: "not-promise",
        //         value: 12345
        //     },
        //     resolvedPromise: {
        //         state: "fulfilled",
        //         value: undefined
        //     },
        //     rejectedPromise: {
        //         state: "rejected",
        //         value: "some string"
        //     }
        // }
        console.log(resultList);
    });


### `returnedPromise = morePromises.timeout(promise, ms)`
### `returnedPromise = morePromises.timeout(promise, ms, rejectionValue)`

Returns a promise that is fulfilled when `promise` is resolved and rejected when `promise` is rejected. However, if `promise` takes more than at least `ms` milliseconds to resolve, then the `promise` is rejected with `rejectionValue`.

If `rejectionValue` is not supplied, the default rejection is an `Error` saying "Timeout after {ms} milliseconds".

    // Don't ever resolve nor reject this promise
    var promise = new Promise(() => {});

    var newPromise = morePromises.timeout(promise, 100);

    newPromise.then(() => {
        console.log("This won't ever get resolved");
    }, (err) => {
        // "Error: Timeout after 100 milliseconds"
        console.log(err.toString());
    });


License
-------

This software is licensed under a [MIT license][LICENSE] that contains additional non-advertising and patent-related clauses.  [Read full license terms][LICENSE]


[codecov-badge]: https://img.shields.io/codecov/c/github/connected-world-services/more-promises/master.svg
[codecov-link]: https://codecov.io/github/connected-world-services/more-promises?branch=master
[dependencies-badge]: https://img.shields.io/david/connected-world-services/more-promises.svg
[dependencies-link]: https://david-dm.org/connected-world-services/more-promises
[devdependencies-badge]: https://img.shields.io/david/dev/connected-world-services/more-promises.svg
[devdependencies-link]: https://david-dm.org/connected-world-services/more-promises#info=devDependencies
[LICENSE]: LICENSE.md
[npm-badge]: https://img.shields.io/npm/v/more-promises.svg
[npm-link]: https://npmjs.org/package/more-promises
[travis-badge]: https://img.shields.io/travis/connected-world-services/more-promises/master.svg
[travis-link]: http://travis-ci.org/connected-world-services/more-promises
