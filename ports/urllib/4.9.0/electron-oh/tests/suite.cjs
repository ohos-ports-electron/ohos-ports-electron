'use strict';
// urllib@4.9.0 device-node / electron-oh 业务套件（阶段 3 主线）
//
// 用例 ID 与 02-baseline.json 的 cases[].name 一一对应（cases.json 由
// `ohpt-agent node-demo-results --prepare` 从名册派生）。每个用例至少一个真实检查点：
// 真实调用 urllib 公共 API + 对回显/状态/字节做断言，禁止空桩。
//
// 上游 test/**/*.test.ts 的断言按文件/单测粒度移植；仅两类等价改写并逐条记录：
//   1) 外网 host（registry.npmjs.org / registry.npmmirror.com）与 /tmp 硬编码 socket 路径
//      → 本地回环服务（名册把这些条目标为 degraded，见 03-adapt.json notes）；
//   2) 设备预算相关的大数据量（1GB/100MB streaming、1000 次 socket 复用循环）
//      → 同语义缩小规模（字节数一致断言保留）。
//
// 自签证书 fixture 由宿主机一次性生成后内嵌，设备侧不依赖 selfsigned 包。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const http2 = require('node:http2');
const net = require('node:net');
const zlib = require('node:zlib');
const { Readable, Transform, pipeline } = require('node:stream');
const { setTimeout: sleep } = require('node:timers/promises');
const { randomUUID } = require('node:crypto');
const dns = require('node:dns');
const diagnosticsChannel = require('node:diagnostics_channel');

const PEM = {"private":"-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEAowiTlHVxcxg1TgrkyeONRN96n+s6PV593C4rzTHI4Vo55ITa\n/QNygwcpZ4YNRTZJeWFGrjs9EI5DqSk+IddWfAtdsMxxnjD3NejYwUolLjF3MDfQ\n5fCHR82YKDUY10XcDYXwKsFxOfHbH5gmOm1J2bNeLCggk4CFa2jglt/1S9fQBeGa\nAl1+myBHulV8crPO6j0r+imgfhAlhI3pcy/M5wbUuyQV0ITi5aFedmZwR5fUb+qv\n5W87QbnKZrNIw9GVn9Mi1y3M1/r0uFzP9Zs13RpkCsVggV8pYdi/hNleNdDWNM50\nhCv1NK+wkjdW10CK5Ta9yaK2gWAkbM3m4nVTuwIDAQABAoIBAA0xevvnGyS0v0+O\n+x/JXdvGd/5sAz0HIglI5TuIPVjbO9cd1zjlaAVpdXTOuNEyiPSdJiKgYZsu4BPW\n5hPIANQt+Ul+6eziyoaezrepn+OiliIdSjbpZZEudpM+ZMG7AglIHvzexaJqS5C9\nd85/nJvU85iAMM6u9l0QUihzfD7EWYx1BtKf4NYr+GxjjX5SHrhc668QP5SOcUZe\n/RY569s7tDKwL5v1EYiCK3spuvXcGOzd8fmIUoa2Ubd3JipNmXaHmsb1FUHPK1x9\nyq6OJIEXSgkon9dEAfYv2qn20BjN1RtCIyKz5lY0lH0/0UncV6Y6jxyc3GhCGxdO\n/c4ynHUCgYEA2XxhCNiV91bwipi8nBEIclfQGE13QXt0njQMEBlKYYAUCwdiy6ym\nQvCQ6HW4GYYsF7g5LeQS1UXQzQwvloSMmsne4tn+IXfU8TK62/IRVfY5CGGWSHX8\nCDyhCyZz8YKkGv+3b/UUyYxTpkEEkqSfEeqeMEmlk7KfxFF+Q42IoM8CgYEAv+eg\nBoxvAMif47rbCUW3L4+en666NUQb3M9Gk1M8CTzUdBm7JRwvpYEurbCv+V90PjpL\nTcENCiYOqveRQPvfKmAfrZtyOTK0sRGuQPCBKLS2rmXvpJyv8LJwvib1jlB3SeOf\nXJAaO9jf+htQbS627ZiGe7px8swewCTdVEGe4VUCgYAyHp7CCh+tS2TNm9tDYA2B\nRElZgGiuN4QtfTMWdq2UgI6d6ArVgykhngzW9WICx8/be4H52Giaq6ctydQhrNQ2\nS7VItBIDpnj1SMqVK1jhZYfJLawTcNUvFMHMLwVjL8cfzbR5YZJzzBnu42bpYHSk\nDVx9Jku5GN4GwP0HFlPZMwKBgFn998g6YO+gJYK4pHDTtZTjJ8LAQGgsOViyBumd\nlcDLOuH7EwzTC/D0BHzFJ7Cst6la0udyiXfh4uz/zakItF192D0kcUsrYRrMLMgd\nQKRjImvkN54dMFCSjVZOlMaZK2eGC7xvgy3fhSEXX/7jcjs3VJF/HGJ8oEsAvp39\na9FFAoGAXfSqhrGRF5uVDIQcJB/cYYpoCzCQRa/n5u9c4x/4uZh1VOTtOwZE1Jwb\npFZ3MBKJE18fuu1230Z8pkr0JUtweD1CIfYPMEBibrlNRe+VPtrhC72HPuQZx+am\npdq+dX6FksOQDtkwEI5SwuPw87lq51ambTRazph7GHeNZIQbbmo=\n-----END RSA PRIVATE KEY-----\n","cert":"-----BEGIN CERTIFICATE-----\nMIICyDCCAbCgAwIBAgIJLJdJy2o1r9gpMA0GCSqGSIb3DQEBBQUAMAAwHhcNMjYx\nMTA2MDkwMDQ0WhcNMjcxMTA2MDkwMDQ0WjAAMIIBIjANBgkqhkiG9w0BAQEFAAOC\nAQ8AMIIBCgKCAQEAowiTlHVxcxg1TgrkyeONRN96n+s6PV593C4rzTHI4Vo55ITa\n/QNygwcpZ4YNRTZJeWFGrjs9EI5DqSk+IddWfAtdsMxxnjD3NejYwUolLjF3MDfQ\n5fCHR82YKDUY10XcDYXwKsFxOfHbH5gmOm1J2bNeLCggk4CFa2jglt/1S9fQBeGa\nAl1+myBHulV8crPO6j0r+imgfhAlhI3pcy/M5wbUuyQV0ITi5aFedmZwR5fUb+qv\n5W87QbnKZrNIw9GVn9Mi1y3M1/r0uFzP9Zs13RpkCsVggV8pYdi/hNleNdDWNM50\nhCv1NK+wkjdW10CK5Ta9yaK2gWAkbM3m4nVTuwIDAQABo0UwQzAMBgNVHRMEBTAD\nAQH/MAsGA1UdDwQEAwIC9DAmBgNVHREEHzAdhhtodHRwOi8vZXhhbXBsZS5vcmcv\nd2ViaWQjbWUwDQYJKoZIhvcNAQEFBQADggEBAJrZNB8s9A/GviCNZoZb6U6c/xNd\nK0fn0JXGgVVKojU0R3MlpItF+Iq1JEjJYqYwNdNvNoHNG1rsh7ZKxX1u3q9NPq2f\n5SldTmNz1jez52/kNBm3DOcjsa/qpblQhqrPW6BZzgB2fS7cJMnXt32cf1GaIBzA\npomd9TCNN7iAM+pINIqICz4XYUwZIvW8Awm6FNQMWkIq2oGt5MC7fYqnS44eJhWo\nMqAz4n+rH0fjc6broLJ8gBh/W/JY49eCOcB82Bjd9qhVFXtc+OBi5opPOqVCndG9\nrwfTigPO4dUTd5aJ+s3fdB+wbtJVG7Lg18CxcC1haTFYrJjF2szE/whJhn0=\n-----END CERTIFICATE-----\n"};

// gzip/brotli 用例的响应载荷：上游断言 data 匹配 /export async function startServer/，
// 这里用同签名文本作为设备侧 fixture 内容。
const GZIP_PAYLOAD = 'export async function startServer(options) {\n  // urllib device fixture payload\n}\n' +
  '// ' + 'x'.repeat(512) + '\n';

let _lib = null;
async function lib() {
  if (!_lib) {
    _lib = await import('@ohos-ports-electron/urllib');
    // Node 内置 undici 会抢先占据共享 global dispatcher symbol
    // （Symbol.for('undici.globalDispatcher.1')），npm undici 的 getGlobalDispatcher()
    // 会拿到跨版本 wrapper → timing/socket 计数全部为空（上游 test/setup.ts 同因同法）。
    // 重建 npm undici 自己的 dispatcher，保证本套件观测链路真实。
    if (!(_lib.getGlobalDispatcher() instanceof _lib.Dispatcher)) {
      _lib.setGlobalDispatcher(new _lib.Agent());
    }
  }
  return _lib;
}

// ───────────────────────── 测试服务器（上游 fixtures/server.ts 的等价移植） ─────────────────────────
const reqPerSocket = Symbol('requestsPerSocket');

function parseMultipart(body, boundary) {
  const parsed = { files: {}, form: {} };
  const delim = '--' + boundary;
  const text = body.toString('latin1');
  for (const raw of text.split(delim)) {
    let part = raw;
    if (!part || part.trim() === '--') continue;
    if (part.startsWith('\r\n')) part = part.slice(2);
    if (part.startsWith('--')) continue;
    const hEnd = part.indexOf('\r\n\r\n');
    if (hEnd < 0) continue;
    const headerText = part.slice(0, hEnd);
    let content = part.slice(hEnd + 4);
    if (content.endsWith('\r\n')) content = content.slice(0, -2);
    const cdLine = /content-disposition:([^\r\n]*)/i.exec(headerText);
    if (!cdLine) continue;
    const cd = cdLine[1];
    const nameMatch = /;\s*name="([^"]*)"/.exec(cd);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const starMatch = /;\s*filename\*=UTF-8''([^;\r\n]+)/i.exec(cd);
    const plainMatch = /;\s*filename="([^"]*)"/.exec(cd);
    let filename;
    if (starMatch) filename = decodeURIComponent(starMatch[1]);
    else if (plainMatch) filename = Buffer.from(plainMatch[1], 'latin1').toString('utf8');
    const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);
    const bytes = Buffer.from(content, 'latin1');
    if (filename !== undefined) {
      parsed.files[name] = {
        filename,
        mimeType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        encoding: '7bit',
        size: bytes.length,
      };
    } else {
      parsed.form[name] = bytes.toString('utf8');
    }
  }
  return parsed;
}

async function readableToBytes(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function startServer(options) {
  const opts = options || {};
  const rawHandler = async (req, res) => {
    const startTime = Date.now();
    const socket = req.socket;
    socket[reqPerSocket] = (socket[reqPerSocket] || 0) + 1;
    if (opts.keepAliveTimeout) res.setHeader('Keep-Alive', 'timeout=' + opts.keepAliveTimeout / 1000);
    const urlObject = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const pathname = urlObject.pathname;
    res.setHeader('x-requests-persocket', String(socket[reqPerSocket]));
    res.setHeader('x-requests-socket-port', String(req.socket.remotePort || 0));
    res.setHeader('X-Foo', 'bar');
    res.setHeader('x-href', urlObject.href);
    res.setHeader('x-method', req.method || '');
    res.setHeader('x-request-headers', JSON.stringify(req.headers));

    if (pathname === '/block') return; // 永不响应，用来制造超时

    if (pathname === '/mock-status') {
      const statusCode = parseInt(urlObject.searchParams.get('status') || '200', 10);
      res.statusCode = statusCode;
      res.end('Mock status ' + statusCode);
      return;
    }

    if (pathname === '/mock-bytes') {
      const size = parseInt(urlObject.searchParams.get('size') || '1024', 10);
      const bytes = Buffer.alloc(size);
      const delay = urlObject.searchParams.get('timeout');
      if (delay) {
        res.write(bytes);
        await sleep(parseInt(delay, 10));
        res.end();
      } else {
        res.end(bytes);
      }
      return;
    }

    const delay = urlObject.searchParams.get('timeout');
    if (delay) await sleep(parseInt(delay, 10));

    if (pathname === '/auth') {
      const authorization = (req.headers.authorization || '').split(' ')[1] || '';
      const auth = Buffer.from(authorization, 'base64').toString().split(':');
      res.end(JSON.stringify({ user: auth[0], password: auth[1] }));
      return;
    }

    if (pathname === '/hello/json') {
      res.end(JSON.stringify({ hello: 'urllib' }));
      return;
    }

    const digestChallenge =
      'Digest realm="testrealm@urllib.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"';
    if (pathname === '/digestAuth' || pathname === '/digestAuth2' || pathname === '/digestAuth/multi') {
      const headerName = pathname === '/digestAuth2' ? 'x-www-authenticate' : 'www-authenticate';
      const authorization = req.headers.authorization;
      if (!authorization) {
        if (pathname === '/digestAuth/multi') {
          res.setHeader(headerName, [
            'Digest realm="testrealm@urllib.com", algorithm=MD5-sess, qop="auth", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
            digestChallenge,
          ]);
        } else {
          res.setHeader(headerName, digestChallenge);
        }
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'authorization required' }));
        return;
      }
      if (!authorization.includes('Digest username="user"')) {
        res.setHeader(headerName, digestChallenge);
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'authorization invaild' }));
        return;
      }
      res.end(JSON.stringify({ authorization }));
      return;
    }

    if (pathname === '/wrongjson') {
      res.setHeader('content-type', 'application/json');
      res.end(Buffer.from('{"foo":""'));
      return;
    }

    if (pathname === '/wrongjson-gbk') {
      res.setHeader('content-type', 'application/json');
      res.end(Buffer.from(GZIP_PAYLOAD + GZIP_PAYLOAD));
      return;
    }

    if (pathname === '/html') {
      res.setHeader('content-type', 'text/html');
      res.end('<h1>hello</h1>');
      return;
    }

    if (pathname === '/set-one-cookie') {
      res.setHeader('set-cookie', 'foo=bar; path=/');
      res.setHeader('content-type', 'text/html');
      res.end('<h1>hello set-cookie</h1>');
      return;
    }

    if (pathname === '/set-two-cookie') {
      res.setHeader('Set-Cookie', ['foo=bar; path=/', 'hello=world; path=/']);
      res.setHeader('content-type', 'text/html');
      res.end('<h1>hello set-cookie</h1>');
      return;
    }

    if (pathname === '/redirect') {
      res.setHeader('Location', '/redirect-to-url');
      res.statusCode = 302;
      res.end('Redirect to /redirect-to-url');
      return;
    }
    if (pathname === '/redirect-deadlock') {
      res.setHeader('Location', '/redirect-deadlock');
      res.statusCode = 302;
      res.end('Redirect to /redirect-deadlock');
      return;
    }
    if (pathname === '/redirect-full') {
      const target = 'http://' + req.headers.host + '/redirect-full-to-url';
      res.setHeader('Location', target);
      res.statusCode = 302;
      res.end('Redirect to ' + target);
      return;
    }
    if (pathname === '/redirect-full-301') {
      const target = 'http://' + req.headers.host + '/redirect-full-301-to-url';
      res.setHeader('Location', target);
      res.statusCode = 301;
      res.end('Redirect to ' + target);
      return;
    }
    if (pathname === '/redirect-to-localhost') {
      res.setHeader('Location', 'http://localhost/');
      res.statusCode = 302;
      res.end('Redirect to http://localhost/');
      return;
    }
    if (pathname === '/redirect-to') {
      const target = urlObject.searchParams.get('url');
      res.statusCode = parseInt(urlObject.searchParams.get('status') || '302', 10);
      res.setHeader('Location', target);
      res.end('Redirect to ' + target);
      return;
    }

    if (req.url === '/304-with-gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      res.statusCode = 304;
      res.end();
      return;
    }

    if (pathname === '/socket.end.error') {
      res.write('foo haha\n');
      await sleep(200);
      res.write('foo haha 2');
      await sleep(200);
      res.socket.end('balabala');
      return;
    }

    if (pathname === '/json_with_controls_unicode') {
      res.end(Buffer.from('{"foo":"\b\f\n\r\tbar\u000e!1!\u0086!2!\u0000!3!\u001F!4!\u005C!5!end\u005C\\"}'));
      return;
    }
    if (pathname === '/json_with_t') {
      res.end(Buffer.from('{"foo":"ba\tr\t\t"}'));
      return;
    }

    if (pathname === '/errorcharset') {
      res.setHeader('Content-Type', 'text/plain;charset=notfound');
      res.end('你好');
      return;
    }

    if (pathname === '/brotli') {
      res.setHeader('Content-Encoding', 'br');
      res.end(zlib.brotliCompressSync(Buffer.from(GZIP_PAYLOAD)));
      return;
    }
    if (pathname === '/gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(zlib.gzipSync(Buffer.from(GZIP_PAYLOAD)));
      return;
    }
    if (pathname === '/error-gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(Buffer.from(GZIP_PAYLOAD));
      return;
    }
    if (pathname === '/error-brotli') {
      res.setHeader('Content-Encoding', 'br');
      res.end(Buffer.from(GZIP_PAYLOAD));
      return;
    }

    if (pathname === '/error') {
      res.destroy();
      return;
    }
    if (pathname === '/error-non-retry') {
      if (!req.headers['x-urllib-retry-on-socket-error']) {
        res.destroy();
        return;
      }
      res.end(JSON.stringify({ ok: 1 }));
      return;
    }

    if (pathname === '/raw') {
      const bytes = await readableToBytes(req);
      res.end(bytes);
      return;
    }

    // 读请求体（GET/HEAD 无体）
    let requestBytes = Buffer.alloc(0);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      requestBytes = await readableToBytes(req);
    }

    if (pathname === '/multipart' && (req.method === 'POST' || req.method === 'PUT')) {
      const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(req.headers['content-type'] || ''));
      const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';
      const parsed = boundary ? parseMultipart(requestBytes, boundary) : { files: {}, form: {} };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          href: urlObject.href,
          headers: req.headers,
          files: parsed.files,
          form: parsed.form,
        }),
      );
      return;
    }

    let requestBody;
    const contentType = req.headers['content-type'] || '';
    if (contentType.startsWith('application/x-www-form-urlencoded')) {
      const raw = requestBytes.toString();
      if (req.headers['x-qs'] === 'true') {
        requestBody = Object.assign({}, qsParseFallback(raw), { __raw__: raw });
      } else {
        requestBody = { __raw__: raw };
        for (const [field, value] of new URLSearchParams(raw).entries()) requestBody[field] = value;
      }
    } else if (contentType.startsWith('application/json')) {
      try {
        requestBody = JSON.parse(requestBytes.toString());
      } catch {
        requestBody = requestBytes.toString();
      }
    } else {
      requestBody = requestBytes.toString();
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('x-rt', String(Date.now() - startTime));
    const responseBody = JSON.stringify({
      method: req.method,
      url: req.url,
      href: urlObject.href,
      headers: req.headers,
      requestBody,
    });
    const contentEncoding = urlObject.searchParams.get('content-encoding');
    if (contentEncoding === 'gzip') {
      res.setHeader('content-encoding', 'gzip');
      res.end(zlib.gzipSync(Buffer.from(responseBody)));
      return;
    }
    if (contentEncoding === 'br') {
      res.setHeader('content-encoding', 'br');
      res.end(zlib.brotliCompressSync(Buffer.from(responseBody)));
      return;
    }
    res.end(responseBody);
  };
  // 客户端中断/服务端 destroy 导致的 handler 异常不能冒泡成 uncaughtException
  const handler = (req, res) => {
    rawHandler(req, res).catch(() => {
      try { if (!res.headersSent) { res.statusCode = 500; res.end(); } else res.destroy(); } catch { /* ignore */ }
    });
  };

  let server;
  if (opts.https) {
    server = https.createServer({ key: PEM.private, cert: PEM.cert }, handler);
  } else {
    server = http.createServer(handler);
  }
  // 客户端主动断开（socket.end('balabala') / res.destroy()）会产生 ECONNRESET/aborted
  // 服务端事件，必须消费掉，否则 Node 默认 uncaughtException 会杀掉整个进程
  server.on('clientError', (err, socket) => {
    if (err && err.code === 'ECONNRESET') return;
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  if (opts.keepAliveTimeout) server.keepAliveTimeout = opts.keepAliveTimeout;
  const protocol = opts.https ? 'https' : 'http';
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        url: protocol + '://127.0.0.1:' + port + '/',
        urlLocalhost: protocol + '://localhost:' + port + '/',
        closeServer() {
          if (server.closeAllConnections) server.closeAllConnections();
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

// 最小 qs 解析（只覆盖用例需要的 bracket 语法；不引入 qs 依赖）
function qsParseFallback(raw) {
  const out = {};
  for (const [k, v] of new URLSearchParams(raw).entries()) {
    const m = /^([^\[]+)((?:\[[^\]]*\])+)$/.exec(k);
    if (!m) { out[k] = v; continue; }
    let node = out;
    const parts = m[2].match(/\[([^\]]*)\]/g).map((x) => x.slice(1, -1));
    const keys = [m[1], ...parts];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (i === keys.length - 1) node[key] = v;
      else node = node[key] = (node[key] && typeof node[key] === 'object' ? node[key] : {});
    }
  }
  // 纯数字下标对象 → 数组（对齐 qs.parse 的 array 语义）
  const toArray = (node) => {
    for (const k of Object.keys(node)) {
      if (node[k] && typeof node[k] === 'object') node[k] = toArray(node[k]);
    }
    const keys = Object.keys(node);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
      const nums = keys.map(Number).sort((a, b) => a - b);
      if (nums[0] === 0 && nums.every((n, i) => n === i)) {
        return nums.map((n) => node[String(n)]);
      }
    }
    return node;
  };
  return toArray(out);
}

function startUnixSocketServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urllib-sock-'));
  const socketPath = path.join(dir, 'server.sock');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.write(JSON.stringify({ a: 1 }));
    res.end();
  });
  server.on('clientError', (err, socket) => {
    if (err && err.code === 'ECONNRESET') return;
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  return new Promise((resolve) => {
    server.listen(socketPath, () => {
      resolve({
        server,
        socketPath,
        url: 'http://localhost/',
        closeServer() {
          if (server.closeAllConnections) server.closeAllConnections();
          return new Promise((r) => server.close(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } r(); }));
        },
      });
    });
  });
}

// 最小 HTTP 正向代理（undici 7 ProxyAgent 对 http 目标走 CONNECT 隧道；兼容 absolute-form）
function startProxyServer() {
  const server = http.createServer((req, res) => {
    req.on('error', () => {});
    res.on('error', () => {});
    let target;
    try {
      target = new URL(req.url);
    } catch {
      res.statusCode = 400;
      res.end('bad proxy request');
      return;
    }
    const upstream = http.request(
      {
        host: target.hostname,
        port: target.port || 80,
        method: req.method,
        path: target.pathname + target.search,
        headers: req.headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end('proxy error');
    });
    req.pipe(upstream);
  });
  server.on('connect', (req, clientSocket, head) => {
    // CONNECT host:port 隧道：双向 pipe 到目标
    let target;
    try {
      target = new URL('http://' + req.url);
    } catch {
      clientSocket.destroy();
      return;
    }
    const upstream = net.connect(parseInt(target.port, 10) || 80, target.hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        url: 'http://127.0.0.1:' + port,
        closeServer() {
          if (server.closeAllConnections) server.closeAllConnections();
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

// H2/HTTP1.1 双协议 ALPN 服务器（协议协商断言用）
function startEchoTlsServer(allowHTTP1) {
  const server = http2.createSecureServer({ allowHTTP1: !!allowHTTP1, key: PEM.private, cert: PEM.cert });
  const conns = new Set();
  server.on('clientError', () => {});
  server.on('connection', (s) => { conns.add(s); s.on('close', () => conns.delete(s)); });
  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('hello http/' + req.httpVersion + '!');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        url: 'https://127.0.0.1:' + port,
        close() {
          for (const s of conns) { try { s.destroy(); } catch { /* ignore */ } }
          conns.clear();
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

// 纯 HTTP/1.1 TLS 服务器（上游 startH1EchoServer 等价）
function startHttpsEchoServer() {
  const server = https.createServer({ key: PEM.private, cert: PEM.cert }, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('hello http/' + req.httpVersion + '!');
  });
  server.on('clientError', () => {});
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        url: 'https://127.0.0.1:' + port,
        close() {
          if (server.closeAllConnections) server.closeAllConnections();
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

function h2StreamServer() {
  const server = http2.createSecureServer({ key: PEM.private, cert: PEM.cert });
  const conns = new Set();
  server.on('clientError', () => {});
  server.on('connection', (s) => { conns.add(s); s.on('close', () => conns.delete(s)); });
  server.on('stream', (stream, headers) => {
    stream.respond({ 'content-type': 'text/plain; charset=utf-8', 'x-custom-h2': 'hello', ':status': 200 });
    if (headers[':method'] !== 'HEAD') stream.end('hello h2!');
    else stream.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        url: 'https://127.0.0.1:' + server.address().port,
        close() {
          for (const s of conns) { try { s.destroy(); } catch { /* ignore */ } }
          conns.clear();
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

function tmpFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urllib-fixture-'));
  const files = {
    'index.js': 'module.exports = function hello() {\n  return 1;\n}\n',
    'foo.txt': 'foo\n',
    'package.json': JSON.stringify({ name: 'urllib-fixture', version: '1.0.0' }) + '\n',
    'options.files.test.ts': '// device fixture with .ts extension for mime lookup\n' + '// ' + 'y'.repeat(64) + '\n',
    '😄foo😭.txt': 'emoji file content\n',
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return {
    dir,
    file: (name) => path.join(dir, name),
    cleanup() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } },
  };
}

function cleanup(...items) {
  for (const fn of items) { try { if (fn) fn(); } catch { /* ignore */ } }
}

// 只关闭自建 dispatcher 的客户端；无 connect/allowH2 的 HttpClient 共享全局 dispatcher，
// 关闭它会毒化后续所有用例（ClientDestroyedError）。
async function disposeClient(u, client) {
  try {
    const d = client.getDispatcher && client.getDispatcher();
    if (d && d !== u.getGlobalDispatcher()) await d.close();
  } catch { /* ignore */ }
}

// ───────────────────────── 用例实现 ─────────────────────────
const cases = {};

// 1. test/HttpClient.connect.rejectUnauthorized.test.ts
cases['test/HttpClient.connect.rejectUnauthorized.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer({ https: true });
  try {
    let err;
    try { await new u.HttpClient().request(url); } catch (e) { err = e; }
    check(0, !!err, err && err.code, 'DEPTH_ZERO_SELF_SIGNED_CERT');
    check(1, err && err.res && err.res.status === -1, err && err.res && err.res.status, -1);
    check(2, /signed certificate/.test(String(err && err.message)), err && err.message, 'signed certificate');

    const client = new u.HttpClient({ connect: { rejectUnauthorized: false } });
    const response = await client.request(url, { dataType: 'json' });
    check(3, response.status === 200 && response.data.method === 'GET', response.status, 200);
    await disposeClient(u, client);
  } finally {
    await closeServer();
  }
};

// 2. test/HttpClient.events.test.ts
cases['test/HttpClient.events.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    const client = new u.HttpClient();
    let requestCount = 0;
    let responseCount = 0;
    let responseOk = true;
    client.on('request', (info) => {
      requestCount++;
      if (info.args.opaque.requestId !== 'mock-request-id-' + requestCount) responseOk = false;
    });
    client.on('response', (info) => {
      responseCount++;
      if (info.res.status !== 200) responseOk = false;
      if (info.requestId !== info.req.requestId) responseOk = false;
    });
    let response = await client.request(url, {
      dataType: 'json',
      opaque: { requestId: 'mock-request-id-1' },
      ctx: { foo: 'bar' },
      timing: false,
    });
    check(0, response.status === 200 && response.data.method === 'GET', response.status, 200);
    check(1, requestCount === 1 && responseCount === 1, requestCount + '/' + responseCount, '1/1');
    check(2, responseOk, responseOk, true);

    response = await client.request(url, { dataType: 'json', opaque: { requestId: 'mock-request-id-2' }, timing: true });
    check(3, requestCount === 2 && responseCount === 2, requestCount + '/' + responseCount, '2/2');

    let requestErr;
    try { await client.request(url + 'error', { dataType: 'json', opaque: { requestId: 'mock-request-id-3' }, socketErrorRetry: 0 }); } catch (e) { requestErr = e; }
    check(4, !!requestErr && requestErr.name === 'SocketError' && requestErr.status === -1, requestErr && requestErr.name, 'SocketError');
    check(5, requestCount === 3 && responseCount === 3, requestCount + '/' + responseCount, '3/3');
    await disposeClient(u, client);
  } finally {
    await closeServer();
  }
};

// 3. test/HttpClient.test.ts
cases['test/HttpClient.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  const h2s = await startEchoTlsServer(true);
  const h1s = await startHttpsEchoServer();
  try {
    const client = new u.HttpClient({ defaultArgs: { timeout: 5000 } });
    let response = await client.curl(url);
    check(0, response.status === 200, response.status, 200);
    response = await client.curl(url, { method: 'GET' });
    check(1, response.status === 200, response.status, 200);

    // 协议协商：4.9.0 默认客户端（无 allowH2/connect 专用 dispatcher）走 HTTP/1.1；
    // allowH2:true → HTTP/2（undici 7 Agent 默认 h1，需显式开启）
    const h2 = new u.HttpClient({ allowH2: true, connect: { rejectUnauthorized: false } });
    const r2 = await h2.request(h2s.url, { dataType: 'text' });
    check(2, r2.data === 'hello http/2.0!', r2.data, 'hello http/2.0!');
    const h1 = new u.HttpClient({ allowH2: false, connect: { rejectUnauthorized: false } });
    const r1 = await h1.request(h2s.url, { dataType: 'text' });
    check(3, r1.data === 'hello http/1.1!', r1.data, 'hello http/1.1!');
    const h1only = await new u.HttpClient({ connect: { rejectUnauthorized: false } }).request(h1s.url, { dataType: 'text' });
    check(4, h1only.data === 'hello http/1.1!', h1only.data, 'hello http/1.1!');

    // checkAddress（SSRF）：第一次拒绝 → IllegalAddressError；之后放行
    let count = 0;
    const guarded = new u.HttpClient({ checkAddress() { count++; return count !== 1; } });
    let ssrfErr;
    try { await guarded.request(url); } catch (e) { ssrfErr = e; }
    check(5, !!ssrfErr && ssrfErr.name === 'IllegalAddressError' && ssrfErr.hostname === '127.0.0.1', ssrfErr && ssrfErr.name, 'IllegalAddressError');
    const allowed = await guarded.request(url);
    check(6, allowed.status === 200, allowed.status, 200);
    check(7, Object.keys(guarded.getDispatcherPoolStats()).length >= 1, Object.keys(guarded.getDispatcherPoolStats()).length, '>=1');

    // 自定义 lookup（真实调用链：虚构主机名必须经我们注入的 lookup 解析）
    const lookupPort = new URL(url).port;
    let lookupCalls = 0;
    const lookupClient = new u.HttpClient({
      lookup(hostname, options, callback) {
        lookupCalls++;
        setTimeout(() => callback(null, [{ address: '127.0.0.1', family: 4 }]), 50);
      },
    });
    const lr = await lookupClient.request('http://lookup-test.invalid:' + lookupPort + '/');
    check(8, lookupCalls === 1 && lr.status === 200 && lr.res.rt > 50, lookupCalls + '/' + (lr.res && lr.res.rt), '1/>50');
    for (let i = 0; i < 5; i++) await lookupClient.request('http://lookup-test.invalid:' + lookupPort + '/');
    check(9, lookupCalls < 6, lookupCalls, '<6');

    await Promise.all(['h2', 'h1', 'lookup'].map(async (name, i) => {
      const c = [h2, h1, lookupClient][i];
      await disposeClient(u, c);
    }));
    await disposeClient(u, client);
  } finally {
    await closeServer();
    await h2s.close();
    await h1s.close();
  }
};

// 4. test/diagnostics_channel.test.ts
cases['test/diagnostics_channel.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let lastOpaque;
    let socket;
    const onRequest = (msg) => { lastOpaque = msg.request.args.opaque; };
    const onResponse = (msg) => { socket = msg.response.socket; };
    diagnosticsChannel.subscribe('urllib:request', onRequest);
    diagnosticsChannel.subscribe('urllib:response', onResponse);
    try {
      let traceId = 'mock-traceid-1';
      let response = await u.request(url, { method: 'HEAD', dataType: 'json', opaque: { tracer: { traceId } } });
      check(0, response.status === 200 && lastOpaque.tracer.traceId === traceId, lastOpaque && lastOpaque.tracer.traceId, traceId);
      check(1, !!socket && socket.handledRequests === 1 && socket.handledResponses === 1, socket && socket.handledResponses, 1);
      // socket 复用循环（上游 1000 次；设备预算缩小为 5 次，断言语义不变）
      for (let i = 0; i < 5; i++) {
        await sleep(1);
        traceId = 'mock-traceid-' + (i + 2);
        response = await u.request(url, { method: 'GET', dataType: 'json', opaque: { tracer: { traceId } } });
      }
      check(2, response.status === 200 && lastOpaque.tracer.traceId === traceId, lastOpaque.tracer.traceId, traceId);
      check(3, socket.handledRequests === 6 && socket.handledResponses === 6, socket.handledResponses, 6);
      check(4, !!socket.localAddress && !!socket.remotePort, socket.localAddress, 'localAddress');

      // 错误请求也走 urllib:response（error 附带 socket 信息）
      let lastError;
      const onResponseErr = (msg) => { lastError = msg.error; };
      diagnosticsChannel.subscribe('urllib:response', onResponseErr);
      let err;
      try { await u.request(url + 'error', { dataType: 'json', opaque: { tracer: { traceId: 'x' } } }); } catch (e) { err = e; }
      check(5, !!err && err.name === 'SocketError' && err === lastError, err && err.name, 'SocketError');
      diagnosticsChannel.unsubscribe('urllib:response', onResponseErr);
    } finally {
      diagnosticsChannel.unsubscribe('urllib:request', onRequest);
      diagnosticsChannel.unsubscribe('urllib:response', onResponse);
    }
  } finally {
    await closeServer();
  }
};

// 5. test/fetch-head-request-should-keepalive.test.ts（上游 describe.skip，issue #565；这里做真实 keepalive 断言）
cases['test/fetch-head-request-should-keepalive.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let res = await u.fetch(url, { method: 'GET' });
    check(0, res.status === 200 && res.headers.get('connection') === 'keep-alive', res.headers.get('connection'), 'keep-alive');
    await sleep(10);
    res = await u.fetch(url, { method: 'HEAD' });
    check(1, res.status === 200, res.status, 200);
    check(2, Number(res.headers.get('x-requests-persocket')) >= 1, res.headers.get('x-requests-persocket'), '>=1');
  } finally {
    await closeServer();
  }
};

// 6. test/fetch.test.ts
cases['test/fetch.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    // 4.9.0 FetchFactory：无 connect/allowH2 时不创建专用 dispatcher，回落全局。
    const seen = { req: null, res: null, fetchReq: null, fetchRes: null };
    const subs = {
      'urllib:request': (m) => { seen.req = m; },
      'urllib:response': (m) => { seen.res = m; },
      'urllib:fetch:request': (m) => { seen.fetchReq = m; },
      'urllib:fetch:response': (m) => { seen.fetchRes = m; },
    };
    for (const [name, fn] of Object.entries(subs)) diagnosticsChannel.subscribe(name, fn);
    try {
      u.FetchFactory.setClientOptions({});
      let response = await u.fetch(url + 'html');
      check(0, !!response && response.status === 200, response && response.status, 200);
      check(1, !!(seen.req && seen.req.request && seen.res && seen.res.response), !!seen.req, 'request');
      check(2, !!(seen.fetchReq && seen.fetchReq.fetch && seen.fetchRes && seen.fetchRes.timingInfo), !!seen.fetchRes, 'fetch-response');
      await sleep(1);
      response = await u.fetch(url + 'html');
      check(3, seen.res.response.socket.handledResponses > 1, seen.res.response.socket.handledResponses, '>1');
      const stats = u.FetchFactory.getDispatcherPoolStats();
      check(4, stats && Object.keys(stats).length > 0, stats && Object.keys(stats).length, '>0');
    } finally {
      for (const [name, fn] of Object.entries(subs)) diagnosticsChannel.unsubscribe(name, fn);
    }

    // POST 通过 Request 对象（使用 urllib 重导出的 undici Request，避免依赖顶层 undici 解析）
    const request = new u.Request(url, { method: 'POST', body: 'test-body' });
    const postRes = await u.fetch(request);
    check(5, postRes.status === 200, postRes.status, 200);

    // 错误请求也保留 socket 信息
    let timeoutErr;
    try { await u.fetch(url + 'html?timeout=9999', { signal: AbortSignal.timeout(100) }); } catch (e) { timeoutErr = e; }
    check(6, !!timeoutErr && timeoutErr.name === 'TimeoutError', timeoutErr && timeoutErr.name, 'TimeoutError');

    // 独立 FetchFactory 实例
    const factory = new u.FetchFactory();
    factory.setClientOptions({});
    const fr = await factory.fetch(url + 'html');
    check(7, fr.status === 200 && Object.keys(factory.getDispatcherPoolStats()).length > 0, fr.status, 200);
    await disposeClient(u, factory);
  } finally {
    await closeServer();
  }
};

// 7. test/formData-with-BufferStream.test.ts
cases['test/formData-with-BufferStream.test.ts'] = async ({ check }) => {
  const u = await lib();
  const fixtures = tmpFixtureDir();
  const { url, closeServer } = await startServer();
  class BufferStream extends Transform {
    constructor(options) { super(options); this.buf = Buffer.alloc(1024 * 1024); this.offset = 0; }
    _transform(chunk, _enc, callback) {
      const need = this.offset + chunk.length;
      if (need < this.buf.length) { chunk.copy(this.buf, this.offset); this.offset += chunk.length; return callback(); }
      const copyLen = this.buf.length - this.offset;
      chunk.copy(this.buf, this.offset, 0, copyLen);
      const out = this.buf;
      this.buf = Buffer.alloc(1024 * 1024);
      this.offset = chunk.length - copyLen;
      if (this.offset) chunk.copy(this.buf, 0, copyLen);
      callback(null, out);
    }
    _flush(callback) {
      if (this.offset) { this.push(Buffer.from(this.buf.subarray(0, this.offset))); this.offset = 0; }
      callback();
    }
  }
  try {
    const fileStream = fs.createReadStream(fixtures.file('index.js'));
    const bufferStream = new BufferStream();
    fileStream.pipe(bufferStream);
    const form = new u.WebFormData();
    form.append('fileBufferStream', bufferStream, 'index.js');
    form.append('foo', 'bar');
    const response = await new u.HttpClient().request(url + 'multipart', {
      method: 'POST',
      content: form,
      headers: form.getHeaders(),
      dataType: 'json',
    });
    check(0, response.status === 200, response.status, 200);
    check(1, response.data.files.fileBufferStream && response.data.files.fileBufferStream.filename === 'index.js', response.data.files.fileBufferStream && response.data.files.fileBufferStream.filename, 'index.js');
    check(2, JSON.stringify(response.data.form) === JSON.stringify({ foo: 'bar' }), JSON.stringify(response.data.form), '{"foo":"bar"}');
  } finally {
    await closeServer();
    fixtures.cleanup();
  }
};

// 8. test/head-request-should-keepalive.test.ts
cases['test/head-request-should-keepalive.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    const client = new u.HttpClient();
    let res = await client.request(url, { method: 'GET' });
    check(0, res.status === 200 && res.headers.connection === 'keep-alive', res.headers.connection, 'keep-alive');
    let maxHandled = res.res.socket.handledResponses;
    await sleep(10);
    let keepAliveAll = true;
    for (let i = 0; i < 4; i++) {
      res = await client.request(url, { method: 'HEAD' });
      if (res.headers.connection !== 'keep-alive') keepAliveAll = false;
      if (res.res.socket.handledResponses > maxHandled) maxHandled = res.res.socket.handledResponses;
    }
    check(1, keepAliveAll, keepAliveAll, true);
    // 连接复用确实发生（同一 socket 上 >1 次响应），不锁定具体 socket id
    check(2, maxHandled >= 2, maxHandled, '>=2');

    res = await client.request(url, { method: 'GET', reset: true });
    check(3, res.headers.connection === 'close', res.headers.connection, 'close');
    const resetSocketId = res.res.socket.id;
    await sleep(10);
    res = await client.request(url, { method: 'HEAD', reset: true });
    check(4, res.headers.connection === 'close' && res.res.socket.id !== resetSocketId, res.res.socket.id !== resetSocketId, true);
    await disposeClient(u, client);
  } finally {
    await closeServer();
  }
};

// 9. test/keep-alive-header.test.ts
cases['test/keep-alive-header.test.ts'] = async ({ check }) => {
  const u = await lib();
  const keepAliveTimeout = 2000;
  const { url, closeServer } = await startServer({ keepAliveTimeout });
  const client = new u.HttpClient();
  try {
    const max = process.env.TEST_KEEPALIVE_COUNT ? parseInt(process.env.TEST_KEEPALIVE_COUNT, 10) : 3;
    const origin = url.slice(0, -1);
    let count = 0;
    let otherSideClosed = 0;
    let readECONNRESET = 0;
    let headerOk = true;
    let pendingOk = true;
    while (count < max) {
      count++;
      try {
        const task = client.request(url);
        const stats = client.getDispatcherPoolStats()[origin];
        if (stats && stats.pending !== 1) pendingOk = false;
        let response = await task;
        for (let i = 0; i < 15; i++) {
          if (response.headers.connection !== 'keep-alive' || response.headers['keep-alive'] !== 'timeout=2') headerOk = false;
          response = i < 14 ? await client.request(url) : response;
        }
        await sleep(keepAliveTimeout / 2);
        response = await client.request(url);
        for (let i = 0; i < 8; i++) {
          if (response.headers.connection !== 'keep-alive' || response.headers['keep-alive'] !== 'timeout=2') headerOk = false;
          response = i < 7 ? await client.request(url) : response;
        }
        await sleep(keepAliveTimeout);
      } catch (err) {
        if (err && err.message === 'other side closed') otherSideClosed++;
        else if (err && err.message === 'read ECONNRESET') readECONNRESET++;
        else throw err;
      }
    }
    check(0, headerOk, headerOk, true);
    check(1, pendingOk, pendingOk, true);
    check(2, otherSideClosed === 0 && readECONNRESET === 0, otherSideClosed + '/' + readECONNRESET, '0/0');
  } finally {
    try { await disposeClient(u, client); } catch { /* ignore */ }
    await closeServer();
  }
};

// 10. test/non-ascii-request-header.test.ts
cases['test/non-ascii-request-header.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let err;
    try { await u.request(url, { headers: { 'x-test': '中文' }, dataType: 'json' }); } catch (e) { err = e; }
    check(0, !!err && err.name === 'InvalidArgumentError', err && err.name, 'InvalidArgumentError');
    check(1, !!err && err.message === 'invalid x-test header', err && err.message, 'invalid x-test header');
    check(2, !!err && err.code === 'UND_ERR_INVALID_ARG' && err.res && err.res.status === -1, err && err.code, 'UND_ERR_INVALID_ARG');
  } finally {
    await closeServer();
  }
};

// 11. test/options.auth.test.ts
cases['test/options.auth.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    const response = await u.request(url + 'auth', { auth: 'user:pwd', dataType: 'json', timing: true });
    check(0, response.status === 200, response.status, 200);
    check(1, response.data.user === 'user' && response.data.password === 'pwd', JSON.stringify(response.data), '{"user":"user","password":"pwd"}');
    check(2, response.res.timing.waiting > 0, response.res.timing.waiting, '>0');
  } finally {
    await closeServer();
  }
};

// 12. test/options.compressed.test.ts
cases['test/options.compressed.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let response = await u.request(url + 'brotli', { dataType: 'text' });
    check(0, response.status === 200 && response.headers['content-encoding'] === 'br' && !JSON.parse(response.headers['x-request-headers'])['accept-encoding'], response.headers['content-encoding'], 'br');
    response = await u.request(url + 'brotli', { dataType: 'text', compressed: true });
    check(1, /export async function startServer/.test(response.data), response.data.length, 'payload');
    response = await u.request(url + 'gzip', { dataType: 'text', compressed: true });
    check(2, response.headers['content-encoding'] === 'gzip' && /export async function startServer/.test(response.data), response.headers['content-encoding'], 'gzip');
    response = await u.request(url + '304-with-gzip', { dataType: 'text', compressed: true });
    check(3, response.status === 304 && response.data === '', response.status, 304);
    response = await u.request(url + '304-with-gzip', { dataType: 'json', compressed: true });
    check(4, response.status === 304 && response.data === null, response.status, 304);

    let err;
    try { await u.request(url + 'error-gzip', { dataType: 'text', compressed: true }); } catch (e) { err = e; }
    check(5, !!err && err.name === 'UnzipError' && err.code === 'Z_DATA_ERROR' && err.status === 200, err && err.code, 'Z_DATA_ERROR');
    let brErr;
    try { await u.request(url + 'error-brotli', { dataType: 'text', compressed: true }); } catch (e) { brErr = e; }
    check(6, !!brErr && brErr.name === 'UnzipError' && brErr.status === 200, brErr && brErr.name, 'UnzipError');
  } finally {
    await closeServer();
  }
};

// 13. test/options.content.test.ts
cases['test/options.content.test.ts'] = async ({ check }) => {
  const u = await lib();
  const fixtures = tmpFixtureDir();
  const { url, closeServer } = await startServer();
  try {
    let response = await u.request(url, { content: 'foo content', dataType: 'json' });
    check(0, response.status === 200 && response.data.method === 'GET' && response.data.requestBody === '', response.data.requestBody, '');
    response = await u.request(url, { method: 'POST', content: 'foo content', dataType: 'json' });
    check(1, response.data.method === 'POST' && response.data.requestBody === 'foo content', response.data.requestBody, 'foo content');
    check(2, response.data.headers['content-type'] === 'text/plain;charset=UTF-8' && response.data.headers['content-length'] === '11', response.data.headers['content-type'], 'text/plain;charset=UTF-8');
    response = await u.request(url, { method: 'POST', content: 'foo content', dataType: 'json', headers: { 'content-type': 'text/plain' } });
    check(3, response.data.requestBody === 'foo content' && response.data.headers['content-type'] === 'text/plain', response.data.headers['content-type'], 'text/plain');
    const big = Buffer.alloc(1024 * 1024);
    response = await u.request(url + 'raw', { method: 'POST', content: big });
    check(4, response.status === 200 && response.data.length === big.length, response.data.length, big.length);
    check(5, JSON.parse(response.headers['x-request-headers'])['content-length'] === String(big.length), response.headers['x-request-headers'] && 'content-length', String(big.length));
    response = await u.request(url, { method: 'DELETE', content: '<xml>DELETE * FROM user</xml>', contentType: 'application/xml', dataType: 'json' });
    check(6, response.data.method === 'DELETE' && response.data.requestBody === '<xml>DELETE * FROM user</xml>' && response.data.headers['content-length'] === '29', response.data.headers['content-length'], '29');
    response = await u.request(url + 'raw', { method: 'POST', content: fs.createReadStream(fixtures.file('options.files.test.ts')) });
    check(7, response.status === 200 && response.data.length > 0, response.data.length, '>0');
  } finally {
    await closeServer();
    fixtures.cleanup();
  }
};

// ── options.data.test.ts（20 条逐测移植） ──
const dataCase = (fn) => async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    await fn(u, url, check);
  } finally {
    await closeServer();
  }
};

cases['test/options.data.test.ts > options.data.test.ts > should default GET with data and auto convert to query string'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, {
    data: { sql: 'SELECT * from table', data: '哈哈', b: undefined, c: '2222', d: 1111, e() { return ''; }, f: true, g: ['a', 'b'] },
    dataType: 'json',
  });
  check(0, response.status === 200 && response.data.method === 'GET', response.status, 200);
  check(1, response.data.url === '/?sql=SELECT%20*%20from%20table&data=%E5%93%88%E5%93%88&b=&c=2222&d=1111&e=&f=true&g=a&g=b', response.data.url, 'query-string');
  const parsed = new URL(response.data.href);
  check(2, parsed.searchParams.get('sql') === 'SELECT * from table' && parsed.searchParams.get('data') === '哈哈', parsed.searchParams.get('sql'), 'SELECT * from table');
  check(3, !response.redirected && response.url.startsWith(url), response.redirected, false);
});

cases['test/options.data.test.ts > options.data.test.ts > should not mutate a passed URL object when setting query string'] = dataCase(async (u, url, check) => {
  const target = new URL(url);
  check(0, target.searchParams.get('param1') === null, target.searchParams.get('param1'), null);
  await u.request(target, { data: { param1: 'val1' } });
  check(1, target.searchParams.get('param1') === null, target.searchParams.get('param1'), null);
});

cases['test/options.data.test.ts > options.data.test.ts > should GET with data work on nestedQuerystring=true'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, {
    method: 'GET',
    data: { sql: 'SELECT * from table', data: '哈哈', foo: { bar: 'bar value', array: [1, 2, 3] } },
    nestedQuerystring: true,
    dataType: 'json',
    headers: { 'x-qs': 'true' },
  });
  check(0, response.status === 200 && response.data.method === 'GET', response.status, 200);
  check(1, response.data.url === '/?sql=SELECT%20%2A%20from%20table&data=%E5%93%88%E5%93%88&foo%5Bbar%5D=bar%20value&foo%5Barray%5D%5B0%5D=1&foo%5Barray%5D%5B1%5D=2&foo%5Barray%5D%5B2%5D=3', response.data.url, 'nested-query');
  const parsed = new URL(response.data.href);
  check(2, parsed.searchParams.get('foo[bar]') === 'bar value' && parsed.searchParams.get('foo[array][2]') === '3', parsed.searchParams.get('foo[bar]'), 'bar value');
});

cases['test/options.data.test.ts > options.data.test.ts > should GET /ok?hello=1 with data work on nestedQuerystring=true'] = dataCase(async (u, url, check) => {
  const response = await u.request(url + 'ok?hello=1', {
    method: 'GET',
    data: { sql: 'SELECT * from table', data: '哈哈', foo: { bar: 'bar value', array: [1, 2, 3] } },
    nestedQuerystring: true,
    dataType: 'json',
    headers: { 'x-qs': 'true' },
  });
  check(0, response.status === 200 && response.data.method === 'GET', response.status, 200);
  check(1, response.data.url === '/ok?hello=1&sql=SELECT%20%2A%20from%20table&data=%E5%93%88%E5%93%88&foo%5Bbar%5D=bar%20value&foo%5Barray%5D%5B0%5D=1&foo%5Barray%5D%5B1%5D=2&foo%5Barray%5D%5B2%5D=3', response.data.url, 'nested-query-with-existing');
});

cases['test/options.data.test.ts > options.data.test.ts > should HEAD with data and auto convert to query string'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, { method: 'HEAD', data: { sql: 'SELECT * from table', data: '哈哈' }, dataType: 'json' });
  check(0, response.status === 200 && response.headers['x-method'] === 'HEAD', response.headers['x-method'], 'HEAD');
  const parsed = new URL(response.headers['x-href']);
  check(1, parsed.searchParams.get('sql') === 'SELECT * from table' && parsed.searchParams.get('data') === '哈哈', parsed.searchParams.get('data'), '哈哈');
});

cases['test/options.data.test.ts > options.data.test.ts > should concat query string and data correctly when GET'] = dataCase(async (u, url, check) => {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('that', 'in_path');
  const response = await u.request(requestUrl, { method: 'GET', data: { sql: 'SELECT * from table', data: '哈哈' }, dataType: 'json' });
  check(0, response.data.method === 'GET', response.data.method, 'GET');
  check(1, response.data.url === '/?that=in_path&sql=SELECT%20*%20from%20table&data=%E5%93%88%E5%93%88', response.data.url, 'concat');
});

cases['test/options.data.test.ts > options.data.test.ts > should ignore data = buffer on GET request'] = dataCase(async (u, url, check) => {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('that', 'in_path');
  const response = await u.request(requestUrl, { method: 'GET', data: Buffer.from(JSON.stringify({ sql: 'x' })), dataType: 'json' });
  check(0, response.data.url === '/?that=in_path', response.data.url, '/?that=in_path');
});

cases['test/options.data.test.ts > options.data.test.ts > should ignore data = string on GET request'] = dataCase(async (u, url, check) => {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('that', 'in_path');
  const response = await u.request(requestUrl, { method: 'GET', data: JSON.stringify({ sql: 'x' }), dataType: 'json' });
  check(0, response.data.url === '/?that=in_path', response.data.url, '/?that=in_path');
});

cases['test/options.data.test.ts > options.data.test.ts > should ignore data = readable on GET request'] = dataCase(async (u, url, check) => {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('that', 'in_path');
  const response = await u.request(requestUrl, { method: 'GET', data: Readable.from([Buffer.from('x')]), dataType: 'json' });
  check(0, response.data.url === '/?that=in_path', response.data.url, '/?that=in_path');
});

cases['test/options.data.test.ts > options.data.test.ts > should POST with data and auto using application/x-www-form-urlencoded'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, { method: 'POST', data: { sql: 'SELECT * from table', data: '哈哈' }, dataType: 'json' });
  check(0, response.data.method === 'POST', response.data.method, 'POST');
  check(1, response.data.headers['content-type'] === 'application/x-www-form-urlencoded;charset=UTF-8', response.data.headers['content-type'], 'form-urlencoded');
  check(2, response.data.requestBody.sql === 'SELECT * from table' && response.data.requestBody.data === '哈哈', response.data.requestBody.sql, 'SELECT * from table');
});

cases['test/options.data.test.ts > options.data.test.ts > should PUT with data and auto using application/x-www-form-urlencoded'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, { method: 'PUT', data: { sql: 'SELECT * from table', data: '哈哈 PUT' }, dataType: 'json' });
  check(0, response.data.method === 'PUT', response.data.method, 'PUT');
  check(1, response.data.requestBody.__raw__ === 'sql=SELECT+*+from+table&data=%E5%93%88%E5%93%88+PUT', response.data.requestBody.__raw__, 'raw-form');
  check(2, response.data.requestBody.sql === 'SELECT * from table' && response.data.requestBody.data === '哈哈 PUT', response.data.requestBody.data, '哈哈 PUT');
});

cases['test/options.data.test.ts > options.data.test.ts > should PATCH with data and auto using application/x-www-form-urlencoded'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, { method: 'PATCH', data: { sql: 'SELECT * from table', data: '哈哈 PATCH' }, dataType: 'json' });
  check(0, response.data.method === 'PATCH', response.data.method, 'PATCH');
  check(1, response.data.headers['content-type'] === 'application/x-www-form-urlencoded;charset=UTF-8' && response.data.requestBody.data === '哈哈 PATCH', response.data.requestBody.data, '哈哈 PATCH');
});

cases['test/options.data.test.ts > options.data.test.ts > should POST with application/x-www-form-urlencoded not support nested object'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, { method: 'POST', data: { sql: 'SELECT * from table', data: '哈哈 POST', foo: { bar: 'foo' } }, dataType: 'json' });
  check(0, response.data.method === 'POST' && response.data.requestBody.foo === '[object Object]', response.data.requestBody.foo, '[object Object]');
  check(1, response.data.requestBody.__raw__ === 'sql=SELECT+*+from+table&data=%E5%93%88%E5%93%88+POST&foo=%5Bobject+Object%5D', response.data.requestBody.__raw__, 'raw-form');
});

cases['test/options.data.test.ts > options.data.test.ts > should POST with application/x-www-form-urlencoded work on nestedQuerystring=true'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, {
    method: 'POST',
    data: { sql: 'SELECT * from table', data: '哈哈', foo: { bar: 'bar value', array: [1, 2, 3] } },
    nestedQuerystring: true,
    dataType: 'json',
    headers: { 'x-qs': 'true' },
  });
  check(0, response.data.method === 'POST' && response.data.requestBody.sql === 'SELECT * from table', response.data.requestBody.sql, 'SELECT * from table');
  check(1, response.data.requestBody.foo && response.data.requestBody.foo.bar === 'bar value', response.data.requestBody.foo && response.data.requestBody.foo.bar, 'bar value');
  check(2, JSON.stringify(response.data.requestBody.foo.array) === JSON.stringify(['1', '2', '3']), JSON.stringify(response.data.requestBody.foo.array), '["1","2","3"]');
  check(3, response.data.requestBody.__raw__ === 'sql=SELECT%20%2A%20from%20table&data=%E5%93%88%E5%93%88&foo%5Bbar%5D=bar%20value&foo%5Barray%5D%5B0%5D=1&foo%5Barray%5D%5B1%5D=2&foo%5Barray%5D%5B2%5D=3', response.data.requestBody.__raw__, 'qs-raw');
});

cases['test/options.data.test.ts > options.data.test.ts > should PUT with data and contentType = json'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, { method: 'PUT', data: { sql: 'SELECT * from table', data: '哈哈 PUT', foo: { bar: 'bar value' } }, contentType: 'json', dataType: 'json' });
  check(0, response.data.method === 'PUT' && response.data.headers['content-type'] === 'application/json', response.data.headers['content-type'], 'application/json');
  check(1, response.data.headers['content-length'] === '75', response.data.headers['content-length'], '75');
  check(2, response.data.requestBody.foo.bar === 'bar value' && response.data.requestBody.data === '哈哈 PUT', response.data.requestBody.foo.bar, 'bar value');
});

cases['test/options.data.test.ts > options.data.test.ts > should PUT with data and contentType = application/json'] = dataCase(async (u, url, check) => {
  const response = await u.request(url, { method: 'PUT', data: { sql: 'SELECT * from table', data: '哈哈 PUT' }, contentType: 'application/json', dataType: 'json' });
  check(0, response.data.method === 'PUT' && response.data.headers['content-type'] === 'application/json', response.data.headers['content-type'], 'application/json');
  check(1, response.data.headers['content-length'] === '49', response.data.headers['content-length'], '49');
  check(2, response.data.requestBody.sql === 'SELECT * from table', response.data.requestBody.sql, 'SELECT * from table');
});

cases['test/options.data.test.ts > options.data.test.ts > should auto convert data to json string with charset'] = dataCase(async (u, url, check) => {
  const now = new Date();
  const response = await u.request(url, { method: 'post', data: { foo: 'bar', n1: 1, now }, headers: { 'Content-Type': 'application/json; charset=utf-8' }, dataType: 'json' });
  check(0, response.data.method === 'POST' && response.data.requestBody.foo === 'bar' && response.data.requestBody.n1 === 1, response.data.requestBody.n1, 1);
  check(1, response.data.requestBody.now === now.toISOString(), response.data.requestBody.now, now.toISOString());
  check(2, response.data.headers['content-type'] === 'application/json; charset=utf-8', response.data.headers['content-type'], 'application/json; charset=utf-8');
});

cases['test/options.data.test.ts > options.data.test.ts > should auto convert data to json string with content-type=application/json'] = dataCase(async (u, url, check) => {
  const now = new Date();
  const response = await u.request(url, { method: 'post', data: { foo: 'bar', n1: 1, now }, headers: { 'content-type': 'application/json' }, dataType: 'json' });
  check(0, response.data.method === 'POST' && response.data.requestBody.foo === 'bar', response.data.requestBody.foo, 'bar');
  check(1, response.data.requestBody.now === now.toISOString(), response.data.requestBody.now, now.toISOString());
  check(2, response.data.headers['content-type'] === 'application/json', response.data.headers['content-type'], 'application/json');
});

cases['test/options.data.test.ts > options.data.test.ts > should keep data to string when content-type exists'] = dataCase(async (u, url, check) => {
  const now = new Date();
  const response = await u.request(url, { method: 'put', data: JSON.stringify({ foo: 'bar', n1: 1, now }), headers: { 'Content-Type': 'application/json; charset=utf-8' }, dataType: 'json' });
  check(0, response.data.method === 'PUT' && response.data.requestBody.foo === 'bar', response.data.requestBody.foo, 'bar');
  check(1, response.data.requestBody.now === now.toISOString() && response.data.headers['content-type'] === 'application/json; charset=utf-8', response.data.headers['content-type'], 'json-utf8');
});

cases['test/options.data.test.ts > options.data.test.ts > should keep data to buffer when content-type exists'] = dataCase(async (u, url, check) => {
  const now = new Date();
  const response = await u.request(url, { method: 'put', data: Buffer.from(JSON.stringify({ foo: 'bar', n1: 1, now })), headers: { 'Content-Type': 'application/json; charset=gbk' }, dataType: 'json' });
  check(0, response.data.method === 'PUT' && response.data.requestBody.foo === 'bar', response.data.requestBody.foo, 'bar');
  check(1, response.data.headers['content-type'] === 'application/json; charset=gbk', response.data.headers['content-type'], 'json-gbk');
});

cases['test/options.data.test.ts > options.data.test.ts > should keep data to readable when content-type exists'] = dataCase(async (u, url, check) => {
  const now = new Date();
  const readable = Readable.from([Buffer.from(JSON.stringify({ foo: 'bar', n1: 1, now }))]);
  const response = await u.request(url, { method: 'put', data: readable, headers: { 'Content-Type': 'application/json; charset=gbk' }, dataType: 'json' });
  check(0, response.data.method === 'PUT' && response.data.requestBody.foo === 'bar', response.data.requestBody.foo, 'bar');
  check(1, response.data.headers['transfer-encoding'] === 'chunked' && response.data.headers['content-type'] === 'application/json; charset=gbk', response.data.headers['transfer-encoding'], 'chunked');
});

cases['test/options.data.test.ts > options.data.test.ts > should keep data to readable and not set content-type'] = dataCase(async (u, url, check) => {
  const now = new Date();
  const readable = Readable.from([Buffer.from(JSON.stringify({ foo: 'bar', n1: 1, now }))]);
  const response = await u.request(url, { method: 'put', data: readable, dataType: 'json' });
  const body = typeof response.data.requestBody === 'string' ? JSON.parse(response.data.requestBody) : response.data.requestBody;
  check(0, response.data.method === 'PUT' && body.foo === 'bar', body.foo, 'bar');
  check(1, body.now === now.toISOString(), body.now, now.toISOString());
  check(2, !response.data.headers['content-type'] && response.data.headers['transfer-encoding'] === 'chunked', response.data.headers['content-type'], undefined);
});

// ── options.dataType.test.ts（11 条） ──
const dataTypeCase = dataCase;

cases['test/options.dataType.test.ts > options.dataType.test.ts > should dataType is buffer'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url);
  check(0, response.status === 200 && Buffer.isBuffer(response.data), Buffer.isBuffer(response.data), true);
  check(1, /^\{"method":"GET",/.test(response.data.toString()), response.data.toString().slice(0, 20), '{"method":"GET",');
  check(2, response.url === url && !response.redirected, response.url, url);
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should work with dataType = buffer'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url, { dataType: 'buffer' });
  check(0, response.status === 200 && Buffer.isBuffer(response.data), Buffer.isBuffer(response.data), true);
  check(1, /^\{"method":"GET",/.test(response.data.toString()), response.data.toString().slice(0, 20), '{"method":"GET",');
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should work with dataType = text'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url, { dataType: 'text' });
  check(0, typeof response.data === 'string' && /^\{"method":"GET",/.test(response.data), typeof response.data, 'string');
  check(1, response.headers['content-type'] === 'application/json' && !!response.headers.date, response.headers['content-type'], 'application/json');
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should work with dataType = html'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url, { dataType: 'html' });
  check(0, typeof response.data === 'string' && /^\{"method":"GET",/.test(response.data), typeof response.data, 'string');
  check(1, response.status === 200 && !!response.headers.date, response.status, 200);
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should work with dataType = json'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url, { dataType: 'json' });
  check(0, typeof response.data === 'object' && response.data.method === 'GET', typeof response.data, 'object');
  check(1, response.headers['content-type'] === 'application/json', response.headers['content-type'], 'application/json');
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should ignore json parse when response empty'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url + 'mock-bytes?size=0', { dataType: 'json' });
  check(0, response.status === 200 && response.data === null, response.data, null);
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should keep exists accept headers when dataType = json'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url, { dataType: 'json', headers: { accept: 'foo/json' } });
  check(0, response.status === 200 && response.data.headers.accept === 'foo/json', response.data.headers.accept, 'foo/json');
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should throw with dataType = json when response json format invaild'] = dataTypeCase(async (u, url, check) => {
  let err;
  try { await u.request(url + 'wrongjson', { dataType: 'json' }); } catch (e) { err = e; }
  check(0, !!err && err.name === 'JSONResponseFormatError', err && err.name, 'JSONResponseFormatError');
  check(1, !!err && /foo/.test(String(err.message)), err && err.message, 'body snippet');
  check(2, !!err && err.res.status === 200 && err.res.size === 9, err && err.res && err.res.size, 9);
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should work with dataType = text when response json format invaild'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url + 'wrongjson', { dataType: 'text' });
  check(0, response.status === 200 && response.data === '{"foo":""', response.data, '{"foo":""');
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should handle GET /wrongjson-gbk with dataType=json and data size > 1024'] = dataTypeCase(async (u, url, check) => {
  let err;
  try { await u.request(url + 'wrongjson-gbk', { dataType: 'json' }); } catch (e) { err = e; }
  check(0, !!err && err.name === 'JSONResponseFormatError', err && err.name, 'JSONResponseFormatError');
  check(1, !!err && /" \.\.\.skip\.\.\. "/.test(String(err.message)), err && String(err.message).slice(0, 40), 'skip marker');
  check(2, !!err && err.res.status === 200, err && err.res && err.res.status, 200);
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should work with dataType = stream'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url, { dataType: 'stream' });
  check(0, response.status === 200 && !!response.res, response.status, 200);
  const bytes = await readableToBytes(response.res);
  check(1, JSON.parse(bytes.toString()).method === 'GET', JSON.parse(bytes.toString()).method, 'GET');
});

cases['test/options.dataType.test.ts > options.dataType.test.ts > should work with streaming = true, alias to data = stream'] = dataTypeCase(async (u, url, check) => {
  const response = await u.request(url, { streaming: true });
  check(0, response.status === 200 && !!response.res, response.status, 200);
  const bytes = await readableToBytes(response.res);
  check(1, JSON.parse(bytes.toString()).method === 'GET', JSON.parse(bytes.toString()).method, 'GET');
});

// 48. test/options.digestAuth.test.ts
cases['test/options.digestAuth.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let response = await u.request(url + 'digestAuth', { digestAuth: 'user:pwd', dataType: 'json' });
    check(0, response.status === 200 && /Digest username="user", realm="testrealm@urllib.com", nonce="/.test(response.data.authorization), response.status, 200);
    check(1, /, uri="\/digestAuth",/.test(response.data.authorization), 'uri', '/digestAuth');

    response = await u.request(url + 'digestAuth/multi', { digestAuth: 'user:pwd', dataType: 'json' });
    check(2, response.status === 200 && /, uri="\/digestAuth\/multi",/.test(response.data.authorization), response.status, 200);

    response = await u.request(url + 'digestAuth', { digestAuth: 'invailduser:pwd', dataType: 'json' });
    check(3, response.status === 401 && response.data.error === 'authorization invaild', response.status, 401);

    response = await u.request(url + 'digestAuth2', { digestAuth: 'invailduser:pwd', dataType: 'json' });
    check(4, response.status === 401 && response.data.error === 'authorization invaild', response.status, 401);

    response = await u.request(url + 'digestAuth?t=123123', { dataType: 'json' });
    check(5, response.status === 401 && response.data.error === 'authorization required', response.status, 401);

    response = await u.request(url + 'digestAuth?t=123123', { digestAuth: 'user:pwd', dataType: 'json' });
    check(6, response.status === 200 && /, uri="\/digestAuth\?t=123123",/.test(response.data.authorization), response.status, 200);
  } finally {
    await closeServer();
  }
};

// 49. test/options.dispatcher.test.ts（外网 registry 部分属 degraded：仅保留本地代理链路）
cases['test/options.dispatcher.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  const proxy = await startProxyServer();
  const agents = [];
  try {
    const proxyAgent = new u.ProxyAgent(proxy.url);
    agents.push(proxyAgent);
    const response = await u.request(url + 'html', { dispatcher: proxyAgent, dataType: 'text', timing: true });
    check(0, response.status === 200 && response.data === '<h1>hello</h1>', response.data, '<h1>hello</h1>');
    check(1, !!(response.res && response.res.socket), !!(response.res && response.res.socket), true);
    check(2, proxy.server.listenerCount('request') > 0, proxy.server.listenerCount('request'), '>0');

    const agent = u.getGlobalDispatcher();
    const globalProxy = new u.ProxyAgent(proxy.url);
    agents.push(globalProxy);
    u.setGlobalDispatcher(globalProxy);
    const viaGlobal = await u.request(url + 'html', { dataType: 'text', timing: true });
    check(3, viaGlobal.status === 200 && viaGlobal.data === '<h1>hello</h1>', viaGlobal.status, 200);
    u.setGlobalDispatcher(agent);
  } finally {
    for (const a of agents) { try { await a.close(); } catch { /* ignore */ } }
    await proxy.closeServer();
    await closeServer();
  }
};

// 50. test/options.files.test.ts
cases['test/options.files.test.ts'] = async ({ check }) => {
  const u = await lib();
  const fixtures = tmpFixtureDir();
  const { url, closeServer } = await startServer();
  try {
    const jsFile = fixtures.file('index.js');
    const stat = fs.statSync(jsFile);
    let response = await u.request(url + 'multipart', { files: jsFile, dataType: 'json' });
    check(0, response.status === 200 && response.data.method === 'POST', response.data.method, 'POST');
    check(1, /^multipart\/form-data;/.test(response.data.headers['content-type']), response.data.headers['content-type'], 'multipart/form-data');
    check(2, response.data.files.file.filename === 'index.js' && response.data.files.file.mimeType === 'application/javascript' && response.data.files.file.size === stat.size, response.data.files.file.mimeType, 'application/javascript');

    let err;
    try { await u.request(url + 'multipart', { files: [fixtures.file('nope.js')], dataType: 'json' }); } catch (e) { err = e; }
    check(3, !!err && err.code === 'ENOENT' && err.res.status === -1, err && err.code, 'ENOENT');

    response = await u.request(url + 'multipart', { files: [jsFile, fixtures.file('package.json')], dataType: 'json' });
    check(4, response.data.files.file.filename === 'index.js' && response.data.files.file1.filename === 'package.json' && response.data.files.file1.mimeType === 'application/json', response.data.files.file1.mimeType, 'application/json');

    const txtStat = fs.statSync(fixtures.file('foo.txt'));
    response = await u.request(url + 'multipart', {
      files: { file: jsFile, 'foo.js': fixtures.file('foo.txt'), json: fixtures.file('package.json') },
      dataType: 'json',
    });
    check(5, response.data.files['foo.js'].filename === 'foo.txt' && response.data.files['foo.js'].size === txtStat.size, response.data.files['foo.js'].filename, 'foo.txt');

    response = await u.request(url + 'multipart', { files: { hello: Buffer.from('😄foo😭') }, dataType: 'json' });
    check(6, response.data.files.hello.filename === 'hello' && response.data.files.hello.size === 11 && response.data.files.hello.encoding === '7bit', response.data.files.hello.size, 11);

    response = await u.request(url + 'multipart', { files: fs.createReadStream(jsFile), dataType: 'json' });
    check(7, response.data.files.file.filename === 'index.js' && response.data.files.file.size === stat.size, response.data.files.file.filename, 'index.js');

    const selfBuf = fs.readFileSync(fixtures.file('options.files.test.ts'));
    response = await u.request(url + 'multipart', { files: selfBuf, dataType: 'json' });
    check(8, response.data.files.file.filename === 'bufferfile0' && response.data.files.file.size === selfBuf.length, response.data.files.file.filename, 'bufferfile0');

    const emojiFile = fixtures.file('😄foo😭.txt');
    const emojiStat = fs.statSync(emojiFile);
    response = await u.request(url + 'multipart', {
      method: 'HEAD',
      files: [fixtures.file('options.files.test.ts'), emojiFile],
      data: { hello: 'hello world，😄' },
      dataType: 'json',
    });
    check(9, response.data.files.file1.filename === '😄foo😭.txt' && response.data.files.file1.size === emojiStat.size, response.data.files.file1.filename, '😄foo😭.txt');
    check(10, response.data.form.hello === 'hello world，😄', response.data.form.hello, 'hello world，😄');

    response = await u.request(url + 'multipart', { files: { uploadfile: fixtures.file('options.files.test.ts'), foo: fs.createReadStream(fixtures.file('options.files.test.ts')) }, data: { foo: 'bar' }, dataType: 'json' });
    check(11, response.data.files.uploadfile.filename === 'options.files.test.ts' && response.data.form.foo === 'bar', response.data.form.foo, 'bar');

    const rawData = JSON.stringify({ a: 1 });
    response = await u.request(url + 'multipart', { files: { 'buffer.js': Buffer.from(rawData), 'readable.js': Readable.from([Buffer.from(rawData)]) }, data: { foo: 'bar' }, dataType: 'json' });
    check(12, response.data.files['readable.js'].filename === 'readable.js' && response.data.files['buffer.js'].mimeType === 'application/javascript' && response.data.files['buffer.js'].size === rawData.length, response.data.files['buffer.js'].mimeType, 'application/javascript');
  } finally {
    await closeServer();
    fixtures.cleanup();
  }
};

// 51. test/options.fixJSONCtlChars.test.ts
cases['test/options.fixJSONCtlChars.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let response = await u.request(url + 'json_with_controls_unicode', { dataType: 'json', fixJSONCtlChars: true });
    check(0, response.status === 200, response.status, 200);
    check(1, response.data.foo === '\b\f\n\r\tbar\u000e!1!\u0086!2!\u0000!3!\u001f!4!\\\!5!end\\\\', JSON.stringify(response.data.foo).slice(0, 30), 'fixed-ctl-chars');

    let err;
    try { await u.request(url + 'json_with_controls_unicode', { dataType: 'json' }); } catch (e) { err = e; }
    check(2, !!err && err.name === 'JSONResponseFormatError', err && err.name, 'JSONResponseFormatError');
    check(3, !!err && err.status === 200 && err.headers['x-method'] === 'GET', err && err.status, 200);

    response = await u.request(url + 'json_with_t', { dataType: 'json', fixJSONCtlChars: (str) => str.replace(/\t/g, '\\t') });
    check(4, response.status === 200 && response.data.foo === 'ba\tr\t\t', JSON.stringify(response.data.foo), JSON.stringify('ba\tr\t\t'));
  } finally {
    await closeServer();
  }
};

// 52. test/options.followRedirect.test.ts
cases['test/options.followRedirect.test.ts'] = async ({ check }) => {
  const u = await lib();
  const fixtures = tmpFixtureDir();
  const { url, closeServer } = await startServer();
  try {
    let response = await u.request(url + 'redirect', { followRedirect: true });
    check(0, response.res.statusCode === 200 && response.statusText === 'OK' && response.data.length > 100, response.res.statusCode, 200);
    check(1, response.url === url + 'redirect-to-url' && response.requestUrls.length === 2, response.url, url + 'redirect-to-url');

    const client = new u.HttpClient({ allowH2: true });
    response = await client.request(url + 'redirect', { followRedirect: true, writeStream: fs.createWriteStream(fixtures.file('redirect.out')) });
    check(2, response.res.statusCode === 200 && response.data === null && response.requestUrls.length === 2, response.res.statusCode, 200);
    await disposeClient(u, client);

    response = await u.request(url + 'redirect-deadlock', { dataType: 'text' });
    check(3, response.res.statusCode === 302 && response.url === url + 'redirect-deadlock' && response.requestUrls.length === 11, response.requestUrls.length, 11);
    check(4, response.data === 'Redirect to /redirect-deadlock', response.data, 'Redirect to /redirect-deadlock');

    response = await u.request(url + 'redirect-deadlock', { maxRedirects: 1, dataType: 'text' });
    check(5, response.requestUrls.length === 2, response.requestUrls.length, 2);

    response = await u.request(url + 'redirect-deadlock', { maxRedirects: 0, dataType: 'text' });
    check(6, response.requestUrls.length === 1, response.requestUrls.length, 1);

    response = await u.request(url + 'redirect-full', { followRedirect: true });
    check(7, response.redirected && response.url === url + 'redirect-full-to-url' && response.data.length > 100, response.redirected, true);

    response = await u.request(url + 'redirect-full-301', { followRedirect: true });
    check(8, response.res.statusCode === 200 && response.redirected && response.url === url + 'redirect-full-301-to-url', response.url, url + 'redirect-full-301-to-url');

    response = await u.request(url + 'redirect-full-301', { followRedirect: false, dataType: 'text' });
    check(9, response.res.statusCode === 301 && !response.redirected && response.url === url + 'redirect-full-301', response.res.statusCode, 301);
    check(10, response.res.headers.location === url + 'redirect-full-301-to-url' && response.res.socket.id > 0, response.res.headers.location, url + 'redirect-full-301-to-url');
  } finally {
    await closeServer();
    fixtures.cleanup();
  }
};

// 54. test/options.gzip.test.ts
cases['test/options.gzip.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url + 'gzip', { dataType: 'text', gzip: true });
    check(0, JSON.parse(r.headers['x-request-headers'])['accept-encoding'] === 'gzip, br' && /export async function startServer/.test(r.data), r.headers['content-encoding'], 'gzip');
    r = await u.request(url + 'gzip', { dataType: 'text', gzip: false });
    check(1, JSON.parse(r.headers['x-request-headers'])['accept-encoding'] === undefined && /export async function startServer/.test(r.data), r.headers['content-encoding'], 'gzip-no-ae');
    r = await u.request(url + '?content-encoding=gzip', { dataType: 'json', gzip: true });
    check(2, r.data.method === 'GET' && r.data.headers['accept-encoding'] === 'gzip, br', r.data.method, 'GET');
    r = await u.request(url + '?content-encoding=br', { dataType: 'json', gzip: true });
    check(3, r.headers['content-encoding'] === 'br' && r.data.headers['accept-encoding'] === 'gzip, br', r.headers['content-encoding'], 'br');
    r = await u.request(url + '?content-encoding=gzip', { dataType: 'json', gzip: true, compressed: false });
    check(4, JSON.parse(r.headers['x-request-headers'])['accept-encoding'] === undefined, r.headers['content-encoding'], 'compressed-off');
    r = await u.request(url + '?content-encoding=gzip', { dataType: 'json', gzip: false, compressed: true });
    check(5, r.data.headers['accept-encoding'] === 'gzip, br' && r.data.method === 'GET', r.data.headers['accept-encoding'], 'gzip, br');
  } finally {
    await closeServer();
  }
};

// 55. test/options.headers.test.ts
cases['test/options.headers.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url, { dataType: 'json', headers: { 'X-Upper-Case': 'orginal value' }, timeout: [] });
    check(0, r.status === 200 && r.headers['x-foo'] === 'bar', r.status, 200);
    check(1, r.data.headers['user-agent'] === u.USER_AGENT && r.data.headers.accept === 'application/json', r.data.headers.accept, 'application/json');
    check(2, r.data.headers['accept-encoding'] === undefined && r.data.headers.connection === 'keep-alive' && r.data.headers['x-upper-case'] === 'orginal value', r.data.headers['x-upper-case'], 'orginal value');

    r = await u.request(url, { headers: { 'Case-Key': 'case1', 'CASE-KEY': 'case2', 'lower-key': 'lower' }, dataType: 'json' });
    check(3, r.data.headers['case-key'] === 'case2' && r.data.headers['lower-key'] === 'lower', r.data.headers['case-key'], 'case2');
    check(4, r.data.headers['Case-key'] === undefined && r.data.headers['CASE-KEY'] === undefined, r.data.headers['CASE-KEY'], undefined);

    r = await u.request(url, { headers: { 'null-header': null, 'undefined-header': undefined }, dataType: 'json' });
    check(5, r.data.headers['null-header'] === '' && r.data.headers['undefined-header'] === undefined, r.data.headers['null-header'], '');
  } finally {
    await closeServer();
  }
};

// 56. test/options.method.test.ts
cases['test/options.method.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url, { dataType: 'json' });
    check(0, r.status === 200 && r.data.method === 'GET', r.data.method, 'GET');
    r = await u.request(url, { dataType: 'json', method: 'POST' });
    check(1, r.status === 200 && r.data.method === 'POST', r.data.method, 'POST');
  } finally {
    await closeServer();
  }
};

// 57. test/options.opaque.test.ts
cases['test/options.opaque.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url, { dataType: 'json', opaque: { traceId: 'some random id here' } });
    check(0, r.status === 200 && r.opaque.traceId === 'some random id here', r.opaque && r.opaque.traceId, 'some random id here');

    let err;
    try { await u.request(url + 'socket.end.error', { opaque: { traceId: 'some random id here' } }); } catch (e) { err = e; }
    check(1, !!err && err.name === 'HTTPParserError', err && err.name, 'HTTPParserError');
    check(2, !!err && err.res.status === 200, err && err.res && err.res.status, 200);
    check(3, !!err && err.opaque.traceId === 'some random id here', err && err.opaque && err.opaque.traceId, 'some random id here');
  } finally {
    await closeServer();
  }
};

// 58. test/options.reset.test.ts
cases['test/options.reset.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    const r = await u.request(url, { dataType: 'json', reset: true });
    check(0, r.status === 200, r.status, 200);
    check(1, r.data.headers.connection === 'close', r.data.headers.connection, 'close');
  } finally {
    await closeServer();
  }
};

// 59. test/options.retry.test.ts
cases['test/options.retry.test.ts'] = async ({ check }) => {
  const u = await lib();
  const fixtures = tmpFixtureDir();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url + 'mock-status?status=400', { dataType: 'text', retry: 2 });
    check(0, r.status === 400 && r.data === 'Mock status 400', r.status, 400);
    check(1, JSON.parse(r.headers['x-request-headers'])['x-urllib-retry'] === undefined, 'x-urllib-retry', undefined);

    r = await u.request(url + 'mock-status?status=500', { dataType: 'text', retry: 2, streaming: true });
    check(2, r.status === 500 && JSON.parse(r.headers['x-request-headers'])['x-urllib-retry'] === undefined, r.status, 500);
    await readableToBytes(r.res);

    r = await u.request(url + 'mock-status?status=500', { dataType: 'text', retry: 2 });
    check(3, JSON.parse(r.headers['x-request-headers'])['x-urllib-retry'] === '2/2', JSON.parse(r.headers['x-request-headers'])['x-urllib-retry'], '2/2');
    check(4, parseInt(r.headers['x-requests-persocket'], 10) >= 2, r.headers['x-requests-persocket'], '>=2');

    r = await u.request(url + 'mock-status?status=400', { dataType: 'text', retry: 2, isRetry: (resp) => resp.status === 400 });
    check(5, JSON.parse(r.headers['x-request-headers'])['x-urllib-retry'] === '2/2', JSON.parse(r.headers['x-request-headers'])['x-urllib-retry'], '2/2');

    const startTime = Date.now();
    r = await u.request(url + 'mock-status?status=500', { dataType: 'text', retry: 3, retryDelay: 110 });
    check(6, JSON.parse(r.headers['x-request-headers'])['x-urllib-retry'] === '3/3' && Date.now() - startTime >= 330, Date.now() - startTime, '>=330');

    const writeStream = fs.createWriteStream(fixtures.file('retry.out'));
    r = await u.request(url + 'mock-status?status=500', { dataType: 'text', retry: 2, writeStream });
    check(7, r.status === 500 && JSON.parse(r.headers['x-request-headers'])['x-urllib-retry'] === undefined, r.status, 500);
  } finally {
    await closeServer();
    fixtures.cleanup();
  }
};

// 60. test/options.signal.test.ts
cases['test/options.signal.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { EventEmitter } = require('node:events');
  const { url, closeServer } = await startServer();
  try {
    let err;
    try {
      const controller = new AbortController();
      const p = u.request(url + '?timeout=2000', { signal: controller.signal });
      await sleep(100);
      controller.abort();
      await p;
    } catch (e) { err = e; }
    check(0, !!err && err.name === 'AbortError' && err.code === 20, err && err.code, 20);
    check(1, !!err && err.message === 'This operation was aborted', err && err.message, 'This operation was aborted');

    let eeErr;
    try {
      const ee = new EventEmitter();
      const p = u.request(url + '?timeout=2000', { signal: ee });
      await sleep(100);
      ee.emit('abort');
      await p;
    } catch (e) { eeErr = e; }
    check(2, !!eeErr && eeErr.name === 'AbortError' && eeErr.code === 'UND_ERR_ABORTED', eeErr && eeErr.code, 'UND_ERR_ABORTED');
    check(3, !!eeErr && eeErr.message === 'Request aborted', eeErr && eeErr.message, 'Request aborted');
  } finally {
    await closeServer();
  }
};

// 61. test/options.socketErrorRetry.test.ts
cases['test/options.socketErrorRetry.test.ts'] = async ({ check }) => {
  const u = await lib();
  const fixtures = tmpFixtureDir();
  const { url, closeServer } = await startServer();
  try {
    let err;
    try { await u.request(url + 'error', { dataType: 'json' }); } catch (e) { err = e; }
    check(0, !!err && err.res.retries === 0 && err.res.socketErrorRetries === 1, err && err.res && err.res.socketErrorRetries, 1);

    const ok = await u.request(url + 'error-non-retry', { dataType: 'json' });
    check(1, ok.status === 200 && ok.res.socketErrorRetries === 1, ok.res.socketErrorRetries, 1);

    let streamErr;
    try { await u.request(url + 'error', { streaming: true }); } catch (e) { streamErr = e; }
    check(2, !!streamErr && streamErr.res.socketErrorRetries === 0, streamErr && streamErr.res && streamErr.res.socketErrorRetries, 0);

    const writeStream = fs.createWriteStream(fixtures.file('socket-retry.out'));
    let wsErr;
    try { await u.request(url + 'error', { writeStream }); } catch (e) { wsErr = e; }
    check(3, !!wsErr && wsErr.res.socketErrorRetries === 0, wsErr && wsErr.res && wsErr.res.socketErrorRetries, 0);
    try { writeStream.destroy(); } catch { /* ignore */ }

    let fileErr;
    try { await u.request(url + 'error', { files: fs.createReadStream(fixtures.file('index.js')) }); } catch (e) { fileErr = e; }
    check(4, !!fileErr && fileErr.res.socketErrorRetries === 0, fileErr && fileErr.res && fileErr.res.socketErrorRetries, 0);
  } finally {
    await closeServer();
    fixtures.cleanup();
  }
};

// 62. test/options.socketPath.test.ts（App 域 TMPDIR 路径，替代 /tmp 硬编码；外网 registry 片属 degraded）
cases['test/options.socketPath.test.ts'] = async ({ check }) => {
  const u = await lib();
  const s1 = await startUnixSocketServer();
  const s2 = await startUnixSocketServer();
  try {
    let result = await u.request(s1.url, { socketPath: s1.socketPath, contentType: 'json', dataType: 'json' });
    check(0, JSON.stringify(result.data) === JSON.stringify({ a: 1 }), JSON.stringify(result.data), '{"a":1}');
    result = await u.request(s1.url, { socketPath: s1.socketPath, contentType: 'json', dataType: 'json' });
    result = await u.request(s1.url, { socketPath: s1.socketPath, contentType: 'json', dataType: 'json' });
    check(1, JSON.stringify(result.data) === JSON.stringify({ a: 1 }) && result.res.socket.handledResponses > 1, result.res.socket.handledResponses, '>1');
    result = await u.request('http://unix/api/v1', { socketPath: s2.socketPath, contentType: 'json', dataType: 'json' });
    check(2, JSON.stringify(result.data) === JSON.stringify({ a: 1 }) && result.url === 'http://unix/api/v1', result.url, 'http://unix/api/v1');
  } finally {
    await s1.closeServer();
    await s2.closeServer();
  }
};

// 63. test/options.stream.test.ts
cases['test/options.stream.test.ts'] = async ({ check }) => {
  const u = await lib();
  const fixtures = tmpFixtureDir();
  const srcFile = fixtures.file('options.files.test.ts');
  const raw = fs.readFileSync(srcFile, 'utf-8');
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url, { method: 'post', dataType: 'json', stream: fs.createReadStream(srcFile) });
    check(0, r.status === 200 && r.data.method === 'POST' && r.data.requestBody === raw, r.data.method, 'POST');
    check(1, !r.data.headers['transfer-encoding'] || r.data.headers['transfer-encoding'] === 'chunked', r.data.headers['transfer-encoding'], 'chunked');

    let r2 = await u.request(url, { method: 'post', dataType: 'stream', stream: fs.createReadStream(srcFile) });
    check(2, r2.status === 200 && r2.res instanceof Readable, r2.status, 200);
    const r3 = await u.request(url + 'raw', { method: 'post', dataType: 'json', stream: r2.res });
    check(3, r3.status === 200 && r3.data.requestBody === raw, r3.data.requestBody && r3.data.requestBody.length, raw.length);

    const FormStream = require('formstream');
    const form = new FormStream();
    form.file('file', srcFile);
    form.field('hello', '你好 urllib 3');
    const rf = await u.request(url + 'multipart', { method: 'post', dataType: 'json', stream: form, headers: form.headers() });
    check(4, rf.status === 200 && rf.data.files.file.filename === 'options.files.test.ts' && rf.data.form.hello === '你好 urllib 3', rf.data.form.hello, '你好 urllib 3');

    const stream = fs.createReadStream(srcFile);
    let err;
    try { await u.request(url + 'block', { method: 'post', timeout: 100, stream }); } catch (e) { err = e; }
    check(5, !!err && err.name === 'HttpClientRequestTimeoutError' && stream.destroyed === true, err && err.name, 'HttpClientRequestTimeoutError');

    const badStream = fs.createReadStream(srcFile + '.not-exists');
    let streamError = false;
    badStream.on('error', () => { streamError = true; });
    let badErr;
    try { await u.request(url + 'block', { method: 'post', stream: badStream }); } catch (e) { badErr = e; }
    check(6, !!badErr && /no such file or directory/.test(String(badErr.message)) && badStream.destroyed === true && streamError === true, badErr && badErr.message, 'ENOENT');
  } finally {
    await closeServer();
    fixtures.cleanup();
  }
};

// 64. test/options.streaming.test.ts
cases['test/options.streaming.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url + 'streaming_testing', { streaming: true });
    check(0, r.status === 200 && r.data === null && r.res.status === 200, r.status, 200);
    const bytes = await readableToBytes(r.res);
    const data = JSON.parse(bytes.toString());
    check(1, data.method === 'GET' && data.url === '/streaming_testing' && data.requestBody === '', data.url, '/streaming_testing');

    r = await u.request(url + 'brotli', { streaming: true, compressed: true });
    check(2, r.headers['content-encoding'] === 'br' && JSON.parse(r.headers['x-request-headers'])['accept-encoding'] === 'gzip, br', r.headers['content-encoding'], 'br');
    const decoded = await readableToBytes(r.res);
    check(3, /export async function startServer/.test(decoded.toString()), decoded.length, 'payload');

    r = await u.request(url + 'brotli', { streaming: true });
    const rawBytes = await readableToBytes(r.res);
    check(4, JSON.parse(r.headers['x-request-headers'])['accept-encoding'] === undefined, r.headers['content-encoding'], 'raw-br');
    // 未压缩的流是原始 br 字节，需自行解压才能读回 payload
    const viaDecode = zlib.brotliDecompressSync(rawBytes);
    check(5, /export async function startServer/.test(viaDecode.toString()), viaDecode.length, 'payload-after-decode');

    const custom = await u.request(url + 'mock-bytes?size=1024', { customResponse: true });
    check(6, custom.status === 200 && custom.data === null, custom.status, 200);
    const cb = await readableToBytes(custom.res);
    check(7, cb.length === 1024, cb.length, 1024);

    // 大流：上游 1GB，设备侧缩到 8MB（字节数一致性断言保留）
    const big = await u.request(url + 'mock-bytes?size=' + 8 * 1024 * 1024, { streaming: true });
    const bigBytes = await readableToBytes(big.res);
    check(8, bigBytes.length === 8 * 1024 * 1024, bigBytes.length, 8 * 1024 * 1024);
  } finally {
    await closeServer();
  }
};

// 65. test/options.timeout.test.ts
cases['test/options.timeout.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  const h2 = await startEchoTlsServer(true);
  try {
    let err;
    try { await u.request(url + '?timeout=2000', { timeout: 10 }); } catch (e) { err = e; }
    check(0, !!err && err.name === 'HttpClientRequestTimeoutError' && err.message === 'Request timeout for 10 ms', err && err.name, 'HttpClientRequestTimeoutError');
    check(1, !!(err && err.cause && err.cause.name === 'HeadersTimeoutError' && err.cause.code === 'UND_ERR_HEADERS_TIMEOUT'), err && err.cause && err.cause.code, 'UND_ERR_HEADERS_TIMEOUT');
    check(2, !!err && err.res.status === -1 && typeof err.res.rt === 'number' && err.res.rt > 10, err && err.res && err.res.rt, '>10');

    let strErr;
    try { await u.request(url + '?timeout=2000', { timeout: '10' }); } catch (e) { strErr = e; }
    check(3, !!strErr && strErr.name === 'HttpClientRequestTimeoutError' && strErr.message === 'Request timeout for 10 ms', strErr && strErr.message, 'Request timeout for 10 ms');

    let bodyErr;
    try { await u.request(url + 'mock-bytes?timeout=2000', { timeout: 100 }); } catch (e) { bodyErr = e; }
    check(4, !!bodyErr && bodyErr.name === 'HttpClientRequestTimeoutError' && bodyErr.res.status === 200, bodyErr && bodyErr.res && bodyErr.res.status, 200);
    check(5, !bodyErr || !bodyErr.cause || (bodyErr.cause.name === 'BodyTimeoutError'), bodyErr && bodyErr.cause && bodyErr.cause.name, 'BodyTimeoutError');

    let blockErr;
    try { await u.request(url + 'block', { timeout: 100 }); } catch (e) { blockErr = e; }
    check(6, !!blockErr && blockErr.name === 'HttpClientRequestTimeoutError' && blockErr.res.status === -1 && !!blockErr.headers, blockErr && blockErr.status, -1);

    // H2 headers timeout
    const client = new u.HttpClient({ allowH2: true, connect: { rejectUnauthorized: false } });
    const server = http2.createSecureServer({ key: PEM.private, cert: PEM.cert });
    server.on('clientError', () => {});
    server.on('stream', () => { /* 不响应 */ });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const h2url = 'https://127.0.0.1:' + server.address().port;
    let h2Err;
    try { await client.request(h2url, { timeout: 10 }); } catch (e) { h2Err = e; }
    check(7, !!(h2Err && h2Err.name === 'HttpClientRequestTimeoutError' && h2Err.cause && h2Err.cause.code === 'UND_ERR_HEADERS_TIMEOUT'), h2Err && h2Err.cause && h2Err.cause.name, 'HeadersTimeoutError');
    try { await disposeClient(u, client); } catch { /* ignore */ }
    await new Promise((resolve) => server.close(resolve));
  } finally {
    await closeServer();
    await h2.close();
  }
};

// 66. test/options.timing.test.ts
cases['test/options.timing.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url + '?content-encoding=gzip', { dataType: 'json', timing: true });
    const t1 = r.res.timing;
    check(0, r.status === 200 && t1.waiting > 0 && t1.connected > 0 && t1.queuing > 0, JSON.stringify(t1), 'connected>0');
    check(1, t1.dnslookup >= 0 && t1.dnslookup <= t1.connected && t1.requestHeadersSent > 0 && t1.requestSent > 0, t1.dnslookup + '/' + t1.connected, 'dnslookup<=connected');
    check(2, t1.contentDownload > 0 && t1.contentDownload > t1.waiting && t1.contentDownload <= r.res.rt && r.res.socket.handledResponses === 1, r.res.socket.handledResponses, 1);

    await sleep(1);
    r = await u.request(url + '?content-encoding=gzip', { dataType: 'json', timing: true });
    const t2 = r.res.timing;
    check(3, t2.connected === 0 && t2.dnslookup === 0 && r.res.socket.handledResponses === 2, t2.connected + '/' + r.res.socket.handledResponses, '0/2');

    r = await u.request(url + '?content-encoding=gzip', { dataType: 'json', timing: false });
    check(4, r.res.timing.waiting === 0 && r.res.timing.contentDownload === 0 && r.res.rt > 0, r.res.timing.waiting, 0);

    r = await u.request(url + '?content-encoding=gzip', { dataType: 'json' });
    check(5, r.res.timing.waiting > 0 && r.res.timing.contentDownload > 0 && r.res.rt > 0, r.res.timing.contentDownload, '>0');
  } finally {
    await closeServer();
  }
};

// 67. test/options.type.test.ts
cases['test/options.type.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url, { dataType: 'json', type: 'GET' });
    check(0, r.status === 200 && r.data.method === 'GET', r.data.method, 'GET');
    r = await u.request(url, { dataType: 'json', type: 'POST' });
    check(1, r.status === 200 && r.data.method === 'POST', r.data.method, 'POST');
  } finally {
    await closeServer();
  }
};

// 68. test/options.writeStream.test.ts
cases['test/options.writeStream.test.ts'] = async ({ check }) => {
  const u = await lib();
  const fixtures = tmpFixtureDir();
  const { url, closeServer } = await startServer();
  try {
    let tmp = fixtures.file('ws1.bin');
    let r = await u.request(url + 'mock-bytes?size=1024123', { writeStream: fs.createWriteStream(tmp) });
    check(0, r.status === 200 && r.data === null && r.headers['content-length'] === '1024123', r.headers['content-length'], '1024123');
    check(1, fs.statSync(tmp).size === 1024123, fs.statSync(tmp).size, 1024123);

    tmp = fixtures.file('ws2.txt');
    r = await u.request(url + 'gzip', { writeStream: fs.createWriteStream(tmp), compressed: true });
    check(2, /export async function startServer/.test(fs.readFileSync(tmp, 'utf-8')), r.status, 200);

    tmp = fixtures.file('ws3.gz');
    r = await u.request(url + 'gzip', { writeStream: fs.createWriteStream(tmp), compressed: false });
    check(3, /export async function startServer/.test(zlib.gunzipSync(fs.readFileSync(tmp)).toString()), r.status, 200);

    const ws = fs.createWriteStream(fixtures.file('ws4.bin'));
    let err;
    try { await u.request(url + 'mock-bytes?size=1024&timeout=2000', { writeStream: ws, timeout: 100 }); } catch (e) { err = e; }
    check(4, !!err && err.name === 'HttpClientRequestTimeoutError' && ws.destroyed === true, err && err.name, 'HttpClientRequestTimeoutError');

    const badDir = path.join(fixtures.dir, 'not-exists-dir', 'foo.txt');
    const badWs = fs.createWriteStream(badDir);
    let wsError = false;
    badWs.on('error', () => { wsError = true; });
    let badErr;
    try { await u.request(url, { writeStream: badWs }); } catch (e) { badErr = e; }
    check(5, !!badErr && (badErr.message === 'writeStream is destroyed' || /^ENOENT|ERR_STREAM_UNABLE_TO_PIPE$/.test(String(badErr.code))), badErr && badErr.code, 'ENOENT');

    const wsErr = fs.createWriteStream(fixtures.file('ws5.bin'));
    let serverErr;
    try { await u.request(url + 'error', { writeStream: wsErr }); } catch (e) { serverErr = e; }
    check(6, !!serverErr && serverErr.name === 'SocketError' && serverErr.code === 'UND_ERR_SOCKET' && serverErr.message === 'other side closed', serverErr && serverErr.code, 'UND_ERR_SOCKET');
  } finally {
    await closeServer();
    fixtures.cleanup();
  }
};

// 69. test/response-charset-gbk.test.ts（上游 gbk 两条 it.skip，活跃用例为 wrong charset）
cases['test/response-charset-gbk.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    const r = await u.request(url + 'errorcharset', { dataType: 'text' });
    check(0, r.status === 200, r.status, 200);
    check(1, r.headers['content-type'] === 'text/plain;charset=notfound', r.headers['content-type'], 'text/plain;charset=notfound');
    check(2, r.data === '你好', r.data, '你好');
  } finally {
    await closeServer();
  }
};

// 70. test/urllib.options.allowH2.test.ts（外网 registry 属 degraded：本地 H2 服务器覆盖同一协商语义）
cases['test/urllib.options.allowH2.test.ts'] = async ({ check }) => {
  const u = await lib();
  const h2s = await startEchoTlsServer(true);
  try {
    let r = await u.request(h2s.url, { allowH2: true, rejectUnauthorized: false, dataType: 'text' });
    check(0, r.status === 200 && r.data === 'hello http/2.0!', r.data, 'hello http/2.0!');
    r = await u.curl(h2s.url, { allowH2: true, rejectUnauthorized: false, dataType: 'text' });
    check(1, r.status === 200 && r.data === 'hello http/2.0!', r.data, 'hello http/2.0!');
    const off = await u.request(h2s.url, { allowH2: false, rejectUnauthorized: false, dataType: 'text' });
    check(2, off.data === 'hello http/1.1!', off.data, 'hello http/1.1!');
  } finally {
    await h2s.close();
  }
};

// 71. test/urllib.options.rejectUnauthorized-false.test.ts
cases['test/urllib.options.rejectUnauthorized-false.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer({ https: true });
  const h2 = await h2StreamServer();
  try {
    for (const method of ['request', 'curl']) {
      const r = await u[method](url, { rejectUnauthorized: false, dataType: 'json' });
      check(method === 'request' ? 0 : 1, r.status === 200 && r.data.method === 'GET', r.status, 200);
    }
    let secureErr;
    try { await u.request(url, { rejectUnauthorized: true }); } catch (e) { secureErr = e; }
    check(2, !!secureErr && secureErr.code === 'DEPTH_ZERO_SELF_SIGNED_CERT', secureErr && secureErr.code, 'DEPTH_ZERO_SELF_SIGNED_CERT');

    const client = new u.HttpClient({ allowH2: true, connect: { rejectUnauthorized: false } });
    let r = await client.request(h2.url, {});
    check(3, r.status === 200 && r.data.toString() === 'hello h2!', r.data.toString(), 'hello h2!');
    r = await u.request(h2.url, { rejectUnauthorized: false, allowH2: true, dataType: 'text' });
    check(4, r.status === 200 && r.data === 'hello h2!', r.data, 'hello h2!');
    await disposeClient(u, client);
  } finally {
    await closeServer();
    await h2.close();
  }
};

// 72. test/user-agent.test.ts
cases['test/user-agent.test.ts'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let r = await u.request(url, { dataType: 'json' });
    check(0, r.status === 200 && /^node-urllib\/\d+\.\d+\.\d+ Node\.js\//.test(r.data.headers['user-agent']), r.data.headers['user-agent'], 'node-urllib/x Node.js/');
    r = await u.request(url, { dataType: 'json', headers: { 'user-agent': '' } });
    check(1, r.data.headers['user-agent'] === undefined, r.data.headers['user-agent'], undefined);
    r = await u.request(url, { dataType: 'json', headers: { 'user-agent': 'mock agent' } });
    check(2, r.data.headers['user-agent'] === 'mock agent', r.data.headers['user-agent'], 'mock agent');
    r = await u.request(url, { dataType: 'json', headers: { 'User-Agent': 'mock agent upper case' } });
    check(3, r.data.headers['user-agent'] === 'mock agent upper case', r.data.headers['user-agent'], 'mock agent upper case');
  } finally {
    await closeServer();
  }
};

// 73. test/utils.test.ts（globalId 内部工具：经上游 src/utils.js 的同名导出验证）
cases['test/utils.test.ts'] = async ({ check }) => {
  // globalId 未在 dist 公共导出面；用公共行为（请求 id 单调递增）做等价断言，
  // 并直接触达 HttpClient 内部自增 id 语义（request/response 事件 requestId）。
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    const client = new u.HttpClient();
    const ids = [];
    client.on('request', (info) => ids.push(info.requestId));
    await client.request(url, { dataType: 'json' });
    await client.request(url, { dataType: 'json' });
    await client.request(url, { dataType: 'json' });
    check(0, ids.length === 3, ids.length, 3);
    check(1, ids[1] === ids[0] + 1 && ids[2] === ids[1] + 1, ids.join(','), 'strictly-increasing');
    check(2, ids.every((id) => Number.isInteger(id) && id > 0), ids.join(','), '>0');
    await disposeClient(u, client);
  } finally {
    await closeServer();
  }
};

// 74. baseline-formdata（补写用例，source=generated；FormData 公共导出 multipart roundtrip）
cases['baseline-formdata'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    const fieldValue = 'hello-世界-' + randomUUID();
    const fileContent = Buffer.from('formdata-file-content-abcdef');
    const form = new u.FormData();
    form.append('hello', fieldValue);
    form.append('upfile', new Blob([fileContent], { type: 'text/plain' }), 'file.bin');
    const response = await u.request(url + 'multipart', { method: 'POST', content: form, dataType: 'json' });
    check(0, response.status === 200 && /^multipart\/form-data/.test(response.data.headers['content-type']) && /boundary=/.test(response.data.headers['content-type']), response.data.headers['content-type'], 'multipart/form-data; boundary=');
    check(1, response.data.form.hello === fieldValue, response.data.form.hello, fieldValue);
    check(2, response.data.files.upfile.filename === 'file.bin' && response.data.files.upfile.size === fileContent.length, response.data.files.upfile && response.data.files.upfile.filename, 'file.bin');
  } finally {
    await closeServer();
  }
};

// ── test/index.test.ts（5 条逐测） ──
cases['test/index.test.ts > index.test.ts > getDefaultHttpClient()'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    const response = await u.getDefaultHttpClient().request(url + 'html');
    check(0, response.status === 200 && response.statusText === 'OK' && response.res.statusMessage === 'OK', response.status, 200);
    check(1, response.headers['content-type'] === 'text/html' && !!response.headers.date, response.headers['content-type'], 'text/html');
    check(2, response.url === url + 'html' && !response.redirected, response.url, url + 'html');
    check(3, u.getDefaultHttpClient() === u.getDefaultHttpClient(), true, true);
  } finally {
    await closeServer();
  }
};

cases['test/index.test.ts > index.test.ts > urllib.request()'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  try {
    let response = await u.request(url + 'html');
    check(0, response.status === 200 && response.headers['content-type'] === 'text/html' && !!response.headers.date, response.status, 200);
    check(1, response.url === url + 'html' && !response.redirected, response.url, url + 'html');

    response = await u.request(url + 'set-one-cookie');
    check(2, response.headers['set-cookie'] === 'foo=bar; path=/' && typeof response.headers['set-cookie'] === 'string', response.headers['set-cookie'], 'foo=bar; path=/');
    response = await u.request(url + 'set-two-cookie');
    check(3, Array.isArray(response.headers['set-cookie']) && response.headers['set-cookie'].length === 2, JSON.stringify(response.headers['set-cookie']), '["foo=bar; path=/","hello=world; path=/"]');

    response = await u.request(url + 'hello/json', { dataType: 'json' });
    check(4, response.status === 200, response.status, 200);

    response = await u.curl(url + 'html');
    check(5, response.status === 200 && response.url === url + 'html', response.url, url + 'html');

    response = await u.request(new URL(url + 'html'));
    check(6, response.status === 200 && response.url === url + 'html', response.status, 200);

    const urlObject = require('node:url').parse(url + 'html?abc=123');
    response = await u.request(urlObject, { data: { foo: 'bar' } });
    check(7, response.status === 200 && response.url === url + 'html?abc=123&foo=bar', response.url, url + 'html?abc=123&foo=bar');

    let socketErr;
    try { await u.request(url + 'socket.end.error'); } catch (e) { socketErr = e; }
    check(8, !!socketErr && socketErr.name === 'HTTPParserError' && socketErr.res.status === 200, socketErr && socketErr.name, 'HTTPParserError');
  } finally {
    await closeServer();
  }
};

cases['test/index.test.ts > index.test.ts > default export'] = async ({ check }) => {
  const u = await lib();
  check(0, /urllib\//.test(u.USER_AGENT), u.USER_AGENT, 'urllib/x');
  check(1, !!u.default && typeof u.default.request === 'function', typeof (u.default && u.default.request), 'function');
  check(2, !!u.default && u.default.USER_AGENT === u.USER_AGENT, u.default && u.default.USER_AGENT, u.USER_AGENT);
};

cases['test/index.test.ts > index.test.ts > Mocking request'] = async ({ check }) => {
  const u = await lib();
  const { url, closeServer } = await startServer();
  const globalAgent = u.getGlobalDispatcher();
  const mockAgent = new u.MockAgent();
  u.setGlobalDispatcher(mockAgent);
  try {
    check(0, typeof u.getGlobalDispatcher === 'function' && !!u.getGlobalDispatcher(), !!u.getGlobalDispatcher(), true);
    const origin = url.slice(0, -1);
    const mockPool = mockAgent.get(origin);
    mockPool.intercept({ path: '/foo', method: 'POST' }).reply(400, { message: 'mock 400 bad request' });
    mockPool.intercept({ path: '/bar', method: 'GET', query: { q: '1' } }).reply(200, { message: 'mock bar with q=1' });
    mockPool.intercept({ path: '/bar', method: 'GET', query: { q: '2' } }).reply(200, { message: 'mock bar with q=2' });
    mockPool.intercept({ path: /\.tgz$/, method: 'GET' }).reply(400, { message: 'mock 400 bad request on tgz' });

    let response = await u.request(url + 'foo', { method: 'POST', dataType: 'json' });
    check(1, response.status === 400 && response.data.message === 'mock 400 bad request', response.status, 400);
    response = await u.request(url + 'bar?q=1', { method: 'GET', dataType: 'json' });
    check(2, response.status === 200 && response.data.message === 'mock bar with q=1', response.data.message, 'mock bar with q=1');
    response = await u.request(url + 'bar?q=2', { method: 'GET', dataType: 'json' });
    check(3, response.status === 200 && response.data.message === 'mock bar with q=2', response.data.message, 'mock bar with q=2');
    response = await u.request(url + 'download/foo.tgz', { method: 'GET', dataType: 'json' });
    check(4, response.status === 400 && response.data.message === 'mock 400 bad request on tgz', response.status, 400);
    response = await u.request(url + 'download/bar.tgz', { method: 'GET', dataType: 'json' });
    check(5, response.status === 200 && response.data.method === 'GET', response.status, 200);
    mockAgent.assertNoPendingInterceptors();
    check(6, true, 'no-pending-interceptors', 'no-pending-interceptors');
  } finally {
    u.setGlobalDispatcher(globalAgent);
    try { await mockAgent.close(); } catch { /* ignore */ }
    await closeServer();
  }
};

module.exports = cases;
