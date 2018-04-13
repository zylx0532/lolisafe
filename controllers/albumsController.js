const config = require('./../config')
const db = require('knex')(config.database)
const fs = require('fs')
const path = require('path')
const randomstring = require('randomstring')
const utils = require('./utilsController')
const Zip = require('jszip')

const albumsController = {}

albumsController.list = async (req, res, next) => {
  const albumDomain = config.albumDomain || config.domain
  const user = await utils.authorize(req, res)
  if (!user) { return }

  const fields = ['id', 'name']
  if (req.params.sidebar === undefined) {
    fields.push('timestamp')
    fields.push('identifier')
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

    album.identifier = `${albumDomain}/a/${album.identifier}`
    ids.push(album.id)
  }

  const files = await db.table('files').whereIn('albumid', ids).select('albumid')
  const albumsCount = {}

  for (const id of ids) { albumsCount[id] = 0 }
  for (const file of files) { albumsCount[file.albumid] += 1 }
  for (const album of albums) { album.files = albumsCount[album.id] }

  return res.json({ success: true, albums })
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

  await db.table('albums').insert({
    name,
    enabled: 1,
    userid: user.id,
    identifier: randomstring.generate(8),
    timestamp: Math.floor(Date.now() / 1000),
    editedAt: 0,
    zipGeneratedAt: 0
  })

  return res.json({ success: true })
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
      return res.json({
        success: false,
        description: 'Could not delete any of the files associated with the album.'
      })
    }
  }

  await db.table('albums')
    .where({
      id,
      userid: user.id
    })
    .update({ enabled: 0 })

  return res.json({
    success: true,
    failedids
  })
}

albumsController.rename = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  const id = req.body.id
  if (id === undefined || id === '') {
    return res.json({ success: false, description: 'No album specified.' })
  }

  const name = req.body.name
  if (name === undefined || name === '') {
    return res.json({ success: false, description: 'No name specified.' })
  }

  const album = await db.table('albums')
    .where({
      name,
      userid: user.id
    })
    .first()

  if (album) {
    return res.json({ success: false, description: 'Name already in use.' })
  }

  await db.table('albums')
    .where({
      id,
      userid: user.id
    })
    .update({
      name
    })

  return res.json({ success: true })
}

albumsController.get = async (req, res, next) => {
  const identifier = req.params.identifier
  if (identifier === undefined) { return res.status(401).json({ success: false, description: 'No identifier provided.' }) }

  const album = await db.table('albums').where({ identifier, enabled: 1 }).first()
  if (!album) { return res.json({ success: false, description: 'Album not found.' }) }

  const title = album.name
  const files = await db.table('files').select('name').where('albumid', album.id).orderBy('id', 'DESC')

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
  const identifier = req.params.identifier
  if (identifier === undefined) { return res.status(401).json({ success: false, description: 'No identifier provided.' }) }
  if (!config.uploads.generateZips) { return res.status(401).json({ success: false, description: 'Zip generation disabled.' }) }

  const album = await db.table('albums').where({ identifier, enabled: 1 }).first()
  if (!album) { return res.json({ success: false, description: 'Album not found.' }) }

  if (album.zipGeneratedAt > album.editedAt) {
    const filePath = path.join(config.uploads.folder, 'zips', `${identifier}.zip`)
    const fileName = `${album.name}.zip`
    return res.download(filePath, fileName)
  } else {
    console.log(`Generating zip for album identifier: ${identifier}`)
    const files = await db.table('files')
      .select('name')
      .where('albumid', album.id)
    if (files.length === 0) { return res.json({ success: false, description: 'There are no files in the album.' }) }

    const zipPath = path.join(__dirname, '..', config.uploads.folder, 'zips', `${album.identifier}.zip`)
    const archive = new Zip()

    for (const file of files) {
      try {
        // const exists = fs.statSync(path.join(__dirname, '..', config.uploads.folder, file.name))
        archive.file(file.name, fs.readFileSync(path.join(__dirname, '..', config.uploads.folder, file.name)))
      } catch (error) {
        console.log(error)
      }
    }

    archive
      .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
      .pipe(fs.createWriteStream(zipPath))
      .on('finish', async () => {
        console.log(`Generated zip for album identifier: ${identifier}`)
        await db.table('albums')
          .where('id', album.id)
          .update({ zipGeneratedAt: Math.floor(Date.now() / 1000) })

        const filePath = path.join(config.uploads.folder, 'zips', `${identifier}.zip`)
        const fileName = `${album.name}.zip`
        return res.download(filePath, fileName)
      })
  }
}

albumsController.addFiles = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) { return }

  const ids = req.body.ids
  if (ids === undefined || !ids.length) {
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
      return res.json({
        success: false,
        description: 'Album doesn\'t exist or it doesn\'t belong to the user.'
      })
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
    return res.json({
      success: true,
      failedids
    })
  }

  return res.json({
    success: false,
    description: `Could not ${albumid === null ? 'add' : 'remove'} any of the selected files ${albumid === null ? 'to' : 'from'} the album.`
  })
}

module.exports = albumsController
