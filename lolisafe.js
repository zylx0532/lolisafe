const config = require('./config')
const api = require('./routes/api')
const album = require('./routes/album')
const nojs = require('./routes/nojs')
const utils = require('./controllers/utilsController')
const express = require('express')
const bodyParser = require('body-parser')
const clamd = require('clamdjs')
const db = require('knex')(config.database)
const fs = require('fs')
const helmet = require('helmet')
const nunjucks = require('nunjucks')
const RateLimit = require('express-rate-limit')
const readline = require('readline')
const safe = express()

// It appears to be best to catch these before doing anything else
// Probably before require() too, especially require('knex')(db), but nevermind
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error)
})
process.on('unhandledRejection', error => {
  console.error('Unhandled Rejection (Promise):', error)
})

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

const limiter = new RateLimit({ windowMs: 5000, max: 2 })
safe.use('/api/login/', limiter)
safe.use('/api/register/', limiter)

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
  console.error('config.pages is not an array or is an empty array. This won\'t do!')
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
  console.error(error)
  res.status(500).sendFile(config.errorPages[500], { root: config.errorPages.rootDir })
})

const start = async () => {
  if (config.showGitHash) {
    const gitHash = await new Promise((resolve, reject) => {
      require('child_process').exec('git rev-parse HEAD', (error, stdout) => {
        if (error) return reject(error)
        resolve(stdout.replace(/\n$/, ''))
      })
    }).catch(console.error)
    if (!gitHash) return
    console.log(`Git commit: ${gitHash}`)
    safe.set('git-hash', gitHash)
  }

  const scan = config.uploads.scan
  if (scan && scan.enabled) {
    const created = await new Promise(async (resolve, reject) => {
      if (!scan.ip || !scan.port)
        return reject(new Error('clamd IP or port is missing'))

      const ping = await clamd.ping(scan.ip, scan.port).catch(reject)
      if (!ping)
        return reject(new Error('Could not ping clamd'))

      const version = await clamd.version(scan.ip, scan.port).catch(reject)
      console.log(`${scan.ip}:${scan.port} ${version}`)

      const scanner = clamd.createScanner(scan.ip, scan.port)
      safe.set('clam-scanner', scanner)
      return resolve(true)
    }).catch(error => console.error(error.toString()))
    if (!created) return process.exit(1)
  }

  if (config.uploads.cacheFileIdentifiers) {
    // Cache tree of uploads directory
    process.stdout.write('Caching identifiers in uploads directory ...')
    const setSize = await new Promise((resolve, reject) => {
      const uploadsDir = `./${config.uploads.folder}`
      fs.readdir(uploadsDir, (error, names) => {
        if (error) return reject(error)
        const set = new Set()
        names.forEach(name => set.add(name.split('.')[0]))
        safe.set('uploads-set', set)
        resolve(set.size)
      })
    }).catch(error => console.error(error.toString()))
    if (!setSize) return process.exit(1)
    process.stdout.write(` ${setSize} OK!\n`)
  }

  safe.listen(config.port, async () => {
    console.log(`lolisafe started on port ${config.port}`)

    // safe.fiery.me-exclusive cache control
    if (config.cacheControl) {
      process.stdout.write('Cache control enabled. Purging Cloudflare\'s cache ...')
      const routes = config.pages.concat(['api/check'])
      const results = await utils.purgeCloudflareCache(routes)
      let errored = false
      let succeeded = 0
      for (const result of results) {
        if (result.errors.length) {
          if (!errored) {
            errored = true
            process.stdout.write(' ERROR!\n')
          }
          result.errors.forEach(error => console.log(`CF: ${error}`))
          continue
        }
        succeeded += result.files.length
      }
      if (!errored)
        process.stdout.write(` ${succeeded} OK!\n`)
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
          process.stdout.write(`${require('util').inspect(eval(line), { depth: 0 })}\n`)
        } catch (error) {
          console.error(error.toString())
        }
      }).on('SIGINT', () => {
        process.exit(0)
      })
      console.log('Development mode enabled (disabled nunjucks caching & enabled readline interface)')
    }
  })
}

start()
