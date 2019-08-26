const bodyParser = require('body-parser')
const clamd = require('clamdjs')
const config = require('./config')
const express = require('express')
const fs = require('fs')
const helmet = require('helmet')
const logger = require('./logger')
const nunjucks = require('nunjucks')
const RateLimit = require('express-rate-limit')
const readline = require('readline')
const safe = express()

process.on('uncaughtException', error => {
  logger.error(error, { prefix: 'Uncaught Exception: ' })
})
process.on('unhandledRejection', error => {
  logger.error(error, { prefix: 'Unhandled Rejection (Promise): ' })
})

const utils = require('./controllers/utilsController')

const album = require('./routes/album')
const api = require('./routes/api')
const nojs = require('./routes/nojs')

const db = require('knex')(config.database)
require('./database/db.js')(db)

// Check and create missing directories
fs.existsSync('./pages/custom') || fs.mkdirSync('./pages/custom')
fs.existsSync(`./${config.logsFolder}`) || fs.mkdirSync(`./${config.logsFolder}`)
fs.existsSync(`./${config.uploads.folder}`) || fs.mkdirSync(`./${config.uploads.folder}`)
fs.existsSync(`./${config.uploads.folder}/chunks`) || fs.mkdirSync(`./${config.uploads.folder}/chunks`)
fs.existsSync(`./${config.uploads.folder}/thumbs`) || fs.mkdirSync(`./${config.uploads.folder}/thumbs`)
fs.existsSync(`./${config.uploads.folder}/zips`) || fs.mkdirSync(`./${config.uploads.folder}/zips`)

safe.use(helmet())
if (config.trustProxy) safe.set('trust proxy', 1)

// https://mozilla.github.io/nunjucks/api.html#configure
nunjucks.configure('views', {
  autoescape: true,
  express: safe,
  noCache: process.env.NODE_ENV === 'development'
})
safe.set('view engine', 'njk')
safe.enable('view cache')

// Configure rate limits
if (Array.isArray(config.rateLimits) && config.rateLimits.length)
  for (const rateLimit of config.rateLimits) {
    const limiter = new RateLimit(rateLimit.config)
    for (const route of rateLimit.routes)
      safe.use(route, limiter)
  }

safe.use(bodyParser.urlencoded({ extended: true }))
safe.use(bodyParser.json())

// safe.fiery.me-exclusive cache control
if (config.cacheControl) {
  const cacheControls = {
    // max-age: 30 days
    default: 'public, max-age=2592000, must-revalidate, proxy-revalidate, immutable, stale-while-revalidate=86400, stale-if-error=604800',
    // s-max-age: 30 days (only cache in proxy server)
    // Obviously we have to purge proxy cache on every update
    proxyOnly: 'public, s-max-age=2592000, proxy-revalidate, immutable, stale-while-revalidate=86400, stale-if-error=604800',
    disable: 'no-store'
  }

  safe.use('/', (req, res, next) => {
    res.set('Cache-Control', cacheControls.proxyOnly)
    next()
  })

  const setHeaders = res => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', cacheControls.default)
  }

  if (config.serveFilesWithNode)
    safe.use('/', express.static(config.uploads.folder, { setHeaders }))

  safe.use('/', express.static('./public', { setHeaders }))

  // Do NOT cache these dynamic routes
  safe.use(['/a', '/api', '/nojs'], (req, res, next) => {
    res.set('Cache-Control', cacheControls.disable)
    next()
  })

  // Cache these in proxy server though
  safe.use(['/api/check'], (req, res, next) => {
    res.set('Cache-Control', cacheControls.proxyOnly)
    next()
  })

  // Cache album ZIPs
  safe.use(['/api/album/zip'], (req, res, next) => {
    setHeaders(res)
    next()
  })
} else {
  if (config.serveFilesWithNode)
    safe.use('/', express.static(config.uploads.folder))

  safe.use('/', express.static('./public'))
}

safe.use('/', album)
safe.use('/', nojs)
safe.use('/api', api)

if (!Array.isArray(config.pages) || !config.pages.length) {
  logger.error('Config does not haves any frontend pages enabled')
  process.exit(1)
}

for (const page of config.pages)
  if (fs.existsSync(`./pages/custom/${page}.html`)) {
    safe.get(`/${page}`, (req, res, next) => res.sendFile(`${page}.html`, {
      root: './pages/custom/'
    }))
  } else if (page === 'home') {
    safe.get('/', (req, res, next) => res.render('home', {
      maxSize: config.uploads.maxSize,
      urlMaxSize: config.uploads.urlMaxSize,
      urlDisclaimerMessage: config.uploads.urlDisclaimerMessage,
      urlExtensionsFilterMode: config.uploads.urlExtensionsFilterMode,
      urlExtensionsFilter: config.uploads.urlExtensionsFilter,
      gitHash: safe.get('git-hash')
    }))
  } else if (page === 'faq') {
    const fileLength = config.uploads.fileLength
    safe.get('/faq', (req, res, next) => res.render('faq', {
      whitelist: config.extensionsFilterMode === 'whitelist',
      extensionsFilter: config.extensionsFilter,
      fileLength,
      tooShort: (fileLength.max - fileLength.default) > (fileLength.default - fileLength.min),
      noJsMaxSize: parseInt(config.cloudflare.noJsMaxSize) < parseInt(config.uploads.maxSize),
      chunkSize: config.uploads.chunkSize
    }))
  } else {
    safe.get(`/${page}`, (req, res, next) => res.render(page))
  }

safe.use((req, res, next) => {
  res.status(404).sendFile(config.errorPages[404], { root: config.errorPages.rootDir })
})
safe.use((error, req, res, next) => {
  logger.error(error)
  res.status(500).sendFile(config.errorPages[500], { root: config.errorPages.rootDir })
})

const start = async () => {
  if (config.showGitHash) {
    const gitHash = await new Promise((resolve, reject) => {
      require('child_process').exec('git rev-parse HEAD', (error, stdout) => {
        if (error) return reject(error)
        resolve(stdout.replace(/\n$/, ''))
      })
    }).catch(logger.error)
    if (!gitHash) return
    logger.log(`Git commit: ${gitHash}`)
    safe.set('git-hash', gitHash)
  }

  const scan = config.uploads.scan
  if (scan && scan.enabled) {
    const createScanner = async () => {
      try {
        if (!scan.ip || !scan.port)
          throw new Error('clamd IP or port is missing')

        const version = await clamd.version(scan.ip, scan.port)
        logger.log(`${scan.ip}:${scan.port} ${version}`)

        const scanner = clamd.createScanner(scan.ip, scan.port)
        safe.set('clam-scanner', scanner)
        return true
      } catch (error) {
        logger.error(`[ClamAV]: ${error.toString()}`)
        return false
      }
    }
    if (!await createScanner()) return process.exit(1)
  }

  if (config.uploads.cacheFileIdentifiers) {
    // Cache tree of uploads directory
    const setSize = await new Promise((resolve, reject) => {
      const uploadsDir = `./${config.uploads.folder}`
      fs.readdir(uploadsDir, (error, names) => {
        if (error) return reject(error)
        const set = new Set()
        names.forEach(name => set.add(name.split('.')[0]))
        safe.set('uploads-set', set)
        resolve(set.size)
      })
    }).catch(error => logger.error(error.toString()))
    if (!setSize) return process.exit(1)
    logger.log(`Cached ${setSize} identifiers in uploads directory`)
  }

  safe.listen(config.port, async () => {
    logger.log(`lolisafe started on port ${config.port}`)

    // safe.fiery.me-exclusive cache control
    if (config.cacheControl) {
      logger.log('Cache control enabled')
      const routes = config.pages.concat(['api/check'])
      const results = await utils.purgeCloudflareCache(routes)
      let errored = false
      let succeeded = 0
      for (const result of results) {
        if (result.errors.length) {
          if (!errored) errored = true
          result.errors.forEach(error => logger.log(`[CF]: ${error}`))
          continue
        }
        succeeded += result.files.length
      }
      if (!errored)
        logger.log(`Purged ${succeeded} Cloudflare's cache`)
    }

    // NODE_ENV=development yarn start
    if (process.env.NODE_ENV === 'development') {
      // Add readline interface to allow evaluating arbitrary JavaScript from console
      readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: ''
      }).on('line', line => {
        try {
          if (line === '.exit') process.exit(0)
          // eslint-disable-next-line no-eval
          logger.log(eval(line))
        } catch (error) {
          logger.error(error.toString())
        }
      }).on('SIGINT', () => {
        process.exit(0)
      })
      logger.log('Development mode enabled (disabled Nunjucks caching & enabled readline interface)')
    }
  })
}

start()
