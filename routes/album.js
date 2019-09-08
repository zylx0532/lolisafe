const config = require('./../config')
const db = require('knex')(config.database)
const path = require('path')
const paths = require('./../controllers/pathsController')
const routes = require('express').Router()
const utils = require('./../controllers/utilsController')

const homeDomain = config.homeDomain || config.domain

routes.get('/a/:identifier', async (req, res, next) => {
  const identifier = req.params.identifier
  if (identifier === undefined)
    return res.status(401).json({
      success: false,
      description: 'No identifier provided.'
    })

  const album = await db.table('albums')
    .where({
      identifier,
      enabled: 1
    })
    .first()

  if (!album)
    return res.status(404).sendFile(path.join(paths.errorRoot, config.errorPages[404]))
  else if (album.public === 0)
    return res.status(403).json({
      success: false,
      description: 'This album is not available for public.'
    })

  const files = await db.table('files')
    .select('name', 'size')
    .where('albumid', album.id)
    .orderBy('id', 'DESC')

  let thumb = ''
  const basedomain = config.domain

  let totalSize = 0
  for (const file of files) {
    file.file = `${basedomain}/${file.name}`
    file.extname = path.extname(file.name).toLowerCase()
    if (utils.mayGenerateThumb(file.extname)) {
      file.thumb = `${basedomain}/thumbs/${file.name.slice(0, -file.extname.length)}.png`
      /*
        If thumbnail for album is still not set, set it to current file's full URL.
        A potential improvement would be to let the user set a specific image as an album cover.
      */
      if (thumb === '') thumb = file.file
    }
    totalSize += parseInt(file.size)
  }

  return res.render('album', {
    title: album.name,
    description: album.description ? album.description.replace(/\n/g, '<br>') : null,
    count: files.length,
    thumb,
    files,
    identifier,
    generateZips: config.uploads.generateZips,
    downloadLink: album.download === 0
      ? null
      : `${homeDomain}/api/album/zip/${album.identifier}?v=${album.editedAt}`,
    editedAt: album.editedAt,
    url: `${homeDomain}/a/${album.identifier}`,
    totalSize,
    nojs: req.query.nojs !== undefined
  })
})

module.exports = routes
