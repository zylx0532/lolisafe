const config = require('./../config')
const db = require('knex')(config.database)
const fs = require('fs')
const path = require('path')
const randomstring = require('randomstring')
const utils = require('./utilsController')
const Zip = require('jszip')

const albumsController = {}

// Let's default it to only 1 try (for missing config key)
const maxTries = config.uploads.maxTries || 1
const homeDomain = config.homeDomain || config.domain
const uploadsDir = path.join(__dirname, '..', config.uploads.folder)
const zipsDir = path.join(uploadsDir, 'zips')
const maxTotalSize = config.uploads.generateZips.maxTotalSize
const maxTotalSizeBytes = parseInt(maxTotalSize) * 1000000

albumsController.list = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  let fields = ['id', 'name']
  if (req.params.sidebar === undefined) {
    fields = fields.concat(fields, ['timestamp', 'identifier', 'editedAt', 'download', 'public'])
  }

  const albums = await db.table('albums')
    .select(fields)
    .where({
      enabled: 1,
      userid: user.id
    })

  if (req.params.sidebar !== undefined) {
    return res.json({ success: true, albums })
  }

  const ids = []
  for (const album of albums) {
    album.date = utils.getPrettyDate(new Date(album.timestamp * 1000))
    album.download = album.download !== 0
    album.public = album.public !== 0

    ids.push(album.id)
  }

  const files = await db.table('files')
    .whereIn('albumid', ids)
    .select('albumid')
  const albumsCount = {}

  for (const id of ids) { albumsCount[id] = 0 }
  for (const file of files) { albumsCount[file.albumid] += 1 }
  for (const album of albums) { album.files = albumsCount[album.id] }

  return res.json({ success: true, albums, homeDomain })
}

albumsController.create = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  const name = req.body.name
  if (name === undefined || name === '') {
    return res.json({ success: false, description: 'No album name specified.' })
  }

  const album = await db.table('albums')
    .where({
      name,
      enabled: 1,
      userid: user.id
    })
    .first()

  if (album) {
    return res.json({ success: false, description: 'There\'s already an album with that name.' })
  }

  const identifier = await albumsController.getUniqueRandomName()
    .catch(error => {
      res.json({ success: false, description: error.toString() })
    })
  if (!identifier) { return }

  await db.table('albums').insert({
    name,
    enabled: 1,
    userid: user.id,
    identifier,
    timestamp: Math.floor(Date.now() / 1000),
    editedAt: 0,
    zipGeneratedAt: 0,
    download: 1,
    public: 1
  })

  return res.json({ success: true })
}

albumsController.getUniqueRandomName = () => {
  return new Promise((resolve, reject) => {
    const select = i => {
      const identifier = randomstring.generate(config.uploads.albumIdentifierLength)
      db.table('albums')
        .where('identifier', identifier)
        .then(rows => {
          if (!rows || !rows.length) { return resolve(identifier) }
          console.log(`An album with identifier ${identifier} already exists (${++i}/${maxTries}).`)
          if (i < maxTries) { return select(i) }
          // eslint-disable-next-line prefer-promise-reject-errors
          return reject('Sorry, we could not allocate a unique random identifier. Try again?')
        })
    }
    // Get us a unique random identifier
    select(0)
  })
}

albumsController.delete = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  const id = req.body.id
  const purge = req.body.purge
  if (id === undefined || id === '') {
    return res.json({ success: false, description: 'No album specified.' })
  }

  let ids = []
  let failedids = []
  if (purge) {
    const files = await db.table('files')
      .where({
        albumid: id,
        userid: user.id
      })

    ids = files.map(file => file.id)
    failedids = await utils.bulkDeleteFilesByIds(ids, user)

    if (failedids.length === ids.length) {
      return res.json({ success: false, description: 'Could not delete any of the files associated with the album.' })
    }
  }

  await db.table('albums')
    .where({
      id,
      userid: user.id
    })
    .update('enabled', 0)

  const identifier = await db.table('albums')
    .select('identifier')
    .where({
      id,
      userid: user.id
    })
    .first()
    .then(row => row.identifier)

  // Unlink zip archive of the album if it exists
  const zipPath = path.join(zipsDir, `${identifier}.zip`)
  fs.unlink(zipPath, error => {
    if (error && error.code !== 'ENOENT') {
      console.log(error)
      return res.json({ success: false, description: error.toString(), failedids })
    }
    res.json({ success: true, failedids })
  })
}

albumsController.edit = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  const id = parseInt(req.body.id)
  if (isNaN(id)) {
    return res.json({ success: false, description: 'No album specified.' })
  }

  const name = req.body.name
  if (name === undefined || name === '') {
    return res.json({ success: false, description: 'No name specified.' })
  }

  const album = await db.table('albums')
    .where({
      name,
      userid: user.id,
      enabled: 1
    })
    .first()

  if (album && (album.id !== id)) {
    return res.json({ success: false, description: 'Name already in use.' })
  } else if (req._old && (album.id === id)) {
    return res.json({ success: false, description: 'You did not specify a new name.' })
  }

  await db.table('albums')
    .where({
      id,
      userid: user.id
    })
    .update({
      name,
      download: Boolean(req.body.download),
      public: Boolean(req.body.public)
    })

  if (req.body.requestLink) {
    const oldIdentifier = await db.table('albums')
      .select('identifier')
      .where({
        id,
        userid: user.id
      })
      .first()
      .then(row => row.identifier)

    const identifier = await albumsController.getUniqueRandomName()
      .catch(error => {
        res.json({ success: false, description: error.toString() })
      })
    if (!identifier) { return }

    await db.table('albums')
      .where({
        id,
        userid: user.id
      })
      .update('identifier', identifier)

    // Rename zip archive of the album if it exists
    const zipPath = path.join(zipsDir, `${oldIdentifier}.zip`)
    return fs.access(zipPath, error => {
      if (error) { return res.json({ success: true, identifier }) }
      fs.rename(zipPath, path.join(zipsDir, `${identifier}.zip`), error => {
        if (!error) { return res.json({ success: true, identifier }) }
        console.log(error)
        res.json({ success: false, description: error.toString() })
      })
    })
  }

  return res.json({ success: true, name })
}

albumsController.rename = async (req, res, next) => {
  req._old = true
  req.body = { name: req.body.name }
  return albumsController.edit(req, res, next)
}

albumsController.get = async (req, res, next) => {
  // TODO:
  const identifier = req.params.identifier
  if (identifier === undefined) {
    return res.status(401).json({ success: false, description: 'No identifier provided.' })
  }

  const album = await db.table('albums')
    .where({
      identifier,
      enabled: 1
    })
    .first()

  if (!album) {
    return res.json({ success: false, description: 'Album not found.' })
  } else if (album.public === 0) {
    return res.status(401).json({
      success: false,
      description: 'This album is not available for public.'
    })
  }

  const title = album.name
  const files = await db.table('files')
    .select('name')
    .where('albumid', album.id)
    .orderBy('id', 'DESC')

  for (const file of files) {
    file.file = `${config.domain}/${file.name}`

    const ext = path.extname(file.name).toLowerCase()
    if ((config.uploads.generateThumbnails.image && utils.imageExtensions.includes(ext)) || (config.uploads.generateThumbnails.video && utils.videoExtensions.includes(ext))) {
      file.thumb = `${config.domain}/thumbs/${file.name.slice(0, -ext.length)}.png`
    }
  }

  return res.json({
    success: true,
    title,
    count: files.length,
    files
  })
}

albumsController.generateZip = async (req, res, next) => {
  const versionString = parseInt(req.query.v)
  const download = (filePath, fileName) => {
    const headers = { 'Access-Control-Allow-Origin': '*' }
    if (versionString > 0) {
      // Cache-Control header is useful when using CDN (max-age: 30 days)
      headers['Cache-Control'] = 'public, max-age=2592000, must-revalidate, proxy-revalidate, immutable, stale-while-revalidate=86400, stale-if-error=604800'
    }
    return res.download(filePath, fileName, { headers })
  }

  const identifier = req.params.identifier
  if (identifier === undefined) {
    return res.status(401).json({
      success: false,
      description: 'No identifier provided.'
    })
  }

  if (!config.uploads.generateZips || !config.uploads.generateZips.enabled) {
    return res.status(401).json({ success: false, description: 'Zip generation disabled.' })
  }

  const album = await db.table('albums')
    .where({
      identifier,
      enabled: 1
    })
    .first()

  if (!album) {
    return res.json({ success: false, description: 'Album not found.' })
  } else if (album.download === 0) {
    return res.json({ success: false, description: 'Download for this album is disabled.' })
  }

  if ((!versionString || versionString <= 0) && album.editedAt) {
    return res.redirect(`${album.identifier}?v=${album.editedAt}`)
  }

  if (album.zipGeneratedAt > album.editedAt) {
    const filePath = path.join(zipsDir, `${identifier}.zip`)
    const exists = await new Promise(resolve => fs.access(filePath, error => resolve(!error)))
    if (exists) {
      const fileName = `${album.name}.zip`
      return download(filePath, fileName)
    }
  }

  console.log(`Generating zip for album identifier: ${identifier}`)
  const files = await db.table('files')
    .select('name', 'size')
    .where('albumid', album.id)
  if (files.length === 0) {
    return res.json({ success: false, description: 'There are no files in the album.' })
  }

  if (maxTotalSize) {
    const totalSizeBytes = files.reduce((accumulator, file) => accumulator + parseInt(file.size), 0)
    if (totalSizeBytes > maxTotalSizeBytes) {
      return res.json({
        success: false,
        description: `Total size of all files in the album exceeds the configured limit (${maxTotalSize}).`
      })
    }
  }

  const zipPath = path.join(zipsDir, `${album.identifier}.zip`)
  const archive = new Zip()

  let iteration = 0
  for (const file of files) {
    fs.readFile(path.join(uploadsDir, file.name), (error, data) => {
      if (error) {
        console.log(error)
      } else {
        archive.file(file.name, data)
      }

      iteration++
      if (iteration === files.length) {
        archive
          .generateNodeStream({
            type: 'nodebuffer',
            streamFiles: true,
            compression: 'DEFLATE',
            compressionOptions: { level: 1 }
          })
          .pipe(fs.createWriteStream(zipPath))
          .on('finish', async () => {
            console.log(`Generated zip for album identifier: ${identifier}`)
            await db.table('albums')
              .where('id', album.id)
              .update('zipGeneratedAt', Math.floor(Date.now() / 1000))

            const filePath = path.join(zipsDir, `${identifier}.zip`)
            const fileName = `${album.name}.zip`
            return download(filePath, fileName)
          })
      }
    })
  }
}

albumsController.addFiles = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  const ids = req.body.ids
  if (!ids || !ids.length) {
    return res.json({ success: false, description: 'No files specified.' })
  }

  let albumid = req.body.albumid
  if (typeof albumid !== 'number') { albumid = parseInt(albumid) }
  if (isNaN(albumid) || (albumid < 0)) { albumid = null }

  const albumids = []

  if (albumid !== null) {
    const album = await db.table('albums')
      .where({
        id: albumid,
        userid: user.id
      })
      .first()

    if (!album) {
      return res.json({ success: false, description: 'Album doesn\'t exist or it doesn\'t belong to the user.' })
    }

    albumids.push(albumid)
  }

  const files = await db.table('files')
    .whereIn('id', ids)
    .where(function () {
      if (user.username !== 'root') {
        this.where('userid', user.id)
      }
    })

  const failedids = ids.filter(id => !files.find(file => file.id === id))

  await Promise.all(files.map(file => {
    if (file.albumid && !albumids.includes(file.albumid)) {
      albumids.push(file.albumid)
    }

    return db.table('files')
      .where('id', file.id)
      .update('albumid', albumid)
      .catch(error => {
        console.error(error)
        failedids.push(file.id)
      })
  }))

  if (failedids.length < ids.length) {
    await Promise.all(albumids.map(albumid => {
      return db.table('albums')
        .where('id', albumid)
        .update('editedAt', Math.floor(Date.now() / 1000))
    }))

    return res.json({ success: true, failedids })
  }

  return res.json({
    success: false,
    description: `Could not ${albumid === null ? 'add' : 'remove'} any of the selected files ${albumid === null ? 'to' : 'from'} the album.`
  })
}

module.exports = albumsController
