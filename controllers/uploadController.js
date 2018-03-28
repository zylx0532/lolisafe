const config = require('../config.js')
const path = require('path')
const multer = require('multer')
const randomstring = require('randomstring')
const db = require('knex')(config.database)
const crypto = require('crypto')
const fs = require('fs')
const rimraf = require('rimraf')
const utils = require('./utilsController.js')

const uploadsController = {}

// Let's default it to only 1 try (for missing config key)
const maxTries = config.uploads.maxTries || 1
const uploadDir = path.join(__dirname, '..', config.uploads.folder)
const chunkedUploads = config.uploads.chunkedUploads && config.uploads.chunkedUploads.enabled
const chunksDir = path.join(uploadDir, 'chunks')
const maxSizeBytes = parseInt(config.uploads.maxSize) * 1000000

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // If chunked uploads is disabled or the uploaded file is not a chunk
    if (!chunkedUploads || (req.body.uuid === undefined && req.body.chunkindex === undefined)) {
      return cb(null, uploadDir)
    }

    // Check for the existence of UUID dir in chunks dir
    const uuidDir = path.join(chunksDir, req.body.uuid)
    fs.access(uuidDir, err => {
      // If it exists, callback
      if (!err) return cb(null, uuidDir)
      // It it doesn't, then make it first
      fs.mkdir(uuidDir, err => {
        // If there was no error, callback
        if (!err) return cb(null, uuidDir)
        // Otherwise, log it
        console.log(err)
        // eslint-disable-next-line standard/no-callback-literal
        return cb('Could not process the chunked upload. Try again?')
      })
    })
  },
  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname)

    // If chunked uploads is disabled or the uploaded file is not a chunk
    if (!chunkedUploads || (req.body.uuid === undefined && req.body.chunkindex === undefined)) {
      const length = uploadsController.getFileNameLength(req)
      return uploadsController.getUniqueRandomName(length, extension, cb)
    }

    // index.extension (e.i. 0.jpg, 1.jpg, ..., n.jpg - will prepend zeros depending on the amount of chunks)
    const digits = req.body.totalchunkcount !== undefined ? String(req.body.totalchunkcount - 1).length : 1
    const zeros = new Array(digits + 1).join('0')
    const name = (zeros + req.body.chunkindex).slice(-digits)
    return cb(null, name + extension)
  }
})

const upload = multer({
  storage,
  limits: {
    fileSize: config.uploads.maxSize
  },
  fileFilter: function (req, file, cb) {
    // If there are no blocked extensions
    if (config.blockedExtensions === undefined) {
      return cb(null, true)
    }

    // If the extension is blocked
    if (config.blockedExtensions.some(extension => {
      return path.extname(file.originalname).toLowerCase() === extension.toLowerCase()
    })) {
      // eslint-disable-next-line standard/no-callback-literal
      return cb('This file extension is not allowed.')
    }

    if (chunkedUploads) {
      // Re-map Dropzone keys so people can manually use the API without prepending 'dz'
      const keys = Object.keys(req.body)
      if (keys.length) {
        for (const key of keys) {
          if (!/^dz/.test(key)) continue
          req.body[key.replace(/^dz/, '')] = req.body[key]
          delete req.body[key]
        }
      }

      const totalFileSize = parseInt(req.body.totalfilesize)
      if (!isNaN(totalFileSize) && totalFileSize > maxSizeBytes) {
        // eslint-disable-next-line standard/no-callback-literal
        return cb('Chunked upload error. Total file size is larger than maximum file size.')
      }
    }

    // If the extension is not blocked
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

uploadsController.getUniqueRandomName = (length, extension, cb) => {
  const access = i => {
    const name = randomstring.generate(length) + extension
    fs.access(path.join(uploadDir, name), err => {
      // If a file with the same name does not exist
      if (err) return cb(null, name)
      // If a file with the same name already exists, log to console
      console.log(`A file named ${name} already exists (${++i}/${maxTries}).`)
      // If it still haven't reached allowed maximum tries, then try again
      if (i < maxTries) return access(i)
      // eslint-disable-next-line standard/no-callback-literal
      return cb('Could not allocate a unique random name. Try again?')
    })
  }
  // Get us a unique random name
  access(0)
}

uploadsController.upload = async (req, res, next) => {
  let user
  if (config.private === true) {
    user = await utils.authorize(req, res)
    if (!user) return
  } else if (req.headers.token) {
    user = await db.table('users').where('token', req.headers.token).first()
  }

  if (user && (user.enabled === false || user.enabled === 0)) {
    return res.json({
      success: false,
      description: 'This account has been disabled.'
    })
  }

  if (user && user.fileLength && !req.headers.filelength) {
    req.headers.filelength = user.fileLength
  }

  const albumid = req.headers.albumid || req.params.albumid

  if (albumid && user) {
    const album = await db.table('albums').where({ id: albumid, userid: user.id }).first()
    if (!album) {
      return res.json({
        success: false,
        description: 'Album doesn\'t exist or it doesn\'t belong to the user.'
      })
    }
    return uploadsController.actuallyUpload(req, res, user, albumid)
  }
  return uploadsController.actuallyUpload(req, res, user, albumid)
}

uploadsController.actuallyUpload = async (req, res, user, albumid) => {
  const erred = err => {
    console.log(err)
    res.json({
      success: false,
      description: err.toString()
    })
  }

  upload(req, res, async err => {
    if (err) return erred(err)

    if (req.files.length === 0) return erred(new Error('No files.'))

    // If chunked uploads is enabeld and the uploaded file is a chunk, then just say that it was a success
    if (chunkedUploads && req.body.uuid) return res.json({ success: true })

    const infoMap = req.files.map(file => {
      return {
        path: path.join(__dirname, '..', config.uploads.folder, file.filename),
        data: file
      }
    })

    const result = await uploadsController.writeFilesToDb(req, res, user, albumid, infoMap)
      .catch(erred)

    if (result) {
      return uploadsController.processFilesForDisplay(req, res, result.files, result.existingFiles)
    }
  })
}

uploadsController.finishChunks = async (req, res, next) => {
  if (!config.uploads.chunkedUploads || !config.uploads.chunkedUploads.enabled) {
    return res.json({
      success: false,
      description: 'Chunked uploads is disabled at the moment.'
    })
  }

  let user
  if (config.private === true) {
    user = await utils.authorize(req, res)
    if (!user) return
  } else if (req.headers.token) {
    user = await db.table('users').where('token', req.headers.token).first()
  }

  if (user && (user.enabled === false || user.enabled === 0)) {
    return res.json({
      success: false,
      description: 'This account has been disabled.'
    })
  }

  if (user && user.fileLength && !req.headers.filelength) {
    req.headers.filelength = user.fileLength
  }

  const albumid = req.headers.albumid || req.params.albumid

  if (albumid && user) {
    const album = await db.table('albums').where({ id: albumid, userid: user.id }).first()
    if (!album) {
      return res.json({
        success: false,
        description: 'Album doesn\'t exist or it doesn\'t belong to the user.'
      })
    }
    return uploadsController.actuallyFinishChunks(req, res, user, albumid)
  }
  return uploadsController.actuallyFinishChunks(req, res, user, albumid)
}

uploadsController.actuallyFinishChunks = async (req, res, user, albumid) => {
  const erred = err => {
    console.log(err)
    res.json({
      success: false,
      description: err.toString()
    })
  }

  const files = req.body.files
  if (!files) return erred(new Error('Missing files array.'))

  let iteration = 0
  const infoMap = []
  files.forEach(file => {
    const { uuid, count } = file
    if (!uuid || !count) return erred(new Error('Missing UUID and/or chunks count.'))

    const chunksDirUuid = path.join(chunksDir, uuid)

    fs.readdir(chunksDirUuid, async (err, chunks) => {
      if (err) return erred(err)
      if (count < chunks.length) return erred(new Error('Chunks count mismatch.'))

      const extension = path.extname(chunks[0])
      const length = uploadsController.getFileNameLength(req)

      uploadsController.getUniqueRandomName(length, extension, async (err, name) => {
        if (err) return erred(err)

        const destination = path.join(uploadDir, name)
        const destFileStream = fs.createWriteStream(destination, { flags: 'a' })

        chunks.sort()
        const appended = await uploadsController.appendToStream(destFileStream, chunksDirUuid, chunks)
          .catch(erred)

        rimraf(chunksDirUuid, err => {
          if (err) {
            console.log(err)
          }
        })

        if (!appended) return

        infoMap.push({
          path: destination,
          data: {
            filename: name,
            originalname: file.original || '',
            mimetype: file.type || '',
            size: file.size || 0
          }
        })

        iteration++
        if (iteration >= files.length) {
          const result = await uploadsController.writeFilesToDb(req, res, user, albumid, infoMap)
            .catch(erred)

          if (result) {
            return uploadsController.processFilesForDisplay(req, res, result.files, result.existingFiles)
          }
        }
      })
    })
  })
}

uploadsController.appendToStream = async (destFileStream, chunksDirUuid, chunks) => {
  return new Promise((resolve, reject) => {
    const append = i => {
      if (i < chunks.length) {
        fs.createReadStream(path.join(chunksDirUuid, chunks[i]))
          .on('end', () => {
            append(i + 1)
          })
          .on('error', err => {
            console.log(err)
            destFileStream.end()
            return reject(err)
          })
          .pipe(destFileStream, { end: false })
      } else {
        destFileStream.end()
        return resolve(true)
      }
    }
    append(0)
  })
}

uploadsController.writeFilesToDb = async (req, res, user, albumid, infoMap) => {
  return new Promise((resolve, reject) => {
    let iteration = 0
    const files = []
    const existingFiles = []

    infoMap.forEach(info => {
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
            if (user === undefined) this.whereNull('userid')
            else this.where('userid', user.id)
          })
          .where({
            hash: fileHash,
            size: info.data.size
          })
          .first()

        if (!dbFile) {
          files.push({
            name: info.data.filename,
            original: info.data.originalname,
            type: info.data.mimetype,
            size: info.data.size,
            hash: fileHash,
            ip: req.ip,
            albumid,
            userid: user !== undefined ? user.id : null,
            timestamp: Math.floor(Date.now() / 1000)
          })
        } else {
          uploadsController.deleteFile(info.data.filename).then(() => {}).catch(err => console.log(err))
          existingFiles.push(dbFile)
        }

        iteration++
        if (iteration >= infoMap.length) {
          return resolve({ files, existingFiles })
        }
      })
    })
  })
}

uploadsController.processFilesForDisplay = async (req, res, files, existingFiles) => {
  let basedomain = config.domain
  if (files.length === 0) {
    return res.json({
      success: true,
      files: existingFiles.map(file => {
        return {
          name: file.name,
          size: file.size,
          url: `${basedomain}/${file.name}`
        }
      })
    })
  }

  // Insert new files to DB
  await db.table('files').insert(files)

  // Push existing files to array for response
  for (let efile of existingFiles) {
    files.push(efile)
  }

  res.json({
    success: true,
    files: files.map(file => {
      return {
        name: file.name,
        size: file.size,
        url: `${basedomain}/${file.name}`
      }
    })
  })

  for (let file of files) {
    let ext = path.extname(file.name).toLowerCase()
    if ((config.uploads.generateThumbnails.image && utils.imageExtensions.includes(ext)) || (config.uploads.generateThumbnails.video && utils.videoExtensions.includes(ext))) {
      file.thumb = `${basedomain}/thumbs/${file.name.slice(0, -ext.length)}.png`
      utils.generateThumbs(file)
    }

    if (file.albumid) {
      db.table('albums').where('id', file.albumid).update('editedAt', file.timestamp).then(() => {})
        .catch(error => { console.log(error); res.json({ success: false, description: 'Error updating album.' }) })
    }
  }
}

uploadsController.delete = async (req, res) => {
  const user = await utils.authorize(req, res)
  if (!user) return
  const id = req.body.id
  if (id === undefined || id === '') {
    return res.json({ success: false, description: 'No file specified.' })
  }

  const file = await db.table('files')
    .where('id', id)
    .where(function () {
      if (user.username !== 'root') {
        this.where('userid', user.id)
      }
    })
    .first()

  try {
    await uploadsController.deleteFile(file.name).catch(err => {
      // ENOENT is missing file, for whatever reason, then just delete from db
      if (err.code !== 'ENOENT') throw err
    })
    await db.table('files').where('id', id).del()
    if (file.albumid) {
      await db.table('albums').where('id', file.albumid).update('editedAt', Math.floor(Date.now() / 1000))
    }
  } catch (err) {
    console.log(err)
  }

  return res.json({ success: true })
}

uploadsController.deleteFile = function (file) {
  const ext = path.extname(file).toLowerCase()
  return new Promise((resolve, reject) => {
    fs.stat(path.join(__dirname, '..', config.uploads.folder, file), (err, stats) => {
      if (err) { return reject(err) }
      fs.unlink(path.join(__dirname, '..', config.uploads.folder, file), err => {
        if (err) { return reject(err) }
        if (!utils.imageExtensions.includes(ext) && !utils.videoExtensions.includes(ext)) {
          return resolve()
        }
        file = file.substr(0, file.lastIndexOf('.')) + '.png'
        fs.stat(path.join(__dirname, '..', config.uploads.folder, 'thumbs/', file), (err, stats) => {
          if (err) {
            if (err.code !== 'ENOENT') {
              console.log(err)
            }
            return resolve()
          }
          fs.unlink(path.join(__dirname, '..', config.uploads.folder, 'thumbs/', file), err => {
            if (err) { return reject(err) }
            return resolve()
          })
        })
      })
    })
  })
}

uploadsController.list = async (req, res) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  let offset = req.params.page
  if (offset === undefined) offset = 0

  const files = await db.table('files')
    .where(function () {
      if (req.params.id === undefined) this.where('id', '<>', '')
      else this.where('albumid', req.params.id)
    })
    .where(function () {
      if (user.username !== 'root') this.where('userid', user.id)
    })
    .orderBy('id', 'DESC')
    .limit(25)
    .offset(25 * offset)
    .select('id', 'albumid', 'timestamp', 'name', 'userid', 'size')

  const albums = await db.table('albums')
  let basedomain = config.domain
  let userids = []

  for (let file of files) {
    file.file = `${basedomain}/${file.name}`
    file.date = new Date(file.timestamp * 1000)
    file.date = utils.getPrettyDate(file.date)
    file.size = utils.getPrettyBytes(parseInt(file.size))

    file.album = ''

    if (file.albumid !== undefined) {
      for (let album of albums) {
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

    let ext = path.extname(file.name).toLowerCase()
    if ((config.uploads.generateThumbnails.image && utils.imageExtensions.includes(ext)) || (config.uploads.generateThumbnails.video && utils.videoExtensions.includes(ext))) {
      file.thumb = `${basedomain}/thumbs/${file.name.slice(0, -ext.length)}.png`
    }
  }

  // If we are a normal user, send response
  if (user.username !== 'root') return res.json({ success: true, files })

  // If we are root but there are no uploads attached to a user, send response
  if (userids.length === 0) return res.json({ success: true, files })

  const users = await db.table('users').whereIn('id', userids)
  for (let dbUser of users) {
    for (let file of files) {
      if (file.userid === dbUser.id) {
        file.username = dbUser.username
      }
    }
  }

  return res.json({ success: true, files })
}

module.exports = uploadsController
