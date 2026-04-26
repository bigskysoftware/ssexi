<h1>&#x1F4E1; ssexi.js - <i>streaming HTML & events for fixi.js</i></h1>

ssexi is a companion library for [fixi.js](https://github.com/bigskysoftware/fixi) that adds automatic
[Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) (SSE) support.

Part of the [fixi project](https://fixiproject.org).

When a fixi `fetch()` returns a response with `Content-Type: text/event-stream`, ssexi takes over and
streams HTML into the target element as messages arrive.

Here is an example:

```html

<script src="fixi.js"></script>
<script src="ssexi.js"></script>

<button fx-action="/stream"
        fx-swap="beforeend"
        fx-target="#output">
    Start Stream
</button>
<div id="output"></div>
```

When the button is clicked, fixi issues a `GET` to `/stream`. If the server responds with
`Content-Type: text/event-stream`, ssexi parses the SSE stream and swaps each message's `data` into the
`#output` div, appending via `beforeend`.

No special attributes are needed; ssexi detects SSE responses automatically.

## Minimalism

ssexi shares [fixi's](https://github.com/bigskysoftware/fixi) philosophy of radical minimalism. It adds SSE streaming
support in a single file with no additional attributes, no configuration, and no dependencies beyond fixi itself.

Like fixi, ssexi takes advantage of modern JavaScript features:

* [`async` generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function*)
  for parsing SSE streams
* The [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) via `ReadableStream.getReader()`
* [`TextDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) for streaming byte-to-text decoding

A hard constraint is that the *unminified, uncompressed* size of ssexi.js stays below the
minified + gzipped size of [preact](https://bundlephobia.com/package/preact). Current sizes
are listed on the [fixi project site](https://fixiproject.org).

The ssexi project consists of four files:

* [`ssexi.js`](ssexi.js), the code for the library
* [`test.html`](test.html), the test suite for the library
* This [`README.md`](README.md), which is the documentation
* [`npm.sh`](npm.sh), which generates npm releases of the library

## Installing

ssexi is designed to be easily [vendored](https://htmx.org/essays/vendoring/), that is, copied, into your project
alongside your copy of fixi:

```bash
curl https://raw.githubusercontent.com/bigskysoftware/ssexi/refs/heads/main/ssexi.js >> ssexi.js
```

You can also use the JSDelivr CDN for local development or testing:

```html

<script src="https://cdn.jsdelivr.net/gh/bigskysoftware/ssexi@main/ssexi.js"></script>
```

Finally, ssexi is available on NPM as the [`ssexi`](https://www.npmjs.com/package/ssexi) package.

## Support

You can get support for ssexi via:

* [Github Issues](https://github.com/bigskysoftware/ssexi/issues)
* [The htmx Discord `#fixi` channel](https://htmx.org/discord)

## Modus Operandi

ssexi is implemented as a single `fx:config` event listener. I encourage you to look at
[the source](ssexi.js); it is short enough to read in a few minutes.

### Integration With fixi

When fixi fires the [`fx:config`](https://github.com/bigskysoftware/fixi#fxconfig) event, ssexi wraps the `cfg.fetch`
function. The wrapper calls the real `fetch()`, checks the `Content-Type` header of the response, and if it contains
`text/event-stream`, ssexi takes over:

1. An [`fx:sse:open`](#fxsseopen) event is fired on the target element
2. The response body is read as a stream and parsed according to the
   [SSE specification](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation)
3. For each message, an [`fx:sse:message`](#fxssemessage) event is fired
4. **Unnamed messages** (no `event:` field) have their `data` swapped into the target element
5. **Named messages** (with `event:` field) are dispatched as [`fx:sse:{eventName}`](#fxsseeventname) events and are
   **not** swapped
6. When the stream ends, an [`fx:sse:close`](#fxsseclose) event is fired

If the response is not `text/event-stream`, it passes through to fixi untouched.

### Accept Header

Loading ssexi sets a default `Accept: text/html, text/event-stream` header on every fixi
request, so that backends doing content negotiation can decide whether to return a one-shot
HTML fragment or an SSE stream from the same URL.  The header is added with `??=`, so any
`Accept` you've already set (in an `fx:config` listener, or via `window.fixiCfg.headers`)
wins:

```js
elt.addEventListener('fx:config', (e) => {
    // overrides ssexi's default for this element
    e.detail.cfg.headers.Accept = 'text/event-stream'
})
```

`text/html` is always listed so auth redirects, error pages, and HTML-only endpoints keep
working unchanged.  Servers that don't look at `Accept` are unaffected.

### SSE Parsing

ssexi implements a compliant SSE parser as an async generator. It handles:

* Line endings: `\r\n`, `\r`, or `\n`
* Comments (lines starting with `:`)
* Multi-line `data` fields (joined with `\n`)
* The `event`, `id`, and `retry` fields
* Chunked delivery (partial lines buffered across reads)

### The `cfg.sse` Object

When ssexi detects an SSE response, it creates a `cfg.sse` object on the fixi config with the following properties:

* `lastEventId` - the `id` of the most recently received message (updated as messages arrive)
* `retry` - the most recent `retry:` value from the server (in milliseconds), or `null`
* `reader` - the
  [`ReadableStreamDefaultReader`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamDefaultReader)
  for the response body

These properties are available in all ssexi events and provide the plugin points needed to implement
[reconnection](#reconnection), [background disconnecting](#background-tab-handling), and
[stream cancellation](#cancelling-via-the-reader):

```js
target.addEventListener("fx:sse:close", (evt) => {
    let {lastEventId, retry} = evt.detail.cfg.sse
    // use lastEventId and retry to implement reconnection logic
})
```

```js
target.addEventListener("fx:sse:open", (evt) => {
    let reader = evt.detail.cfg.sse.reader
    // store reader reference for later cancellation
})
```

### Swapping

For SSE responses, ssexi uses the `fx-swap` value from fixi's config.

Common swap styles for SSE:

| `fx-swap`    | behavior                                                                               |
|--------------|----------------------------------------------------------------------------------------|
| `innerHTML`  | Each message **replaces** the target's content (good for progressive rendering)        |
| `beforeend`  | Each message is **appended** to the target (good for chat, feeds, logs)                |
| `afterbegin` | Each message is **prepended** to the target                                            |
| `outerHTML`  | First message **replaces** the target element, subsequent messages **append after** it |

#### `outerHTML` Behavior

When `fx-swap` is `outerHTML` (fixi's default), ssexi handles it specially for streaming:

1. The **first** message replaces the target element via `outerHTML`, just as fixi normally would
2. **Subsequent** messages are appended after the replaced content via `afterend`
3. An internal anchor element is used to track the insertion point and is removed when the stream ends

This means the original target element is replaced by the first message's HTML, and subsequent messages accumulate
after it. Because the original target is replaced, ssexi events after the first message will bubble through the
anchor's parent rather than the original target; listen on a parent element or `document` when using `outerHTML`:

```js
document.addEventListener("fx:sse:message", (evt) => {
    console.log("message:", evt.detail.message.data)
})
```

You can also set `cfg.sseSwap` in the `fx:config` event to use a different swap style for SSE than for normal
responses:

```js
document.addEventListener("fx:config", (evt) => {
    evt.detail.cfg.sseSwap = "beforeend"
})
```

#### Routing One Stream To Multiple Targets

An SSE message's `event:` field is normally a name (and dispatches `fx:sse:{name}` without
swapping; see [`fx:sse:{eventName}`](#fxsseeventname)). As a special case, if the `event:`
value parses as JSON, ssexi treats it as a per-message override of the swap parameters.
All fields are optional:

| field        | default                          | effect                                                    |
|--------------|----------------------------------|-----------------------------------------------------------|
| `target`     | `cfg.target`                     | CSS selector for where this message's data is swapped     |
| `swap`       | `cfg.sseSwap` / `cfg.swap`       | Swap style for this message (`innerHTML`, `beforeend`, ...) |
| `transition` | none                             | If truthy, wrap this swap in `document.startViewTransition` |

```
event: {"target":"#clock"}
data: 12:34:56

event: {"target":"#log","swap":"beforeend"}
data: <div class="line">user signed in</div>

event: {"transition":true}
data: <p>same target, but morphed via a view transition</p>

```

This lets one SSE connection fan out to several panels at once, each with its own swap
mode. `target` is resolved with `document.querySelector`; if it doesn't match anything
the message is dropped silently.

The JSON must start with `{` to be recognised; anything else is treated as a regular
named event and dispatched without swapping.

### Transitions

ssexi does **not** wrap every swap in a [View
Transition](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API). View
transitions don't queue (a new one cancels the previous one's `.finished` promise), so
wrapping each frame of a streamed response would either serialise the stream into
multi-second sequences or strand a transition mid-flight. The default is plain swaps;
reach for ordinary CSS transitions on the swapped content for continuous animations.

For occasional, deliberate moments where a view transition *is* what you want, set
`{"transition": true}` in a JSON event (see the routing table above). ssexi will
`await cfg.transition(swap).finished` for that single message before reading the next
one, so the rest of the stream stays paused while the transition plays. Use it sparingly
on slow-moving streams; firing transition messages back-to-back will still cause earlier
ones to abort.

## Events

ssexi fires the following events on the **target element**. All events bubble, are composed, and are cancelable.

| event | detail | description |
| --- | --- | --- |
| [`fx:sse:open`](#fxsseopen) | `cfg`, `response` | Fired when an SSE stream is detected. Cancel to prevent processing. |
| [`fx:sse:message`](#fxssemessage) | `cfg`, `message` | Fired for every SSE message _before_ swapping. Cancel to stop the stream. |
| [`fx:sse:swapped`](#fxsseswapped) | `cfg`, `message` | Fired _after_ a message's content has been swapped into the target. Use this for post-swap reactions like auto-scroll. |
| [`fx:sse:{eventName}`](#fxsseeventname) | `cfg`, `message` | Fired for messages with an `event:` field. These are **not** swapped. |
| [`fx:sse:close`](#fxsseclose) | `cfg` | Fired when the stream ends normally. |
| [`fx:sse:error`](#fxsseerror) | `cfg`, `error` | Fired if an error occurs during streaming. |

### `fx:sse:open`

Fired on the target element when a response with `Content-Type: text/event-stream` is detected. The `evt.detail`
contains `cfg` (the fixi config object) and `response` (the fetch Response).

If you call `preventDefault()` on this event, the stream will not be processed and the target will not be modified.

### `fx:sse:message`

Fired for **every** SSE message (both named and unnamed). The `evt.detail.message` object has the following
properties:

* `data` - the message data (multi-line `data:` fields joined with `\n`)
* `event` - the event name (empty string if unnamed)
* `id` - the message id (empty string if not set)
* `retry` - the reconnection delay in milliseconds (if a `retry:` field was present), or `null`

If you call `preventDefault()` on this event, the stream will stop processing (the current message will not be
swapped or dispatched, and no further messages will be read).

You can also use this event to modify the message data before it is swapped:

```js
target.addEventListener("fx:sse:message", (evt) => {
    evt.detail.message.data = markdown(evt.detail.message.data)
})
```

### `fx:sse:swapped`

Fired on the target element **after** an unnamed message's `data` has been swapped in.
The `evt.detail` is the same shape as `fx:sse:message` (`cfg`, `message`), but at this
point the new content is already in the DOM, so reading layout properties returns post-swap
values. Useful for auto-scroll, syntax-highlighting newly streamed code, etc.:

```html
<div id="log" on-fx:sse:swapped="this.scrollTop = this.scrollHeight"></div>
```

Not fired for named events (which aren't swapped) or for cancelled `fx:sse:message` events.

### `fx:sse:{eventName}`

When an SSE message has an `event:` field, ssexi dispatches a custom event with that name prefixed by `fx:sse:`.
For example, a message with `event: status` will fire `fx:sse:status` on the target element.

Named events are **not** swapped into the DOM; they are for JavaScript handling:

```js
target.addEventListener("fx:sse:status", (evt) => {
    console.log("status update:", evt.detail.message.data)
})
```

### `fx:sse:close`

Fired when the SSE stream ends normally (the server closes the connection).

### `fx:sse:error`

Fired if an error occurs during stream processing. The `evt.detail.error` property contains the thrown value.

## Server Side

Your server endpoint should respond with `Content-Type: text/event-stream` and send
[SSE-formatted](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format)
messages:

```
data: <p>First update</p>

data: <p>Second update</p>

event: done
data: finished

```

Each message is one or more `data:` lines followed by a blank line. Messages without an `event:` field will have their
`data` swapped into the target. Messages with an `event:` field will be dispatched as DOM events.

### Example: Python/Flask

```python
from flask import Flask, Response
import time

app = Flask(__name__)


@app.route('/stream')
def stream():
    def generate():
        for i in range(5):
            yield f"data: <p>Message {i + 1}</p>\n\n"
            time.sleep(1)
        yield "event: done\ndata: finished\n\n"

    return Response(generate(), content_type='text/event-stream')
```

### Example: Node/Express

```javascript
app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    let i = 0
    let interval = setInterval(() => {
        if (++i > 5) {
            res.write('event: done\ndata: finished\n\n')
            res.end()
            clearInterval(interval)
        } else {
            res.write(`data: <p>Message ${i}</p>\n\n`)
        }
    }, 1000)
})
```

## Examples

### Streaming Chat

```html

<form fx-action="/chat" fx-method="POST"
      fx-swap="beforeend" fx-target="#messages">
    <input name="message" placeholder="Type a message...">
    <button>Send</button>
</form>
<div id="messages"></div>
```

Each SSE message from the server appends a new HTML fragment to the `#messages` div.

### Progressive Rendering

```html

<button fx-action="/render" fx-swap="innerHTML" fx-target="#content">
    Load Content
</button>
<div id="content">Click to load...</div>
```

Each SSE message replaces the content of `#content`, allowing the server to progressively refine the output.

### Closing a Stream on a Named Event

```html

<div id="feed"></div>
<script>
    document.getElementById("feed").addEventListener("fx:sse:done", (evt) => {
        console.log("stream complete")
    })
</script>
<button fx-action="/feed" fx-swap="beforeend" fx-target="#feed">
    Start Feed
</button>
```

When the server sends `event: done`, the `fx:sse:done` event fires on the target. The stream continues to
completion naturally; the named event is simply dispatched for your code to react to.

### Stopping a Stream Early

You can stop processing a stream by canceling the `fx:sse:message` event:

```html

<button fx-action="/long-stream" fx-swap="beforeend" fx-target="#out">
    Start
</button>
<button onclick="document.getElementById('out').dataset.stop = 'true'">
    Stop
</button>
<div id="out"></div>
<script>
    document.getElementById("out").addEventListener("fx:sse:message", (evt) => {
        if (evt.target.dataset.stop) evt.preventDefault()
    })
</script>
```

## Reconnection and Lifecycle

ssexi supports three opt-in config flags for managing stream lifecycle. Set them in an
`fx:config` listener (or on the returned cfg before the stream starts):

| flag                          | behavior                                                                 |
|-------------------------------|--------------------------------------------------------------------------|
| `cfg.sseReconnect`            | On close or error, wait `sse.retry` ms (or 3000) and re-fetch with a `Last-Event-ID` header. |
| `cfg.ssePauseOnHidden`        | Cancel the reader when `document.hidden`; resume (with `Last-Event-ID`) when visible. |
| `cfg.sseDisconnectOnHidden`   | Close the stream when `document.hidden`. No resume; the caller must re-trigger. |

Example:

```js
btn.addEventListener("fx:config", (e) => {
    e.detail.cfg.sseReconnect = true
    e.detail.cfg.ssePauseOnHidden = true
})
```

### `cfg.sse.close()`

At any time you can stop the stream (and the reconnect loop) by calling `cfg.sse.close()`.
It sets `cfg.sse.closed = true` and cancels the underlying reader:

```js
target.addEventListener("fx:sse:message", (e) => {
    if (shouldStop(e.detail.message)) e.detail.cfg.sse.close()
})
```

### Custom Reconnect Policy

If the built-in reconnect doesn't match your needs (e.g. you want exponential backoff),
leave `cfg.sseReconnect` off and implement your own in an `fx:sse:close` / `fx:sse:error`
listener using `cfg.trigger` to re-fire the triggering event:

```js
document.addEventListener("fx:sse:close", (evt) => {
    let cfg = evt.detail.cfg, elt = cfg.trigger.target
    if (!elt.isConnected) return
    let attempt = elt.__ssexiAttempt = (elt.__ssexiAttempt || 0) + 1
    let delay = Math.min((cfg.sse?.retry || 500) * 2 ** (attempt - 1), 60000)
    delay += delay * 0.3 * (Math.random() * 2 - 1) // jitter
    setTimeout(() => elt.dispatchEvent(new Event(cfg.trigger.type)), delay)
})
```

Note that cancelling the reader will cause an `fx:sse:error` event to fire (not `fx:sse:close`), since the stream
did not end naturally. You can alternatively use `cfg.abort()` to abort the underlying fetch, which has the same
effect.

## Mocking

You can mock SSE responses the same way you mock regular fixi responses, by replacing `cfg.fetch` in the
`fx:config` event. The mock should return a `Response` with a `ReadableStream` body and
`Content-Type: text/event-stream`:

```js
document.addEventListener("fx:config", (evt) => {
    evt.detail.cfg.fetch = () => {
        let encoder = new TextEncoder()
        let messages = ["data: hello\n\n", "data: world\n\n"]
        let i = 0
        let stream = new ReadableStream({
            pull(controller) {
                if (i < messages.length)
                    controller.enqueue(encoder.encode(messages[i++]))
                else
                    controller.close()
            }
        })
        return Promise.resolve(
            new Response(stream, {headers: {'Content-Type': 'text/event-stream'}})
        )
    }
})
```

## LICENCE

```
Zero-Clause BSD
=============

Permission to use, copy, modify, and/or distribute this software for
any purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY
DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT
OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```