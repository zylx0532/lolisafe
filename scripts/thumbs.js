const { stripIndents } = require('./_utils')
const fs = require('fs')
const path = require('path')
const utils = require('./../controllers/utilsController')

const thumbs = {
  mode: null,
  force: null
}

thumbs.mayGenerateThumb = extname => {
  return ([1, 3].includes(thumbs.mode) && utils.imageExtensions.includes(extname)) ||
    ([2, 3].includes(thumbs.mode) && utils.videoExtensions.includes(extname))
}

thumbs.getFiles = directory => {
  return new Promise((resolve, reject) => {
    fs.readdir(directory, async (error, names) => {
      if (error) return reject(error)
      const files = []
      await Promise.all(names.map(name => {
        return new Promise((resolve, reject) => {
          fs.lstat(path.join(directory, name), (error, stats) => {
            if (error) return reject(error)
            if (stats.isFile() && !name.startsWith('.')) files.push(name)
            resolve()
          })
        })
      }))
      resolve(files)
    })
  })
}

thumbs.do = async () => {
  const location = process.argv[1].replace(process.cwd() + '/', '')
  const args = process.argv.slice(2)

  thumbs.mode = parseInt(args[0])
  thumbs.force = parseInt(args[1] || 0)
  thumbs.verbose = parseInt(args[2] || 0)
  if (![1, 2, 3].includes(thumbs.mode) ||
    ![0, 1].includes(thumbs.force) ||
    ![0, 1].includes(thumbs.verbose) ||
    args.includes('--help') ||
    args.includes('-h'))
    return console.log(stripIndents(`
      Generate thumbnails.

      Usage  :\nnode ${location} <mode=1|2|3> [force=0|1] [verbose=0|1]

      mode   : 1 = images only, 2 = videos only, 3 = both images and videos
      force  : 0 = no force (default), 1 = overwrite existing thumbnails
      verbose: 0 = only print missing thumbs (default), 1 = print all
    `))

  const uploadsDir = path.join(__dirname, '..', 'uploads')
  const thumbsDir = path.join(uploadsDir, 'thumbs')
  const _uploads = await thumbs.getFiles(uploadsDir)

  let _thumbs = await thumbs.getFiles(thumbsDir)
  _thumbs = _thumbs.map(_thumb => {
    const extname = path.extname(_thumb)
    return _thumb.slice(0, -extname.length)
  })

  let success = 0
  let error = 0
  let skipped = 0
  await new Promise((resolve, reject) => {
    const generate = async i => {
      const _upload = _uploads[i]
      if (!_upload) return resolve()

      const extname = path.extname(_upload)
      const basename = _upload.slice(0, -extname.length)

      if (_thumbs.includes(basename) && !thumbs.force) {
        if (thumbs.verbose) console.log(`${_upload}: thumb exists.`)
        skipped++
      } else if (!thumbs.mayGenerateThumb(extname)) {
        if (thumbs.verbose) console.log(`${_upload}: extension skipped.`)
        skipped++
      } else {
        const generated = await utils.generateThumbs(_upload, thumbs.force)
        console.log(`${_upload}: ${generated ? 'OK' : 'ERROR'}`)
        generated ? success++ : error++
      }
      return generate(i + 1)
    }
    return generate(0)
  })
  console.log(`Success: ${success}\nError: ${error}\nSkipped: ${skipped}`)
}

thumbs.do()
