const config = require('./../config')
const path = require('path')
const multer = require('multer')
const randomstring = require('randomstring')
const db = require('knex')(config.database)
const crypto = require('crypto')
const fs = require('fs')
const utils = require('./utilsController')

const uploadsController = {}

const maxTries = config.uploads.maxTries || 1
const uploadsDir = path.join(__dirname, '..', config.uploads.folder)
const chunkedUploads = Boolean(config.uploads.chunkSize)
const chunksDir = path.join(uploadsDir, 'chunks')
const maxSizeBytes = parseInt(config.uploads.maxSize) * 1000000

const storage = multer.diskStorage({
  destination (req, file, cb) {
    // If chunked uploads is disabled or the uploaded file is not a chunk
    if (!chunkedUploads || (req.body.uuid === undefined && req.body.chunkindex === undefined)) {
      return cb(null, uploadsDir)
    }

    const uuidDir = path.join(chunksDir, req.body.uuid)
    fs.access(uuidDir, error => {
      if (!error) { return cb(null, uuidDir) }
      fs.mkdir(uuidDir, error => {
        if (!error) { return cb(null, uuidDir) }
        console.error(error)
        // eslint-disable-next-line standard/no-callback-literal
        return cb('Could not process the chunked upload. Try again?')
      })
    })
  },
  filename (req, file, cb) {
    // If chunked uploads is disabled or the uploaded file is not a chunk
    if (!chunkedUploads || (req.body.uuid === undefined && req.body.chunkindex === undefined)) {
      const extension = path.extname(file.originalname)
      const length = uploadsController.getFileNameLength(req)
      return uploadsController.getUniqueRandomName(length, extension)
        .then(name => cb(null, name))
        .catch(error => cb(error))
    }

    // index.extension (e.i. 0, 1, ..., n - will prepend zeros depending on the amount of chunks)
    const digits = req.body.totalchunkcount !== undefined ? String(req.body.totalchunkcount - 1).length : 1
    const zeros = new Array(digits + 1).join('0')
    const name = (zeros + req.body.chunkindex).slice(-digits)
    return cb(null, name)
  }
})

const upload = multer({
  storage,
  limits: {
    fileSize: config.uploads.maxSize
  },
  fileFilter (req, file, cb) {
    // If there are extensions that have to be filtered
    if (config.extensionsFilter && config.extensionsFilter.length) {
      const extname = path.extname(file.originalname).toLowerCase()
      const match = config.extensionsFilter.some(extension => extname === extension.toLowerCase())

      if ((config.filterBlacklist && match) || (!config.filterBlacklist && !match)) {
        // eslint-disable-next-line standard/no-callback-literal
        return cb(`Sorry, ${extname.substr(1).toUpperCase()} files are not permitted for security reasons.`)
      }
    }

    // Re-map Dropzone keys so people can manually use the API without prepending 'dz'
    for (const key in req.body) {
      if (!/^dz/.test(key)) { continue }
      req.body[key.replace(/^dz/, '')] = req.body[key]
      delete req.body[key]
    }

    if (req.body.chunkindex) {
      if (chunkedUploads && parseInt(req.body.totalfilesize) > maxSizeBytes) {
        // This will not be true if "totalfilesize" key does not exist, since "NaN > number" is false.
        // eslint-disable-next-line standard/no-callback-literal
        return cb('Chunk error occurred. Total file size is larger than the maximum file size.')
      } else if (!chunkedUploads) {
        // eslint-disable-next-line standard/no-callback-literal
        return cb('Chunked uploads is disabled at the moment.')
      }
    }

    return cb(null, true)
  }
}).array('files[]')

uploadsController.getFileNameLength = req => {
  // If the user has a preferred file length, make sure it is within the allowed range
  if (req.headers.filelength) {
    return Math.min(Math.max(req.headers.filelength, config.uploads.fileLength.min), config.uploads.fileLength.max)
  }

  // Let's default it to 32 characters when config key is falsy
  return config.uploads.fileLength.default || 32
}

uploadsController.getUniqueRandomName = (length, extension) => {
  return new Promise((resolve, reject) => {
    const access = i => {
      const name = randomstring.generate(length) + extension
      fs.access(path.join(uploadsDir, name), error => {
        if (error) { return resolve(name) }
        console.log(`A file named ${name} already exists (${++i}/${maxTries}).`)
        if (i < maxTries) { return access(i) }
        // eslint-disable-next-line prefer-promise-reject-errors
        return reject('Sorry, we could not allocate a unique random name. Try again?')
      })
    }
    access(0)
  })
}

uploadsController.upload = async (req, res, next) => {
  let user
  if (config.private === true) {
    user = await utils.authorize(req, res)
    if (!user) { return }
  } else if (req.headers.token) {
    user = await db.table('users').where('token', req.headers.token).first()
  }

  if (user && (user.enabled === false || user.enabled === 0)) {
    return res.json({ success: false, description: 'This account has been disabled.' })
  }

  if (user && user.fileLength && !req.headers.filelength) {
    req.headers.filelength = user.fileLength
  }

  let albumid = parseInt(req.headers.albumid || req.params.albumid)
  if (isNaN(albumid)) { albumid = null }
  return uploadsController.actuallyUpload(req, res, user, albumid)
}

uploadsController.actuallyUpload = async (req, res, user, albumid) => {
  const erred = error => {
    const isError = error instanceof Error
    if (isError) { console.error(error) }
    res.json({
      success: false,
      description: isError ? error.toString() : `Error: ${error}`
    })
  }

  upload(req, res, async error => {
    if (error) { return erred(error) }

    if (req.files.length === 0) { return erred('No files.') }

    // If chunked uploads is enabled and the uploaded file is a chunk, then just say that it was a success
    if (chunkedUploads && req.body.uuid) { return res.json({ success: true }) }

    const infoMap = req.files.map(file => {
      file.albumid = albumid
      return {
        path: path.join(__dirname, '..', config.uploads.folder, file.filename),
        data: file
      }
    })

    const result = await uploadsController.writeFilesToDb(req, res, user, infoMap)
      .catch(erred)

    if (result) {
      return uploadsController.processFilesForDisplay(req, res, result.files, result.existingFiles)
    }
  })
}

uploadsController.finishChunks = async (req, res, next) => {
  if (!chunkedUploads) {
    return res.json({ success: false, description: 'Chunked uploads is disabled at the moment.' })
  }

  let user
  if (config.private === true) {
    user = await utils.authorize(req, res)
    if (!user) { return }
  } else if (req.headers.token) {
    user = await db.table('users').where('token', req.headers.token).first()
  }

  if (user && (user.enabled === false || user.enabled === 0)) {
    return res.json({ success: false, description: 'This account has been disabled.' })
  }

  if (user && user.fileLength && !req.headers.filelength) {
    req.headers.filelength = user.fileLength
  }

  let albumid = parseInt(req.headers.albumid || req.params.albumid)
  if (isNaN(albumid)) { albumid = null }
  return uploadsController.actuallyFinishChunks(req, res, user, albumid)
}

uploadsController.actuallyFinishChunks = async (req, res, user, albumid) => {
  const erred = error => {
    const isError = error instanceof Error
    if (isError) { console.error(error) }
    res.json({
      success: false,
      description: isError ? error.toString() : `Error: ${error}`
    })
  }

  const files = req.body.files
  if (!files) { return erred('Missing files array.') }

  let iteration = 0
  const infoMap = []
  for (const file of files) {
    const { uuid, original, count } = file
    if (!uuid) { return erred('Missing UUID.') }
    if (!count) { return erred('Missing chunks count.') }

    const uuidDir = path.join(chunksDir, uuid)
    fs.readdir(uuidDir, async (error, chunkNames) => {
      if (error) { return erred(error) }
      if (count < chunkNames.length) { return erred('Chunks count mismatch.') }

      const extension = typeof original === 'string' ? path.extname(original) : ''
      const length = uploadsController.getFileNameLength(req)

      const name = await uploadsController.getUniqueRandomName(length, extension)
        .catch(erred)
      if (!name) { return }

      const destination = path.join(uploadsDir, name)
      const destFileStream = fs.createWriteStream(destination, { flags: 'a' })

      // Sort chunk names
      chunkNames.sort()

      // Append all chunks
      const chunksAppended = await uploadsController.appendToStream(destFileStream, uuidDir, chunkNames)
        .then(() => true)
        .catch(erred)
      if (!chunksAppended) { return }

      // Delete all chunks
      const chunksDeleted = await Promise.all(chunkNames.map(chunkName => {
        return new Promise((resolve, reject) => {
          const chunkPath = path.join(uuidDir, chunkName)
          fs.unlink(chunkPath, error => {
            if (error && error.code !== 'ENOENT') {
              return reject(error)
            }
            resolve()
          })
        })
      }))
        .then(() => true)
        .catch(erred)
      if (!chunksDeleted) { return }

      // Delete UUID dir
      fs.rmdir(uuidDir, async error => {
        if (error) { return erred(error) }

        const data = {
          filename: name,
          originalname: file.original || '',
          mimetype: file.type || '',
          size: file.size || 0
        }

        data.albumid = parseInt(file.albumid)
        if (isNaN(data.albumid)) { data.albumid = albumid }

        infoMap.push({
          path: destination,
          data
        })

        iteration++
        if (iteration === files.length) {
          const result = await uploadsController.writeFilesToDb(req, res, user, infoMap)
            .catch(erred)

          if (result) {
            return uploadsController.processFilesForDisplay(req, res, result.files, result.existingFiles)
          }
        }
      })
    })
  }
}

uploadsController.appendToStream = (destFileStream, uuidDr, chunkNames) => {
  return new Promise((resolve, reject) => {
    const append = i => {
      if (i < chunkNames.length) {
        fs.createReadStream(path.join(uuidDr, chunkNames[i]))
          .on('end', () => {
            append(++i)
          })
          .on('error', error => {
            console.erred(error)
            destFileStream.end()
            return reject(error)
          })
          .pipe(destFileStream, { end: false })
      } else {
        destFileStream.end()
        return resolve()
      }
    }
    append(0)
  })
}

uploadsController.writeFilesToDb = (req, res, user, infoMap) => {
  return new Promise((resolve, reject) => {
    let iteration = 0
    const files = []
    const existingFiles = []
    const albumsAuthorized = {}

    for (const info of infoMap) {
      // Check if the file exists by checking hash and size
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(info.path)

      stream.on('data', data => {
        hash.update(data, 'utf8')
      })

      stream.on('end', async () => {
        const fileHash = hash.digest('hex')
        const dbFile = await db.table('files')
          .where(function () {
            if (user === undefined) {
              this.whereNull('userid')
            } else {
              this.where('userid', user.id)
            }
          })
          .where({
            hash: fileHash,
            size: info.data.size
          })
          .first()

        if (!dbFile) {
          if (info.data.albumid && albumsAuthorized[info.data.albumid] === undefined) {
            const authorized = await db.table('albums')
              .where({
                id: info.data.albumid,
                userid: user.id
              })
              .first()
            albumsAuthorized[info.data.albumid] = Boolean(authorized)
          }

          files.push({
            name: info.data.filename,
            original: info.data.originalname,
            type: info.data.mimetype,
            size: info.data.size,
            hash: fileHash,
            ip: req.ip,
            albumid: albumsAuthorized[info.data.albumid] ? info.data.albumid : null,
            userid: user !== undefined ? user.id : null,
            timestamp: Math.floor(Date.now() / 1000)
          })
        } else {
          utils.deleteFile(info.data.filename).catch(console.error)
          existingFiles.push(dbFile)
        }

        iteration++
        if (iteration === infoMap.length) {
          return resolve({ files, existingFiles })
        }
      })
    }
  })
}

uploadsController.processFilesForDisplay = async (req, res, files, existingFiles) => {
  const basedomain = config.domain
  let albumSuccess = true
  let mappedFiles

  if (files.length) {
    // Insert new files to DB
    await db.table('files').insert(files)

    // Push existing files to array for response
    for (const efile of existingFiles) {
      files.push(efile)
    }

    const albumids = []
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase()
      if ((config.uploads.generateThumbs.image && utils.imageExtensions.includes(ext)) || (config.uploads.generateThumbs.video && utils.videoExtensions.includes(ext))) {
        file.thumb = `${basedomain}/thumbs/${file.name.slice(0, -ext.length)}.png`
        utils.generateThumbs(file)
      }
      if (file.albumid && !albumids.includes(file.albumid)) {
        albumids.push(file.albumid)
      }
    }

    if (albumids.length) {
      const editedAt = Math.floor(Date.now() / 1000)
      await Promise.all(albumids.map(albumid => {
        return db.table('albums')
          .where('id', albumid)
          .update('editedAt', editedAt)
          .then(() => {})
          .catch(error => {
            console.erred(error)
            albumSuccess = false
          })
      }))
    }

    mappedFiles = files.map(file => {
      return {
        name: file.name,
        size: file.size,
        url: `${basedomain}/${file.name}`
      }
    })
  } else {
    mappedFiles = existingFiles.map(file => {
      return {
        name: file.name,
        size: file.size,
        url: `${basedomain}/${file.name}`
      }
    })
  }

  return res.json({
    success: albumSuccess,
    description: albumSuccess ? null : 'Warning: Album may not have been properly updated.',
    files: mappedFiles
  })
}

uploadsController.delete = async (req, res) => {
  req.body.field = 'id'
  req.body.values = [req.body.id]
  delete req.body.id
  return uploadsController.bulkDelete(req, res)
}

uploadsController.bulkDelete = async (req, res) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  const field = req.body.field || 'id'
  const values = req.body.values
  if (values === undefined || !values.length) {
    return res.json({ success: false, description: 'No files specified.' })
  }

  const failed = await utils.bulkDeleteFiles(field, values, user)
  if (failed.length < values.length) {
    return res.json({ success: true, failed })
  }

  return res.json({ success: false, description: 'Could not delete any files.' })
}

uploadsController.list = async (req, res) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  let offset = req.params.page
  if (offset === undefined) { offset = 0 }

  const files = await db.table('files')
    .where(function () {
      if (req.params.id === undefined) {
        this.where('id', '<>', '')
      } else {
        this.where('albumid', req.params.id)
      }
    })
    .where(function () {
      if (user.username !== 'root') { this.where('userid', user.id) }
    })
    .orderBy('id', 'DESC')
    .limit(25)
    .offset(25 * offset)
    .select('id', 'albumid', 'timestamp', 'name', 'userid', 'size')

  const albums = await db.table('albums')
    .where(function () {
      this.where('enabled', 1)
      if (user.username !== 'root') {
        this.where('userid', user.id)
      }
    })

  const basedomain = config.domain
  const userids = []

  for (const file of files) {
    file.file = `${basedomain}/${file.name}`
    file.date = new Date(file.timestamp * 1000)
    file.date = utils.getPrettyDate(file.date)
    file.size = utils.getPrettyBytes(parseInt(file.size))

    file.album = ''

    if (file.albumid !== undefined) {
      for (const album of albums) {
        if (file.albumid === album.id) {
          file.album = album.name
        }
      }
    }

    // Only push usernames if we are root
    if (user.username === 'root') {
      if (file.userid !== undefined && file.userid !== null && file.userid !== '') {
        userids.push(file.userid)
      }
    }

    file.extname = path.extname(file.name).toLowerCase()
    const isVideoExt = utils.videoExtensions.includes(file.extname)
    const isImageExt = utils.imageExtensions.includes(file.extname)

    if ((!isVideoExt && !isImageExt) ||
      (isVideoExt && config.uploads.generateThumbs.video !== true) ||
      (isImageExt && config.uploads.generateThumbs.image !== true)) {
      continue
    }

    file.thumb = `${basedomain}/thumbs/${file.name.slice(0, -file.extname.length)}.png`
  }

  // If we are a normal user, send response
  if (user.username !== 'root') { return res.json({ success: true, files }) }

  // If we are root but there are no uploads attached to a user, send response
  if (userids.length === 0) { return res.json({ success: true, files }) }

  const users = await db.table('users')
    .whereIn('id', userids)
  for (const dbUser of users) {
    for (const file of files) {
      if (file.userid === dbUser.id) {
        file.username = dbUser.username
      }
    }
  }

  return res.json({ success: true, files })
}

module.exports = uploadsController
