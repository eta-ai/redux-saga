# Recipes

## Throttling

You can throttle a sequence of dispatched actions by putting a delay inside a watcher Saga. For example, suppose the UI fires an `INPUT_CHANGED` action while the user is typing in a text field.

```javascript
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* handleInput(input) {
  // ...
}

function* watchInput() {
  while (true) {
    const { input } = yield take('INPUT_CHANGED')
    yield fork(handleInput, input)
    // throttle by 500ms
    yield call(delay, 500)
  }
}
```

By putting a delay after the `fork`, the `watchInput` will be blocked for 500ms so it'll miss all `INPUT_CHANGED` actions happening in-between. This ensures that the Saga will take at most one `INPUT_CHANGED` action during each period of 500ms.

But there is a subtle issue with the above code. After taking an action, `watchInput` will sleep for 500ms, which means it'll miss all actions that occurred in this period. That may be the purpose for throttling, but note the watcher will also miss the trailer action: i.e. the last action that may eventually occur in the 500ms interval. If you are throttling input actions on a text field, this may be undesirable, because you'll likely want to react to the last input after the 500ms throttling delay has passed.

Here is a more elaborate version which keeps track of the trailing action:

```javascript
function* watchInput(wait) {
  let lastAction
  let lastTime = Date.now()
  let countDown = 0 // handle leading action

  while (true) {
    const winner = yield race({
      action: take('INPUT_CHANGED'),
      timeout: countDown ? call(delay, countDown) : null
    })
    const now = Date.now()
    countDown -= (now - lastTime)
    lastTime = now

    if (winner.action) {
      lastAction = winner.action
    }
    if (lastAction && countDown <= 0) {
      yield fork(worker, lastAction)
      lastAction = null
      countDown = wait
    }
  }
}
```

In the new version, we maintain a `countDown` variable which tracks the remaining timeout. Initially the `countDown` is `0` because we want to handle the first action. After handling the first action, the `countDown` will be set to the throttling period `wait`. Which means we'll have to wait at least for `wait` ms before handling a next action.

Then at each iteration, we start a race between the next eventual action and the remaining timeout. Now we don't miss any action, instead we keep track of the last one in the `lastAction` variable, and we also update the countDown with remaining timeout.

The `if (lastAction && countDown <= 0) {...}` block ensures that we can handle an eventual trailing action (if `lastAction` is not null/undefined) after the throttling period expired (if `countDown` is less or equal than 0). Immediately after handling the action, we reset the `lastAction` and `countDown`. So we'll now have to wait for another `wait` ms period for another action to handle it.

## Debouncing

To debounce a sequence, put the `delay` in the forked task:

```javascript

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* handleInput(input) {
  // debounce by 500ms
  yield call(delay, 500)
  ...
}

function* watchInput() {
  let task
  while (true) {
    const { input } = yield take('INPUT_CHANGED')
    if (task) {
      yield cancel(task)
    }
    task = yield fork(handleInput, input)
  }
}
```

In the above example `handleInput` waits for 500ms before performing its logic. If the user types something during this period we'll get more `INPUT_CHANGED` actions. Since `handleInput` will still be blocked in the `delay` call, it'll be cancelled by `watchInput` before it can start performing its logic.

Example above could be rewritten with redux-saga `takeLatest` helper:

```javascript

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* handleInput({ input }) {
  // debounce by 500ms
  yield call(delay, 500)
  ...
}

function* watchInput() {
  // will cancel current running handleInput task
  yield* takeLatest('INPUT_CHANGED', handleInput);
}
```

## Retrying XHR calls

To retry a XHR call for a specific amount of times, use a for loop with a delay:

```javascript

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* updateApi(data) {
  for(let i = 0; i < 5; i++) {
    try {
      const apiResponse = yield call(apiRequest, { data });
      return apiResponse;
    } catch(err) {
      if(i < 5) {
        yield call(delay, 2000);
      }
    }
  }
  // attempts failed after 5x2secs
  throw new Error('API request failed');
}

export default function* updateResource() {
  while (true) {
    const { data } = yield take('UPDATE_START');
    try {
      const apiResponse = yield call(updateApi, data);
      yield put({
        type: 'UPDATE_SUCCESS',
        payload: apiResponse.body,
      });
    } catch (error) {
      yield put({
        type: 'UPDATE_ERROR',
        error
      });
    }
  }
}

```

In the above example the `apiRequest` will be retried for 5 times, with a delay of 2 seconds in between. After the 5th failure, the exception thrown will get caught by the parent saga, which will dispatch the `UPDATE_ERROR` action.

If you want unlimited retries, then the `for` loop can be replaced with a `while (true)`. Also instead of `take` you can use `takeLatest`, so only the last request will be retried. By adding an `UPDATE_RETRY` action in the error handling, we can inform the user that the update was not successfull but it will be retried.

```javascript
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* updateApi(data) {
  while (true) {
    try {
      const apiResponse = yield call(apiRequest, { data });
      return apiResponse;
    } catch(error) {
      yield put({
        type: 'UPDATE_RETRY',
        error
      })
      yield call(delay, 2000);
    }
  }
}

function* updateResource({ data }) {
  const apiResponse = yield call(updateApi, data);
  yield put({
    type: 'UPDATE_SUCCESS',
    payload: apiResponse.body,
  });
}

export function* watchUpdateResource() {
  yield* takeLatest('UPDATE_START', updateResource);
}

```

## Undo

The ability to undo respects the user by allowing the action to happen smoothly
first and foremost before assuming they don't know what they are doing. [GoodUI](https://goodui.org/#8)
The [redux documentation](http://redux.js.org/docs/recipes/ImplementingUndoHistory.html) describes a
robust way to implement an undo based on modifying the reducer to contain `past`, `present`,
and `future` state.  There is even a library [redux-undo](https://github.com/omnidan/redux-undo) that
creates a higher order reducer to do most of the heavy lifting for the developer.

However, this method comes with it overheard from storing references to the previous state(s) of the application.

Using redux-saga's `delay` and `cancel` we can implement a simple, one-time undo without enhancing
our reducer or storing the previous state.

```javascript
import {  take, put, call, fork, cancel, cancelled } from 'redux-saga/effects'
import { takeEvery, delay } from 'redux-saga'
import { updateThreadApi, actions } from 'somewhere'

function* onArchive() {
  try {
      const thread = { id: 1337, archived: true }
      // show undo UI element
      yield put(actions.showUndo())
      // optimistically mark the thread as `archived`
      yield put(actions.updateThread(thread))
      // allow user time to active the undo action
      yield call(delay, 5000)
      // hide undo UI element
      yield put(actions.hideUndo())
      // make the API call to apply the changes remotely
      yield call(updateThreadApi, thread)
  } finally {
    if (yield cancelled()) {
      // revert thread to previous state
      yield put(actions.updateThread({ id: 1337, archived: false }))
    }
  }
}

function* main() {
  while (true) {
    // listen for every `ARCHIVE_THREAD` action in a non-blocking manner.
    const onArchiveTask = yield fork(takeEvery, ARCHIVE_THREAD, onArchive)
    // wait for the user to activate the undo action;
    yield take(UNDO)
    // and then cancel the fetch task
    yield cancel(onArchiveTask)
  }
}
