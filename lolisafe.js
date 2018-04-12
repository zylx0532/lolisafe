const config = require('./config.js')
const api = require('./routes/api.js')
const album = require('./routes/album.js')
const nojs = require('./routes/nojs.js')
const express = require('express')
const helmet = require('helmet')
const bodyParser = require('body-parser')
const RateLimit = require('express-rate-limit')
const db = require('knex')(config.database)
const fs = require('fs')
const exphbs = require('express-handlebars')
const safe = express()

require('./database/db.js')(db)

fs.existsSync('./pages/custom') || fs.mkdirSync('./pages/custom')
fs.existsSync('./' + config.logsFolder) || fs.mkdirSync('./' + config.logsFolder)
fs.existsSync('./' + config.uploads.folder) || fs.mkdirSync('./' + config.uploads.folder)
fs.existsSync('./' + config.uploads.folder + '/chunks') || fs.mkdirSync('./' + config.uploads.folder + '/chunks')
fs.existsSync('./' + config.uploads.folder + '/thumbs') || fs.mkdirSync('./' + config.uploads.folder + '/thumbs')
fs.existsSync('./' + config.uploads.folder + '/zips') || fs.mkdirSync('./' + config.uploads.folder + '/zips')

safe.use(helmet())
safe.set('trust proxy', 1)

safe.engine('handlebars', exphbs({ defaultLayout: 'main' }))
safe.set('view engine', 'handlebars')
safe.enable('view cache')

const limiter = new RateLimit({ windowMs: 5000, max: 2 })
safe.use('/api/login/', limiter)
safe.use('/api/register/', limiter)

safe.use(bodyParser.urlencoded({ extended: true }))
safe.use(bodyParser.json())

const setHeaders = (res, path, stat) => {
  if (/\.(3gp|gif|jpg|jpeg|png|ico|wmv|avi|asf|asx|mpg|mpeg|mp4|pls|mp3|mid|wav|swf|flv|exe|zip|tar|rar|gz|tgz|bz2|uha|7z|doc|docx|xls|xlsx|pdf|iso|js|css|eot|svg|ttf|woff|woff2)$/.test(path)) {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', 'public, max-age=2592000, must-revalidate, proxy-revalidate, immutable, stale-while-revalidate=86400, stale-if-error=604800') // max-age: 30 days
  }
}

if (config.serveFilesWithNode) {
  safe.use('/', express.static(config.uploads.folder, { setHeaders }))
}

safe.use('/', express.static('./public', { setHeaders }))
safe.use('/', album)
safe.use('/', nojs)
safe.use('/api', api)

for (const page of config.pages) {
  let root = './pages/'
  if (fs.existsSync(`./pages/custom/${page}.html`)) {
    root = './pages/custom/'
  }
  if (page === 'home') {
    safe.get('/', (req, res, next) => res.sendFile(`${page}.html`, { root }))
  } else {
    safe.get(`/${page}`, (req, res, next) => res.sendFile(`${page}.html`, { root }))
  }
}

// NOTE: Uses fiery.me branch of https://github.com/BobbyWibowo/HttpErrorPages
safe.use((req, res, next) => {
  res.status(404).sendFile('HTTP404.html', { root: '../HttpErrorPages/dist/' })
})
safe.use((error, req, res, next) => {
  console.error(error)
  res.status(500).sendFile('HTTP505.html', { root: '../HttpErrorPages/dist/' })
})

safe.listen(config.port, () => console.log(`lolisafe started on port ${config.port}`))

process.on('uncaughtException', error => {
  console.error(`Uncaught Exception:\n${error.stack}`)
})

process.on('unhandledRejection', error => {
  console.error(`Unhandled Rejection (Promise):\n${error.stack}`)
})
