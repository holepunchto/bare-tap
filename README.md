# bare-tap

Minimal TAP library for Bare.

```
npm i bare-tap
```

## Usage

```js
const t = require('bare-tap')

t.plan(2)
t.equal('Hello world'.length, 11)
t.ok(Bare)
```

To declare several test cases in one module, use `test()`. Cases run one at a time in the order they were declared, and the process exits once the last one has finished.

```js
const { test } = require('bare-tap')

test('length', (t) => {
  t.equal('Hello world'.length, 11)
})

test('timers', async (t) => {
  const timer = setInterval(() => {}, 1000)
  t.teardown(() => clearInterval(timer))

  await t.sleep(10)
  t.pass()
})
```

## License

Apache-2.0
