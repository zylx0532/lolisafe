const config = require('./../config')
const db = require('knex')(config.database)
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const gm = require('gm')
const path = require('path')

const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

const utilsController = {}
const uploadsDir = path.join(__dirname, '..', config.uploads.folder)
const thumbsDir = path.join(uploadsDir, 'thumbs')

utilsController.imageExtensions = ['.webp', '.jpg', '.jpeg', '.bmp', '.gif', '.png']
utilsController.videoExtensions = ['.webm', '.mp4', '.wmv', '.avi', '.mov', '.mkv']

utilsController.mayGenerateThumb = extname => {
  return (config.uploads.generateThumbnails.image && utilsController.imageExtensions.includes(extname)) ||
    (config.uploads.generateThumbnails.video && utilsController.videoExtensions.includes(extname))
}

utilsController.getPrettyDate = date => {
  return date.getFullYear() + '-' +
    (date.getMonth() + 1) + '-' +
    date.getDate() + ' ' +
    (date.getHours() < 10 ? '0' : '') +
    date.getHours() + ':' +
    (date.getMinutes() < 10 ? '0' : '') +
    date.getMinutes() + ':' +
    (date.getSeconds() < 10 ? '0' : '') +
    date.getSeconds()
}

utilsController.getPrettyBytes = num => {
  // MIT License
  // Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
  if (!Number.isFinite(num)) { return num }

  const neg = num < 0
  if (neg) { num = -num }
  if (num < 1) { return (neg ? '-' : '') + num + ' B' }

  const exponent = Math.min(Math.floor(Math.log10(num) / 3), units.length - 1)
  const numStr = Number((num / Math.pow(1000, exponent)).toPrecision(3))
  const unit = units[exponent]

  return (neg ? '-' : '') + numStr + ' ' + unit
}

utilsController.authorize = async (req, res) => {
  const token = req.headers.token
  if (token === undefined) {
    res.status(401).json({ success: false, description: 'No token provided.' })
    return
  }

  const user = await db.table('users').where('token', token).first()
  if (user) { return user }

  res.status(401).json({ success: false, description: 'Invalid token.' })
}

utilsController.generateThumbs = (file, basedomain) => {
  const extname = path.extname(file.name).toLowerCase()
  if (!utilsController.mayGenerateThumb(extname)) { return }

  const thumbname = path.join(thumbsDir, file.name.slice(0, -extname.length) + '.png')
  fs.access(thumbname, error => {
    // Only make thumbnail if it does not exist (ENOENT)
    if (!error || error.code !== 'ENOENT') { return }

    // If image extension
    if (utilsController.imageExtensions.includes(extname)) {
      const size = { width: 200, height: 200 }
      return gm(path.join(__dirname, '..', config.uploads.folder, file.name))
        .resize(size.width, size.height + '>')
        .gravity('Center')
        .extent(size.width, size.height)
        .background('transparent')
        .write(thumbname, error => {
          if (error) { console.log('Error - ', error) }
        })
    }

    // Otherwise video extension
    ffmpeg(path.join(__dirname, '..', config.uploads.folder, file.name))
      .thumbnail({
        timestamps: ['1%'],
        filename: '%b.png',
        folder: path.join(__dirname, '..', config.uploads.folder, 'thumbs'),
        size: '200x?'
      })
      .on('error', error => console.log('Error - ', error.message))
  })
}

utilsController.deleteFile = file => {
  return new Promise((resolve, reject) => {
    const extname = path.extname(file).toLowerCase()
    return fs.unlink(path.join(uploadsDir, file), error => {
      if (error && error.code !== 'ENOENT') { return reject(error) }

      if (utilsController.imageExtensions.includes(extname) || utilsController.videoExtensions.includes(extname)) {
        const thumb = file.substr(0, file.lastIndexOf('.')) + '.png'
        return fs.unlink(path.join(thumbsDir, thumb), error => {
          if (error && error.code !== 'ENOENT') { return reject(error) }
          resolve(true)
        })
      }
      resolve(true)
    })
  })
}

// This will return an array of IDs that could not be deleted
utilsController.bulkDeleteFilesByIds = async (ids, user) => {
  if (!user) { return }
  const files = await db.table('files')
    .whereIn('id', ids)
    .where(function () {
      if (user.username !== 'root') {
        this.where('userid', user.id)
      }
    })

  const failedids = ids.filter(id => !files.find(file => file.id === id))
  const albumids = []

  // Delete all files
  await Promise.all(files.map(file => {
    return new Promise(async resolve => {
      const deleteFile = await utilsController.deleteFile(file.name)
        .catch(error => {
          console.log(error)
          failedids.push(file.id)
        })
      if (!deleteFile) { return resolve() }

      await db.table('files')
        .where('id', file.id)
        .del()
        .then(() => {
          if (file.albumid && !albumids.includes(file.albumid)) {
            albumids.push(file.albumid)
          }
        })
        .catch(error => {
          console.error(error)
          failedids.push(file.id)
        })

      return resolve()
    })
  }))

  // Update albums if necessary
  if (albumids.length) {
    await Promise.all(albumids.map(albumid => {
      return db.table('albums')
        .where('id', albumid)
        .update('editedAt', Math.floor(Date.now() / 1000))
    }))
  }

  return failedids
}

module.exports = utilsController
