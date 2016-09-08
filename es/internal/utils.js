var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

export var sym = function sym(id) {
  return '@@redux-saga/' + id;
};
export var TASK = sym('TASK');
export var MATCH = sym('MATCH');
export var CANCEL = sym('cancelPromise');
export var konst = function konst(v) {
  return function () {
    return v;
  };
};
export var kTrue = konst(true);
export var kFalse = konst(false);
export var noop = function noop() {};
export var ident = function ident(v) {
  return v;
};

export function check(value, predicate, error) {
  if (!predicate(value)) {
    log('error', 'uncaught at check', error);
    throw new Error(error);
  }
}

export var is = {
  undef: function undef(v) {
    return v === null || v === undefined;
  },
  notUndef: function notUndef(v) {
    return v !== null && v !== undefined;
  },
  func: function func(f) {
    return typeof f === 'function';
  },
  number: function number(n) {
    return typeof n === 'number';
  },
  array: Array.isArray,
  promise: function promise(p) {
    return p && is.func(p.then);
  },
  iterator: function iterator(it) {
    return it && is.func(it.next) && is.func(it.throw);
  },
  task: function task(t) {
    return t && t[TASK];
  },
  take: function take(ch) {
    return ch && is.func(ch.take);
  },
  put: function put(ch) {
    return ch && is.func(ch.put);
  },
  observable: function observable(ob) {
    return ob && is.func(ob.subscribe);
  },
  buffer: function buffer(buf) {
    return buf && is.func(buf.isEmpty) && is.func(buf.take) && is.func(buf.put);
  },
  pattern: function pattern(pat) {
    return pat && (typeof pat === 'string' || (typeof pat === 'undefined' ? 'undefined' : _typeof(pat)) === 'symbol' || is.func(pat) || is.array(pat));
  }
};

export function remove(array, item) {
  var index = array.indexOf(item);
  if (index >= 0) {
    array.splice(index, 1);
  }
}

export function deferred() {
  var props = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

  var def = _extends({}, props);
  var promise = new Promise(function (resolve, reject) {
    def.resolve = resolve;
    def.reject = reject;
  });
  def.promise = promise;
  return def;
}

export function arrayOfDeffered(length) {
  var arr = [];
  for (var i = 0; i < length; i++) {
    arr.push(deferred());
  }
  return arr;
}

export function delay(ms) {
  var val = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

  var timeoutId = void 0;
  var promise = new Promise(function (resolve) {
    timeoutId = setTimeout(function () {
      return resolve(val);
    }, ms);
  });

  promise[CANCEL] = function () {
    return clearTimeout(timeoutId);
  };

  return promise;
}

export function createMockTask() {
  var _ref;

  var running = true;
  var _result = void 0,
      _error = void 0;

  return _ref = {}, _defineProperty(_ref, TASK, true), _defineProperty(_ref, 'isRunning', function isRunning() {
    return running;
  }), _defineProperty(_ref, 'result', function result() {
    return _result;
  }), _defineProperty(_ref, 'error', function error() {
    return _error;
  }), _defineProperty(_ref, 'setRunning', function setRunning(b) {
    return running = b;
  }), _defineProperty(_ref, 'setResult', function setResult(r) {
    return _result = r;
  }), _defineProperty(_ref, 'setError', function setError(e) {
    return _error = e;
  }), _ref;
}

export function autoInc() {
  var seed = arguments.length <= 0 || arguments[0] === undefined ? 0 : arguments[0];

  return function () {
    return ++seed;
  };
}

var kThrow = function kThrow(err) {
  throw err;
};
var kReturn = function kReturn(value) {
  return { value: value, done: true };
};
export function makeIterator(next) {
  var thro = arguments.length <= 1 || arguments[1] === undefined ? kThrow : arguments[1];
  var name = arguments.length <= 2 || arguments[2] === undefined ? '' : arguments[2];

  var iterator = { name: name, next: next, throw: thro, return: kReturn };
  if (typeof Symbol !== 'undefined') {
    iterator[Symbol.iterator] = function () {
      return iterator;
    };
  }
  return iterator;
}

/**
  Print error in a useful way whether in a browser environment
  (with expandable error stack traces), or in a node.js environment
  (text-only log output)
 **/
export function log(level, message, error) {
  /*eslint-disable no-console*/
  if (typeof window === 'undefined') {
    console.log('redux-saga ' + level + ': ' + message + '\n' + (error && error.stack || error));
  } else {
    console[level].call(console, message, error);
  }
}

export var internalErr = function internalErr(err) {
  return new Error('\n  redux-saga: Error checking hooks detected an inconsisten state. This is likely a bug\n  in redux-saga code and not yours. Thanks for reporting this in the project\'s github repo.\n  Error: ' + err + '\n');
};