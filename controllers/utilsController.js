const path = require('path')
const config = require('../config.js')
const fs = require('fs')
const gm = require('gm')
const ffmpeg = require('fluent-ffmpeg')
const db = require('knex')(config.database)

const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

const utilsController = {}
utilsController.imageExtensions = ['.jpg', '.jpeg', '.bmp', '.gif', '.png']
utilsController.videoExtensions = ['.webm', '.mp4', '.wmv', '.avi', '.mov']

utilsController.getPrettyDate = function (date) {
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

utilsController.getPrettyBytes = function (num) {
  // MIT License
  // Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
  if (!Number.isFinite(num)) return num

  const neg = num < 0
  if (neg) num = -num
  if (num < 1) return (neg ? '-' : '') + num + ' B'

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
  if (user) return user
  res.status(401).json({ success: false, description: 'Invalid token.' })
}

utilsController.generateThumbs = function (file, basedomain) {
  const ext = path.extname(file.name).toLowerCase()
  const isVideoExt = utilsController.videoExtensions.includes(ext)
  const isImageExt = utilsController.imageExtensions.includes(ext)

  if (!isVideoExt && !isImageExt) return
  if (isVideoExt && config.uploads.generateThumbnails.video !== true) return
  if (isImageExt && config.uploads.generateThumbnails.image !== true) return

  let thumbname = path.join(__dirname, '..', config.uploads.folder, 'thumbs', file.name.slice(0, -ext.length) + '.png')
  fs.access(thumbname, err => {
    if (err && err.code === 'ENOENT') {
      if (isVideoExt) {
        ffmpeg(path.join(__dirname, '..', config.uploads.folder, file.name))
          .thumbnail({
            timestamps: [0],
            filename: '%b.png',
            folder: path.join(__dirname, '..', config.uploads.folder, 'thumbs'),
            size: '200x?'
          })
          .on('error', error => console.log('Error - ', error.message))
      } else if (isImageExt) {
        let size = {
          width: 200,
          height: 200
        }
        gm(path.join(__dirname, '..', config.uploads.folder, file.name))
          .resize(size.width, size.height + '>')
          .gravity('Center')
          .extent(size.width, size.height)
          .background('transparent')
          .write(thumbname, error => {
            if (error) console.log('Error - ', error)
          })
      }
    }
  })
}

module.exports = utilsController
