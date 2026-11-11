'use strict'
// ============================================================================
// undici@7.30.2 HTTP/1 parser pure-JS replacement (JsParser) -- production apply script.
//
// Background: HarmonyOS PC app domain forbids WebAssembly (node-oh must run
// --jitless, Electron-OH template presets --js-flags=--jitless). undici@7.30.2's
// HTTP/1 response parsing depends on llhttp-wasm; with WebAssembly unavailable
// the real network path throws (WebAssembly is not defined / Module fails).
// This script injects a JsParser extends Parser pure-JS HTTP/1 response state
// machine into undici's client-h1.js and adds an automatic selection switch:
//   - typeof WebAssembly === 'undefined' (--jitless scenario) -> JsParser
//   - UNDICI_JS_PARSER=1                                 -> force JsParser (host comparison)
//   - otherwise                                          -> keep upstream llhttp path (zero change)
//
// Target undici 7.30.2 resolved by published urllib@4.9.0 (dependencies
// undici ^7.1.1). Adapted from the undici 8.12.2 reference injection
// (repos-pc/urllib-4.9.0/build/undici-js-parser/apply-undici-js-parser.cjs):
//   - 7.30.2 Parser stores contentLength as a string ('' default), no
//     hasTransferEncoding field -> JsParser detects chunked itself and keeps
//     a private _hasTE flag; body phase uses parseInt(this.contentLength).
//   - 7.30.2 has no H1Parser/Milo branch; connectH1 selects Parser directly.
//
// Apply timing: after `npm install` in the closure, before demo HAP assembly.
// Idempotent: skips when `class JsParser extends Parser` is already present.
//
// Usage:
//   node apply-undici-js-parser-v7.cjs [--target <undici/client-h1.js path>]
// ============================================================================

const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
function argVal (name, def) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const explicitTarget = argVal('--target', null)

const wsDefault = path.resolve(__dirname, '..', '..') // .local/tools -> project root
const defaultTarget = path.join(
  wsDefault, '.local', 'closure-stage', 'node_modules', 'undici', 'lib', 'dispatcher', 'client-h1.js'
)
const target = explicitTarget || defaultTarget

if (!fs.existsSync(target)) {
  console.error('[apply-undici-js-parser-v7] target not found: ' + target)
  process.exit(2)
}

const src = fs.readFileSync(target, 'utf8')

if (src.includes('class JsParser extends Parser')) {
  console.log('[apply-undici-js-parser-v7] already applied (class JsParser present), skip: ' + target)
  process.exit(0)
}

// ============================================================================
// JsParser class body -- pure JS HTTP/1 response state machine.
// Covers llhttp semantics exercised by the urllib roster:
//   - Content-Length bodies (multi onBody chunks, Content-Length:0 immediate
//     completion, onMessageComplete CL byte-count check via base class)
//   - chunked bodies (hex length, ';' extension truncation, trailers, empty
//     trailer, invalid chunk-size chars -> HTTPParserError(INVALID_CHUNK_SIZE))
//   - keep-alive reuse (sequential responses on the same socket; undici h1
//     default pipelining=1)
//   - HEAD responses (onHeadersComplete returns 1 -> no body, complete)
//   - 1xx informational (statusCode < 200 -> parse next response head)
//   - 204/205/304 (no body, complete immediately)
//   - EOF-delimited bodies (no CL / no TE and 2xx: read until socket close,
//     finish() completes)
//   - backpressure pause/resume (onBody PAUSED -> paused; resume() re-feeds)
//   - header parsing (obs-fold continuation, overflow guard headersMaxSize)
//   - malformed responses (bad status line / bad chunk size -> SocketError;
//     CL mismatch -> ResponseContentLengthMismatchError; header overflow)
//   - upgrade/CONNECT (onHeadersComplete returns 2 -> base onUpgrade handoff)
// Not covered (not exercised by roster): pipelining>1, strict HPE_* enum,
// HTTP/1.0 explicit keep-alive, huge-header incremental boundaries.
// ============================================================================
const jsParserClass = `
class JsParser extends Parser {
  constructor (client, socket) {
    // Reuse base field init (timeout/headers/statusCode/...), avoid touching
    // WebAssembly; ptr is null and every parsing path is pure JS.
    super(client, socket, { exports: { llhttp_alloc: () => 0 } })
    this.ptr = null
    this._buf = Buffer.alloc(0)
    this._phase = 'head'
    this._clRemain = 0
    this._inChunk = true
    this._chunkRemain = 0
    this._eofBody = false
    this._hasTE = false
  }

  execute (chunk) {
    assert(currentParser === null)
    assert(!this.paused)
    this._buf = this._buf.length === 0 ? chunk : Buffer.concat([this._buf, chunk])
    this._feed()
  }

  readMore () {
    // Base readMore uses this.ptr as liveness; JS parser keeps ptr null, override.
    while (!this.paused && !this.socket.destroyed) {
      const chunk = this.socket.read()
      if (chunk === null) {
        break
      }
      this.execute(chunk)
    }
  }

  resume () {
    if (this.socket.destroyed || !this.paused) {
      return
    }
    this.paused = false
    assert(this.timeoutType === TIMEOUT_BODY)
    if (this.timeout && this.timeout.refresh) {
      this.timeout.refresh()
    }
    this._feed()
    this.readMore()
  }

  _completeMessage () {
    const ret = this.onMessageComplete()
    if (ret === constants.ERROR.PAUSED) { this.paused = true; return }
    if (ret === -1) { return }
    if (this.socket.destroyed) { this._phase = 'done'; return }
    this._phase = 'head'
    this._clRemain = 0
    this._inChunk = true
    this._chunkRemain = 0
    this._eofBody = false
    this._hasTE = false
  }

  _chunkSizeLineInvalid (line) {
    let seenSemi = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (seenSemi) continue
      if (c === ';') { seenSemi = true; continue }
      if (c === '\\r' || c === '\\n') continue
      if (c >= '0' && c <= '9') continue
      if (c >= 'a' && c <= 'f') continue
      if (c >= 'A' && c <= 'F') continue
      if (c === ' ' || c === '\\t') continue
      return true
    }
    return false
  }

  _feed () {
    while (!this.paused && this._phase !== 'done') {
      if (this._phase === 'head') {
        if (this._buf.length === 0) break
        const idx = this._buf.indexOf('\\r\\n\\r\\n')
        if (idx === -1) {
          if (this._buf.length > this.headersMaxSize) { util.destroy(this.socket, new HeadersOverflowError()); return }
          break
        }
        const head = this._buf.subarray(0, idx).toString('latin1')
        this._buf = this._buf.subarray(idx + 4)
        const lines = head.split('\\r\\n')
        const statusLine = lines[0]
        const m = /^HTTP\\/(\\d)\\.(\\d) (\\d{3})(?: (.*))?$/.exec(statusLine)
        if (!m) { util.destroy(this.socket, new SocketError('bad response', util.getSocketInfo(this.socket))); return }
        const statusCode = parseInt(m[3], 10)
        const statusText = m[4] || ''
        if (this.onMessageBegin() === -1) return
        this.onStatus(Buffer.from(statusText, 'latin1'))
        this._hasTE = false
        for (let i = 1; i < lines.length; i++) {
          if (lines[i] === '') continue
          if ((lines[i][0] === ' ' || lines[i][0] === '\\t') && this.headers.length > 0) {
            // obs-fold continuation: append to previous value
            this.onHeaderValue(Buffer.from(' ' + lines[i].trim(), 'latin1'))
            continue
          }
          const ci = lines[i].indexOf(':')
          if (ci === -1) continue
          const k = lines[i].substring(0, ci).trim()
          const v = lines[i].substring(ci + 1).trim()
          if (k.toLowerCase() === 'transfer-encoding' && /\\bchunked\\b/i.test(v)) {
            this._hasTE = true
          }
          this.onHeaderField(Buffer.from(k, 'latin1'))
          this.onHeaderValue(Buffer.from(v, 'latin1'))
        }
        let conn = ''
        for (let i = 0; i < this.headers.length; i += 2) {
          if (this.headers[i].toString('latin1').toLowerCase() === 'connection') {
            conn = conn + (conn === '' ? '' : ',') + this.headers[i + 1].toString('latin1')
          }
        }
        const keepAlive = !/\\bclose\\b/i.test(conn) && (/\\bkeep-alive\\b/i.test(conn) || parseInt(m[2], 10) >= 1)
        const upgrade = statusCode === 101 || /\\bupgrade\\b/i.test(conn)
        const ret = this.onHeadersComplete(statusCode, upgrade, keepAlive)
        if (ret === -1) return
        if (ret === 2) {
          this.onUpgrade(this._buf)
          this._buf = Buffer.alloc(0)
          this._phase = 'done'
          return
        }
        if (ret === 1) {
          if (statusCode < 200) { this._phase = 'head'; continue }
          this._completeMessage()
          return
        }
        if (ret === constants.ERROR.PAUSED) {
          this._setupBodyPhase(statusCode)
          this.paused = true
          return
        }
        this._setupBodyPhase(statusCode)
      } else if (this._phase === 'body-cl') {
        if (this._clRemain <= 0) { this._completeMessage(); return }
        const take = Math.min(this._buf.length, this._clRemain)
        if (take === 0) break
        const body = this._buf.subarray(0, take)
        this._buf = this._buf.subarray(take)
        this._clRemain -= take
        const r = this.onBody(body)
        if (r === constants.ERROR.PAUSED) { this.paused = true; return }
        if (r === -1) return
        if (this._clRemain === 0) { this._completeMessage(); return }
      } else if (this._phase === 'body-chunked') {
        if (this._inChunk) {
          const e = this._buf.indexOf('\\r\\n')
          if (e === -1) {
            const partial = this._buf.toString('latin1')
            if (this._chunkSizeLineInvalid(partial)) {
              util.destroy(this.socket, this.createError(constants.ERROR.INVALID_CHUNK_SIZE, this._buf))
              return
            }
            if (this._buf.length > this.headersMaxSize) { util.destroy(this.socket, new HeadersOverflowError()); return }
            break
          }
          const sizeLine = this._buf.subarray(0, e).toString('latin1')
          this._buf = this._buf.subarray(e + 2)
          if (this._chunkSizeLineInvalid(sizeLine)) {
            util.destroy(this.socket, this.createError(constants.ERROR.INVALID_CHUNK_SIZE, Buffer.from(sizeLine, 'latin1')))
            return
          }
          const size = parseInt(sizeLine.split(';')[0].trim(), 16)
          if (Number.isNaN(size)) { util.destroy(this.socket, this.createError(constants.ERROR.INVALID_CHUNK_SIZE, Buffer.from(sizeLine, 'latin1'))); return }
          if (size === 0) {
            for (;;) {
              if (this._buf.length >= 2 && this._buf[0] === 0x0d && this._buf[1] === 0x0a) {
                this._buf = this._buf.subarray(2)
                this._completeMessage()
                return
              }
              const te = this._buf.indexOf('\\r\\n')
              if (te === -1) {
                if (this._buf.length > this.headersMaxSize) { util.destroy(this.socket, new HeadersOverflowError()); return }
                break
              }
              const tline = this._buf.subarray(0, te).toString('latin1')
              this._buf = this._buf.subarray(te + 2)
              if (tline === '') {
                this._completeMessage()
                return
              }
              const ci = tline.indexOf(':')
              if (ci === -1) continue
              this.onHeaderField(Buffer.from(tline.substring(0, ci).trim(), 'latin1'))
              this.onHeaderValue(Buffer.from(tline.substring(ci + 1).trim(), 'latin1'))
            }
            break
          }
          this._inChunk = false
          this._chunkRemain = size
        } else {
          if (this._buf.length < this._chunkRemain + 2) break
          const body = this._buf.subarray(0, this._chunkRemain)
          this._buf = this._buf.subarray(this._chunkRemain + 2)
          const r = this.onBody(body)
          if (r === constants.ERROR.PAUSED) { this.paused = true; return }
          if (r === -1) return
          this._inChunk = true
        }
      } else if (this._phase === 'body-eof') {
        if (this._buf.length === 0) break
        const body = this._buf
        this._buf = Buffer.alloc(0)
        const r = this.onBody(body)
        if (r === constants.ERROR.PAUSED) { this.paused = true; return }
        if (r === -1) return
        break
      }
    }
  }

  _setupBodyPhase (statusCode) {
    if (statusCode === 204 || statusCode === 205 || statusCode === 304) {
      this._completeMessage()
      return
    }
    if (this.contentLength !== '') {
      const cl = parseInt(this.contentLength, 10)
      this._phase = 'body-cl'
      this._clRemain = cl - this.bytesRead
      this._eofBody = false
      if (this._clRemain <= 0) {
        this._completeMessage()
      }
    } else if (this._hasTE) {
      this._phase = 'body-chunked'
      this._inChunk = true
      this._chunkRemain = 0
      this._eofBody = false
    } else if (statusCode >= 200) {
      this._phase = 'body-eof'
      this._eofBody = true
    } else {
      this._completeMessage()
    }
  }

  finish () {
    if (this.paused) {
      this.paused = false
      this._feed()
    }
    if (this._phase === 'body-cl' && this._clRemain > 0) {
      util.destroy(this.socket, new ResponseContentLengthMismatchError())
      return null
    }
    if (this._phase === 'body-eof' && this._eofBody) {
      this._eofBody = false
      this._completeMessage()
      return null
    }
    if ((this._phase === 'head' || this._phase === 'body-chunked') && this._buf.length > 0) {
      util.destroy(this.socket, this.createError(constants.ERROR.INVALID_EOF_STATE, this._buf))
      return null
    }
    if (this._phase !== 'done') {
      this._completeMessage()
    }
    return null
  }

  destroy () {
    this.ptr = null
    this.timeout && timers.clearTimeout(this.timeout)
    this.timeout = null
    this.timeoutValue = null
    this.timeoutType = null
    this.paused = false
    this._buf = Buffer.alloc(0)
    this._phase = 'done'
  }

  createError (ret, data) {
    return new HTTPParserError(
      'Response does not match the HTTP/1.1 protocol (JS parser)',
      constants.ERROR[ret] != null ? constants.ERROR[ret] : String(ret),
      data
    )
  }
}
`

// ── Edit 1: insert JsParser before onParserTimeout ──
const anchor = '\nfunction onParserTimeout (parserWeakRef) {'
if (!src.includes(anchor)) {
  console.error('[apply-undici-js-parser-v7] anchor not found: onParserTimeout')
  process.exit(1)
}
let out = src.replace(anchor, jsParserClass + anchor)

// ── Edit 2: lazyllhttp guard ──
const lazyGuardOld = `  if (!llhttpInstance) {
    llhttpInstance = lazyllhttp()
  }`
const lazyGuardNew = `  if (!llhttpInstance && process.env.UNDICI_JS_PARSER !== '1' && typeof WebAssembly !== 'undefined') {
    llhttpInstance = lazyllhttp()
  }`
if (!out.includes(lazyGuardOld)) { console.error('[apply-undici-js-parser-v7] lazy guard block not found'); process.exit(1) }
out = out.replace(lazyGuardOld, lazyGuardNew)

// ── Edit 3: connectH1 parser selection ──
const selectOld = `  socket[kParser] = new Parser(client, socket, llhttpInstance)`
const selectNew = `  socket[kParser] = (process.env.UNDICI_JS_PARSER === '1' || typeof WebAssembly === 'undefined')
    ? new JsParser(client, socket)
    : new Parser(client, socket, llhttpInstance)`
if (!out.includes(selectOld)) { console.error('[apply-undici-js-parser-v7] parser selection block not found'); process.exit(1) }
out = out.replace(selectOld, selectNew)

fs.writeFileSync(target, out, 'utf8')
console.log('[apply-undici-js-parser-v7] patched ' + target)
console.log('[apply-undici-js-parser-v7] JsParser injected; selection auto when WebAssembly undefined or UNDICI_JS_PARSER=1')
