import { is, check, remove, MATCH, internalErr } from './utils';
import { buffers } from './buffers';

var CHANNEL_END_TYPE = '@@redux-saga/CHANNEL_END';
export var END = { type: CHANNEL_END_TYPE };
export var isEnd = function isEnd(a) {
  return a && a.type === CHANNEL_END_TYPE;
};

export function emitter() {
  var subscribers = [];

  function subscribe(sub) {
    subscribers.push(sub);
    return function () {
      return remove(subscribers, sub);
    };
  }

  function emit(item) {
    var arr = subscribers.slice();
    for (var i = 0, len = arr.length; i < len; i++) {
      arr[i](item);
    }
  }

  return {
    subscribe: subscribe,
    emit: emit
  };
}

export var INVALID_BUFFER = 'invalid buffer passed to channel factory function';
export var UNDEFINED_INPUT_ERROR = 'Saga was provided with an undefined action';

if (process.env.NODE_ENV !== 'production') {
  UNDEFINED_INPUT_ERROR += '\nHints:\n    - check that your Action Creator returns a non-undefined value\n    - if the Saga was started using runSaga, check that your subscribe source provides the action to its listeners\n  ';
}

export function channel(buffer) {
  var closed = false;
  var takers = [];

  if (arguments.length > 0) {
    check(buffer, is.buffer, INVALID_BUFFER);
  } else {
    buffer = buffers.fixed();
  }

  function checkForbiddenStates() {
    if (closed && takers.length) {
      throw internalErr('Cannot have a closed channel with pending takers');
    }
    if (takers.length && !buffer.isEmpty()) {
      throw internalErr('Cannot have pending takers with non empty buffer');
    }
  }

  function put(input) {
    checkForbiddenStates();
    check(input, is.notUndef, UNDEFINED_INPUT_ERROR);
    if (!closed) {
      if (takers.length) {
        for (var i = 0; i < takers.length; i++) {
          var cb = takers[i];
          if (!cb[MATCH] || cb[MATCH](input)) {
            takers.splice(i, 1);
            return cb(input);
          }
        }
      } else {
        buffer.put(input);
      }
    }
  }

  function take(cb, matcher) {
    checkForbiddenStates();
    check(cb, is.func, 'channel.take\'s callback must be a function');
    if (arguments.length > 1) {
      check(matcher, is.func, 'channel.take\'s matcher argument must be a function');
      cb[MATCH] = matcher;
    }
    if (closed && buffer.isEmpty()) {
      cb(END);
    } else if (!buffer.isEmpty()) {
      cb(buffer.take());
    } else {
      takers.push(cb);
      cb.cancel = function () {
        return remove(takers, cb);
      };
    }
  }

  function close() {
    checkForbiddenStates();
    if (!closed) {
      closed = true;
      if (takers.length) {
        var arr = takers;
        takers = [];
        for (var i = 0, len = arr.length; i < len; i++) {
          arr[i](END);
        }
        takers = [];
      }
    }
  }

  return { take: take, put: put, close: close,
    get __takers__() {
      return takers;
    },
    get __closed__() {
      return closed;
    }
  };
}

export function eventChannel(subscribe) {
  var buffer = arguments.length <= 1 || arguments[1] === undefined ? buffers.none() : arguments[1];
  var matcher = arguments[2];

  /**
    should be if(typeof matcher !== undefined) instead?
    see PR #273 for a background discussion
  **/
  if (arguments.length > 2) {
    check(matcher, is.func, 'Invalid match function passed to eventChannel');
  }

  var chan = channel(buffer);
  var unsubscribe = subscribe(function (input) {
    if (isEnd(input)) {
      chan.close();
    } else if (!matcher || matcher(input)) {
      chan.put(input);
    }
  });

  if (!is.func(unsubscribe)) {
    throw new Error('in eventChannel: subscribe should return a function to unsubscribe');
  }

  return {
    take: chan.take,
    close: function close() {
      if (!chan.__closed__) {
        chan.close();
        unsubscribe();
      }
    }
  };
}