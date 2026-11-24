/**
 * dsh-pdf-study — Host half of the PDF study sidebar.
 *
 * The browser half cannot rasterize a PDF on its own, so this plugin owns the
 * one Host capability that needs a real PDF engine: it turns a page of an
 * uploaded PDF into a PNG through the Host Office kit (PDFium) and serves the
 * bytes over two same-origin HTTP routes.
 *
 *   POST <route>/open            body: PDF bytes -> { id, pages, width, height, dpi }
 *   GET  <route>/page/<id>/<n>.png            -> image/png for one 1-based page
 *   POST <route>/close           body: { id } -> { closed: true }
 *
 * The routes are loopback-only and same-origin for writes: a page that a
 * browser opened from another site cannot read a document, and a peer on the
 * network cannot reach these routes at all. Uploaded documents live in memory
 * only, are capped, and are evicted least-recently-used; the browser half
 * releases a document when the user imports another one or closes the tab.
 *
 * Nothing here writes to the workspace, the Session log, or the network.
 */
import { createHash, randomUUID } from 'node:crypto'

/** Default route prefix; the client half uses the same literal. */
const DEFAULT_ROUTE = '/dsh-pdf-study'
/** Raster resolution used for page images; small text stays legible at 150. */
const DEFAULT_DPI = 150
/** Largest accepted PDF upload. */
const MAX_BODY_BYTES = 64 * 1024 * 1024
/** Documents kept at once; the oldest is evicted beyond this. */
const MAX_DOCUMENTS = 6
/** Total uploaded PDF bytes kept in memory. */
const MAX_TOTAL_BYTES = 192 * 1024 * 1024
/** Rendered PNG bytes cached across all documents. */
const PAGE_CACHE_BYTES = 96 * 1024 * 1024
/** Bounds one render request; one page at a time, generous pixel caps. */
const RENDER_LIMITS = Object.freeze({
  maxImages: 1,
  maxPixels: 8_388_608,
  maxDimension: 8192,
  maxBytes: 32 * 1024 * 1024,
})

/** One request-scoped failure carrying the HTTP status its route answers. */
class StudyError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'StudyError'
    this.status = status
    this.code = code
  }
}

/** Host services this plugin reads; the Office kit is optional, so it is resolved lazily. */
export const inject = ['webServer']

/**
 * Register the PDF study routes for the lifetime of this plugin row.
 * @param ctx - Host context carrying the web server and, usually, the Office kit.
 * @param config - optional row configuration: `route`, `dpi`.
 */
export function apply(ctx, config) {
  const settings = readSettings(config)
  const documents = new Map()

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: settings.route,
    handler: (request, response) => {
      handleRoute(request, response).catch(error => fail(response, error))
    },
  }), 'dsh-pdf-study: routes')

  ctx.effect(() => () => {
    documents.clear()
  }, 'dsh-pdf-study: documents')

  /** Read the requested route path below the prefix. */
  function subPath(pathname) {
    return pathname.slice(settings.route.length)
  }

  /**
   * Dispatch one request. Every branch answers or throws; nothing escapes.
   * @param request - raw HTTP request owned by this handler.
   * @param response - response this handler completes.
   */
  async function handleRoute(request, response) {
    if (!isLoopback(request.socket?.remoteAddress)) {
      throw new StudyError(403, 'forbidden', 'This endpoint only answers local requests.')
    }
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(settings.route)) {
      throw new StudyError(404, 'not-found', 'Unknown route.')
    }
    const path = subPath(url.pathname)

    if (path === '/open' && request.method === 'POST') {
      requireSameOrigin(request)
      await openDocument(request, response)
      return
    }
    if (path === '/close' && request.method === 'POST') {
      requireSameOrigin(request)
      await closeDocument(request, response)
      return
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const match = /^\/page\/([0-9a-f-]{8,64})\/(\d{1,6})\.png$/u.exec(path)
      if (match !== null) {
        await servePage(response, match[1], Number(match[2]), request.method === 'HEAD')
        return
      }
    }
    throw new StudyError(404, 'not-found', 'Unknown route.')
  }

  /**
   * Admit an uploaded PDF, render page 1, and describe the document.
   * @param request - request whose body is the PDF.
   * @param response - response carrying the document descriptor.
   */
  async function openDocument(request, response) {
    const bytes = await readBody(request)
    if (bytes.length < 5 || bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
      throw new StudyError(400, 'not-pdf', 'The upload is not a PDF file.')
    }
    const name = decodeFileName(request.headers['x-pdf-study-name'])
    const id = randomUUID().replaceAll('-', '')
    const doc = {
      id,
      name,
      bytes,
      version: createHash('sha256').update(bytes).digest('hex'),
      dpi: settings.dpi,
      pages: new Map(),
      pending: new Map(),
      cachedBytes: 0,
      pageCount: 0,
      width: 0,
      height: 0,
      touchedAt: Date.now(),
    }
    documents.set(id, doc)
    evictDocuments()

    let first
    try {
      first = await renderPage(doc, 1)
    } catch (error) {
      documents.delete(id)
      throw error
    }
    doc.pageCount = first.pageCount
    doc.width = first.width
    doc.height = first.height
    sendJson(response, 200, {
      id: doc.id,
      name: doc.name,
      pages: doc.pageCount,
      width: doc.width,
      height: doc.height,
      dpi: doc.dpi,
    })
  }

  /**
   * Forget one uploaded document.
   * @param request - request whose body is `{ id }`.
   * @param response - response confirming the removal.
   */
  async function closeDocument(request, response) {
    const bytes = await readBody(request, 64 * 1024)
    let id
    try {
      id = JSON.parse(bytes.toString('utf8'))?.id
    } catch {
      throw new StudyError(400, 'bad-request', 'The close request is not JSON.')
    }
    if (typeof id !== 'string') throw new StudyError(400, 'bad-request', 'The close request needs a document id.')
    documents.delete(id)
    sendJson(response, 200, { closed: true })
  }

  /**
   * Answer one page as a PNG, from the document cache when it is already rendered.
   * @param response - response carrying the image.
   * @param id - uploaded document identity.
   * @param page - one-based page number.
   * @param head - whether this is a HEAD request, whose body is empty.
   */
  async function servePage(response, id, page, head) {
    const doc = documents.get(id)
    if (doc === undefined) throw new StudyError(404, 'no-document', 'That document is no longer open in this session.')
    if (!Number.isSafeInteger(page) || page < 1) throw new StudyError(400, 'bad-page', 'Page numbers start at 1.')
    doc.touchedAt = Date.now()
    let rendered
    try {
      rendered = await renderPage(doc, page)
    } catch (error) {
      if (error instanceof StudyError) throw error
      throw new StudyError(422, 'page-failed', `Page ${page} could not be rendered: ${messageOf(error)}`)
    }
    doc.pageCount = rendered.pageCount
    const { png, width, height } = rendered
    response.writeHead(200, {
      'content-type': 'image/png',
      'content-length': head ? 0 : png.length,
      'cache-control': 'private, max-age=3600',
      'x-pdf-study-page': String(page),
      'x-pdf-study-pages': String(doc.pageCount),
      'x-pdf-study-width': String(width),
      'x-pdf-study-height': String(height),
    })
    response.end(head ? undefined : png)
  }

  /**
   * Render one page through the Office kit, reusing the cache and joining a render in flight.
   * @param doc - the open document.
   * @param page - one-based page number.
   * @returns PNG bytes, pixel size, and the document page count.
   */
  function renderPage(doc, page) {
    const cached = doc.pages.get(page)
    if (cached !== undefined) return Promise.resolve(cached)
    const running = doc.pending.get(page)
    if (running !== undefined) return running
    const task = renderUncached(doc, page).finally(() => {
      doc.pending.delete(page)
    })
    doc.pending.set(page, task)
    return task
  }

  /** Perform one real render and add its result to the document cache. */
  async function renderUncached(doc, page) {
    const kit = ctx.get('officeKit')
    if (kit === undefined) {
      throw new StudyError(503, 'renderer-unavailable', 'No Office rendering service is mounted in this profile.')
    }
    let result
    try {
      result = await kit.renderImages({
        extension: 'pdf',
        source: {
          key: doc.id,
          version: doc.version,
          bytes: doc.bytes.length,
          async read(signal, maxBytes) {
            signal?.throwIfAborted?.()
            if (doc.bytes.length > maxBytes) {
              const tooLarge = new Error('The source exceeds the reserved byte capacity.')
              tooLarge.code = 'input-too-large'
              throw tooLarge
            }
            return { bytes: new Uint8Array(doc.bytes), version: doc.version }
          },
        },
        pages: [page],
        dpi: doc.dpi,
        ...RENDER_LIMITS,
      })
    } catch (error) {
      throw new StudyError(classifyStatus(error), 'render-failed', messageOf(error))
    }
    const image = result.images[0]
    if (image === undefined) {
      throw new StudyError(422, 'empty-render', `The renderer returned no image for page ${page}.`)
    }
    const rendered = {
      png: Buffer.from(image.png.buffer, image.png.byteOffset, image.png.byteLength),
      width: image.width,
      height: image.height,
      pageCount: result.pageCount,
    }
    if (page <= result.pageCount) {
      doc.pages.set(page, rendered)
      doc.cachedBytes += rendered.png.length
      while (doc.cachedBytes > PAGE_CACHE_BYTES && doc.pages.size > 1) {
        const [oldestPage, oldest] = doc.pages.entries().next().value
        doc.pages.delete(oldestPage)
        doc.cachedBytes -= oldest.png.length
      }
    }
    return rendered
  }

  /** Drop least-recently-touched documents beyond the count and byte caps. */
  function evictDocuments() {
    let total = 0
    for (const doc of documents.values()) total += doc.bytes.length
    while (documents.size > MAX_DOCUMENTS || total > MAX_TOTAL_BYTES) {
      let oldest
      for (const doc of documents.values()) {
        if (oldest === undefined || doc.touchedAt < oldest.touchedAt) oldest = doc
      }
      if (oldest === undefined) return
      documents.delete(oldest.id)
      total -= oldest.bytes.length
    }
  }

  /** Read a bounded request body into one buffer. */
  async function readBody(request, limit = MAX_BODY_BYTES) {
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > limit) {
        throw new StudyError(413, 'too-large', `The upload exceeds the ${Math.round(limit / 1_048_576)} MB limit.`)
      }
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
}

/**
 * Normalize the row configuration.
 * @param config - raw row configuration, or undefined.
 * @returns the route prefix and raster resolution this activation uses.
 */
function readSettings(config) {
  const route = typeof config?.route === 'string' && /^\/[A-Za-z0-9._~-]+$/u.test(config.route)
    ? config.route
    : DEFAULT_ROUTE
  const dpi = Number.isInteger(config?.dpi) && config.dpi >= 72 && config.dpi <= 300 ? config.dpi : DEFAULT_DPI
  return { route, dpi }
}

/** Decode a `x-pdf-study-name` header into a display name. */
function decodeFileName(header) {
  if (typeof header !== 'string' || header === '') return 'document.pdf'
  let name = header
  try {
    name = decodeURIComponent(header)
  } catch {
    // A malformed header keeps its literal text; it is display-only.
  }
  return name.slice(0, 180)
}

/** Whether a peer address belongs to this machine. */
function isLoopback(address) {
  if (typeof address !== 'string') return false
  return address === '::1'
    || address.startsWith('127.')
    || address.startsWith('::ffff:127.')
    || address.startsWith('::ffff:7f')
}

/** Refuse a write the browser did not send from this same origin. */
function requireSameOrigin(request) {
  const origin = request.headers.origin
  if (origin === undefined) return
  let host
  try {
    host = new URL(origin).host
  } catch {
    throw new StudyError(403, 'cross-origin', 'Cross-origin writes are refused.')
  }
  if (host !== request.headers.host) {
    throw new StudyError(403, 'cross-origin', 'Cross-origin writes are refused.')
  }
}

/** Map a renderer failure onto an HTTP status. */
function classifyStatus(error) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  if (code === 'invalid-request' || code === 'invalid-document') return 400
  if (code === 'output-too-large' || code === 'input-too-large') return 413
  if (code === 'busy') return 429
  if (code === 'unavailable') return 503
  return 422
}

/** Readable text for any thrown value. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Answer JSON. */
function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  response.end(body)
}

/** Answer a failure as JSON without leaking Host paths. */
function fail(response, error) {
  if (response.headersSent) {
    response.destroy()
    return
  }
  const status = error instanceof StudyError ? error.status : 500
  const code = error instanceof StudyError ? error.code : 'internal'
  if (status >= 500) {
    try {
      console.warn('[dsh-pdf-study]', code, messageOf(error))
    } catch {
      // Logging must never mask the response.
    }
  }
  sendJson(response, status, { error: { code, message: messageOf(error) } })
}
