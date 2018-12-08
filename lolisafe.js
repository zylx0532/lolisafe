const config = require('./config')
const api = require('./routes/api')
const album = require('./routes/album')
const nojs = require('./routes/nojs')
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
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error)
})
process.on('unhandledRejection', error => {
  console.error('Unhandled Rejection (Promise):', error)
})

require('./database/db.js')(db)

fs.existsSync('./pages/custom') || fs.mkdirSync('./pages/custom')
fs.existsSync(`./${config.logsFolder}`) || fs.mkdirSync(`./${config.logsFolder}`)
fs.existsSync(`./${config.uploads.folder}`) || fs.mkdirSync(`./${config.uploads.folder}`)
fs.existsSync(`./${config.uploads.folder}/chunks`) || fs.mkdirSync(`./${config.uploads.folder}/chunks`)
fs.existsSync(`./${config.uploads.folder}/thumbs`) || fs.mkdirSync(`./${config.uploads.folder}/thumbs`)
fs.existsSync(`./${config.uploads.folder}/zips`) || fs.mkdirSync(`./${config.uploads.folder}/zips`)

safe.use(helmet())
safe.set('trust proxy', 1)

// https://mozilla.github.io/nunjucks/api.html#configure
nunjucks.configure('views', {
  autoescape: true,
  express: safe,
  // watch: true, // will this be fine in production?
  noCache: process.env.DEV === '1'
})
safe.set('view engine', 'njk')
safe.enable('view cache')

const limiter = new RateLimit({ windowMs: 5000, max: 2 })
safe.use('/api/login/', limiter)
safe.use('/api/register/', limiter)

safe.use(bodyParser.urlencoded({ extended: true }))
safe.use(bodyParser.json())

const setHeaders = res => {
  // Apply Cache-Control to all static files
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Cache-Control', 'public, max-age=2592000, must-revalidate, proxy-revalidate, immutable, stale-while-revalidate=86400, stale-if-error=604800') // max-age: 30 days
}

if (config.serveFilesWithNode) {
  safe.use('/', express.static(config.uploads.folder, { setHeaders }))
}

safe.use('/', express.static('./public', { setHeaders }))
safe.use('/', album)
safe.use('/', nojs)
safe.use('/api', api)

for (const page of config.pages) {
  if (fs.existsSync(`./pages/custom/${page}.html`)) {
    safe.get(`/${page}`, (req, res, next) => res.sendFile(`${page}.html`, {
      root: './pages/custom/'
    }))
  } else if (page === 'home') {
    safe.get('/', (req, res, next) => res.render('home', {
      maxSize: config.uploads.maxSize,
      urlMaxSize: config.uploads.urlMaxSize,
      gitHash: safe.get('git-hash'),
      urlDuckDuckGoProxy: config.uploads.urlDuckDuckGoProxy
    }))
  } else if (page === 'faq') {
    const fileLength = config.uploads.fileLength
    safe.get('/faq', (req, res, next) => res.render('faq', {
      filterBlacklist: config.filterBlacklist,
      extensionsFilter: config.extensionsFilter,
      fileLength,
      tooShort: (fileLength.max - fileLength.default) > (fileLength.default - fileLength.min),
      noJsMaxSize: parseInt(config.cloudflare.noJsMaxSize) < parseInt(config.uploads.maxSize),
      chunkSize: config.uploads.chunkSize
    }))
  } else {
    safe.get(`/${page}`, (req, res, next) => res.render(page))
  }
}

safe.use((req, res, next) => {
  res.status(404).sendFile(config.errorPages[404], { root: config.errorPages.rootDir })
})
safe.use((error, req, res, next) => {
  console.error(error)
  res.status(500).sendFile(config.errorPages[500], { root: config.errorPages.rootDir })
})

const start = async () => {
  if (config.uploads.urlDuckDuckGoProxy) {
    console.warn('Warning: DuckDuckGo\'s proxy is no longer supported as it stops reporting Content-Length header.')
    return process.exit(1)
  }

  if (config.showGitHash) {
    const gitHash = await new Promise((resolve, reject) => {
      require('child_process').exec('git rev-parse HEAD', (error, stdout) => {
        if (error) { return reject(error) }
        resolve(stdout.replace(/\n$/, ''))
      })
    }).catch(console.error)
    if (!gitHash) { return }
    console.log(`Git commit: ${gitHash}`)
    safe.set('git-hash', gitHash)
  }

  if (config.uploads.scan && config.uploads.scan.enabled) {
    const created = await new Promise(async (resolve, reject) => {
      if (!config.uploads.scan.ip || !config.uploads.scan.port) {
        return reject(new Error('clamd IP or port is missing'))
      }
      const ping = await clamd.ping(config.uploads.scan.ip, config.uploads.scan.port).catch(reject)
      if (!ping) {
        return reject(new Error('Could not ping clamd'))
      }
      const version = await clamd.version(config.uploads.scan.ip, config.uploads.scan.port).catch(reject)
      console.log(`${config.uploads.scan.ip}:${config.uploads.scan.port} ${version}`)
      const scanner = clamd.createScanner(config.uploads.scan.ip, config.uploads.scan.port)
      safe.set('clam-scanner', scanner)
      return resolve(true)
    }).catch(error => console.error(error.toString()))
    if (!created) { return process.exit(1) }
  }

  if (config.uploads.cacheFileIdentifiers) {
    // Cache tree of uploads directory
    process.stdout.write('Caching identifiers in uploads directory ...')
    const setSize = await new Promise((resolve, reject) => {
      const uploadsDir = `./${config.uploads.folder}`
      fs.readdir(uploadsDir, (error, names) => {
        if (error) { return reject(error) }
        const set = new Set()
        names.forEach(name => set.add(name.split('.')[0]))
        safe.set('uploads-set', set)
        resolve(set.size)
      })
    }).catch(error => console.error(error.toString()))
    if (!setSize) { return process.exit(1) }
    process.stdout.write(` ${setSize} OK!\n`)
  }

  safe.listen(config.port, () => {
    console.log(`lolisafe started on port ${config.port}`)
    if (process.env.DEV === '1') {
      // DEV=1 yarn start
      console.log('lolisafe is in development mode, nunjucks caching disabled')
    }

    // Add readline interface to allow evaluating arbitrary JavaScript from console
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    }).on('line', line => {
      try {
        if (line === '.exit') { process.exit(0) }
        // eslint-disable-next-line no-eval
        process.stdout.write(`${require('util').inspect(eval(line), { depth: 0 })}\n`)
      } catch (error) {
        console.error(error.toString())
      }
    }).on('SIGINT', () => {
      process.exit(0)
    })
  })
}

start()
