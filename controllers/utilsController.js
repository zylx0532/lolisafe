const { spawn } = require('child_process')
const config = require('./../config')
const db = require('knex')(config.database)
const fetch = require('node-fetch')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const os = require('os')
const path = require('path')
const perms = require('./permissionController')
const sharp = require('sharp')

const utilsController = {}
const _stats = {
  system: {
    cache: null,
    timestamp: 0
  },
  albums: {
    cache: null,
    valid: false
  },
  users: {
    cache: null,
    valid: false
  },
  uploads: {
    cache: null,
    valid: false
  }
}

const uploadsDir = path.join(__dirname, '..', config.uploads.folder)
const thumbsDir = path.join(uploadsDir, 'thumbs')
const thumbUnavailable = path.join(__dirname, '../public/images/unavailable.png')
const cloudflareAuth = config.cloudflare.apiKey && config.cloudflare.email && config.cloudflare.zoneId

utilsController.imageExtensions = ['.webp', '.jpg', '.jpeg', '.gif', '.png', '.tiff', '.tif', '.svg']
utilsController.videoExtensions = ['.webm', '.mp4', '.wmv', '.avi', '.mov', '.mkv']

utilsController.mayGenerateThumb = extname => {
  return (config.uploads.generateThumbs.image && utilsController.imageExtensions.includes(extname)) ||
    (config.uploads.generateThumbs.video && utilsController.videoExtensions.includes(extname))
}

// expand if necessary (must be lower case); for now only preserves some known tarballs
utilsController.preserves = ['.tar.gz', '.tar.z', '.tar.bz2', '.tar.lzma', '.tar.lzo', '.tar.xz']

utilsController.extname = filename => {
  // Always return blank string if the filename does not seem to have a valid extension
  // Files such as .DS_Store (anything that starts with a dot, without any extension after) will still be accepted
  if (!/\../.test(filename)) return ''

  let lower = filename.toLowerCase() // due to this, the returned extname will always be lower case
  let multi = ''
  let extname = ''

  // check for multi-archive extensions (.001, .002, and so on)
  if (/\.\d{3}$/.test(lower)) {
    multi = lower.slice(lower.lastIndexOf('.') - lower.length)
    lower = lower.slice(0, lower.lastIndexOf('.'))
  }

  // check against extensions that must be preserved
  for (let i = 0; i < utilsController.preserves.length; i++)
    if (lower.endsWith(utilsController.preserves[i])) {
      extname = utilsController.preserves[i]
      break
    }

  if (!extname)
    extname = lower.slice(lower.lastIndexOf('.') - lower.length) // path.extname(lower)

  return extname + multi
}

utilsController.escape = string => {
  // MIT License
  // Copyright(c) 2012-2013 TJ Holowaychuk
  // Copyright(c) 2015 Andreas Lubbe
  // Copyright(c) 2015 Tiancheng "Timothy" Gu

  if (!string) return string

  const str = '' + string
  const match = /["'&<>]/.exec(str)

  if (!match) return str

  let escape
  let html = ''
  let index = 0
  let lastIndex = 0

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;'
        break
      case 38: // &
        escape = '&amp;'
        break
      case 39: // '
        escape = '&#39;'
        break
      case 60: // <
        escape = '&lt;'
        break
      case 62: // >
        escape = '&gt;'
        break
      default:
        continue
    }

    if (lastIndex !== index)
      html += str.substring(lastIndex, index)

    lastIndex = index + 1
    html += escape
  }

  return lastIndex !== index
    ? html + str.substring(lastIndex, index)
    : html
}

utilsController.authorize = async (req, res) => {
  const token = req.headers.token
  if (token === undefined) {
    res.status(401).json({ success: false, description: 'No token provided.' })
    return
  }

  const user = await db.table('users').where('token', token).first()
  if (user) {
    if (user.enabled === false || user.enabled === 0) {
      res.json({ success: false, description: 'This account has been disabled.' })
      return
    }
    return user
  }

  res.status(401).json({
    success: false,
    description: 'Invalid token.'
  })
}

utilsController.generateThumbs = (name, force) => {
  return new Promise(resolve => {
    const extname = utilsController.extname(name)
    const thumbname = path.join(thumbsDir, name.slice(0, -extname.length) + '.png')
    fs.lstat(thumbname, async (error, stats) => {
      if (error && error.code !== 'ENOENT') {
        console.error(error)
        return resolve(false)
      }

      if (!error && stats.isSymbolicLink()) {
        // Unlink symlink
        const unlink = await new Promise((resolve, reject) => {
          fs.unlink(thumbname, error => {
            if (error) return reject(error)
            return resolve(true)
          })
        }).catch(console.error)
        if (!unlink) return resolve(false)
      }

      // Only make thumbnail if it does not exist (ENOENT)
      if (!error && !stats.isSymbolicLink() && !force) return resolve(true)

      // Full path to input file
      const input = path.join(__dirname, '..', config.uploads.folder, name)

      new Promise((resolve, reject) => {
        // If image extension
        if (utilsController.imageExtensions.includes(extname)) {
          const resizeOptions = {
            width: 200,
            height: 200,
            fit: 'contain',
            background: {
              r: 0,
              g: 0,
              b: 0,
              alpha: 0
            }
          }
          const image = sharp(input)
          return image
            .metadata()
            .then(metadata => {
              if (metadata.width > resizeOptions.width || metadata.height > resizeOptions.height) {
                return image
                  .resize(resizeOptions)
                  .toFile(thumbname)
              } else if (metadata.width === resizeOptions.width && metadata.height === resizeOptions.height) {
                return image
                  .toFile(thumbname)
              } else {
                const x = resizeOptions.width - metadata.width
                const y = resizeOptions.height - metadata.height
                return image
                  .extend({
                    top: Math.floor(y / 2),
                    bottom: Math.ceil(y / 2),
                    left: Math.floor(x / 2),
                    right: Math.ceil(x / 2),
                    background: resizeOptions.background
                  })
                  .toFile(thumbname)
              }
            })
            .then(() => resolve(true))
            .catch(reject)
        }

        // Otherwise video extension
        ffmpeg.ffprobe(input, (error, metadata) => {
          if (error) return reject(error)
          ffmpeg(input)
            .inputOptions([
              `-ss ${parseInt(metadata.format.duration) * 20 / 100}`
            ])
            .output(thumbname)
            .outputOptions([
              '-vframes 1',
              '-vf scale=200:200:force_original_aspect_ratio=decrease'
            ])
            .on('error', reject)
            .on('end', () => resolve(true))
            .run()
        })
      })
        .then(resolve)
        .catch(error => {
          console.error(`${name}: ${error.toString()}`)
          fs.symlink(thumbUnavailable, thumbname, error => {
            if (error) console.error(error)
            resolve(!error)
          })
        })
    })
  })
}

utilsController.deleteFile = (filename, set) => {
  return new Promise((resolve, reject) => {
    const extname = utilsController.extname(filename)
    return fs.unlink(path.join(uploadsDir, filename), error => {
      if (error && error.code !== 'ENOENT') return reject(error)
      const identifier = filename.split('.')[0]
      // eslint-disable-next-line curly
      if (set) {
        set.delete(identifier)
        // console.log(`Removed ${identifier} from identifiers cache (deleteFile)`)
      }
      if (utilsController.imageExtensions.includes(extname) || utilsController.videoExtensions.includes(extname)) {
        const thumb = `${identifier}.png`
        return fs.unlink(path.join(thumbsDir, thumb), error => {
          if (error && error.code !== 'ENOENT') return reject(error)
          resolve(true)
        })
      }
      resolve(true)
    })
  })
}

utilsController.bulkDeleteFiles = async (field, values, user, set) => {
  if (!user || !['id', 'name'].includes(field)) return

  // SQLITE_LIMIT_VARIABLE_NUMBER, which defaults to 999
  // Read more: https://www.sqlite.org/limits.html
  const MAX_VARIABLES_CHUNK_SIZE = 999
  const chunks = []
  const _values = values.slice() // Make a shallow copy of the array
  while (_values.length)
    chunks.push(_values.splice(0, MAX_VARIABLES_CHUNK_SIZE))

  const failed = []
  const ismoderator = perms.is(user, 'moderator')
  await Promise.all(chunks.map((chunk, index) => {
    return new Promise(async (resolve, reject) => {
      const files = await db.table('files')
        .whereIn(field, chunk)
        .where(function () {
          if (!ismoderator)
            this.where('userid', user.id)
        })
        .catch(reject)

      // Push files that could not be found in DB
      failed.push.apply(failed, chunk.filter(v => !files.find(file => file[field] === v)))

      // Delete all found files physically
      const deletedFiles = []
      await Promise.all(files.map(file =>
        utilsController.deleteFile(file.name)
          .then(() => deletedFiles.push(file))
          .catch(error => {
            failed.push(file[field])
            console.error(error)
          })
      ))

      if (!deletedFiles.length)
        return resolve()

      // Delete all found files from database
      const deletedFromDb = await db.table('files')
        .whereIn('id', deletedFiles.map(file => file.id))
        .del()
        .catch(reject)

      if (set)
        deletedFiles.forEach(file => {
          const identifier = file.name.split('.')[0]
          set.delete(identifier)
          // console.log(`Removed ${identifier} from identifiers cache (bulkDeleteFiles)`)
        })

      // Update albums if necessary
      if (deletedFromDb) {
        const albumids = []
        deletedFiles.forEach(file => {
          if (file.albumid && !albumids.includes(file.albumid))
            albumids.push(file.albumid)
        })
        await db.table('albums')
          .whereIn('id', albumids)
          .update('editedAt', Math.floor(Date.now() / 1000))
          .catch(console.error)
      }

      // Purge Cloudflare's cache if necessary
      if (config.cloudflare.purgeCache)
        utilsController.purgeCloudflareCache(deletedFiles.map(file => file.name), true, true)
          .then(results => {
            for (const result of results)
              if (result.errors.length)
                result.errors.forEach(error => console.error(`CF: ${error}`))
          })

      return resolve()
    }).catch(console.error)
  }))
  return failed
}

utilsController.purgeCloudflareCache = async (names, uploads, thumbs) => {
  if (!Array.isArray(names) || !names.length || !cloudflareAuth)
    return [{
      success: false,
      files: [],
      errors: ['An unexpected error occured.']
    }]

  let domain = config.domain
  if (!uploads) domain = config.homeDomain

  const thumbNames = []
  names = names.map(name => {
    if (uploads) {
      const url = `${domain}/${name}`
      const extname = utilsController.extname(name)
      if (thumbs && utilsController.mayGenerateThumb(extname))
        thumbNames.push(`${domain}/thumbs/${name.slice(0, -extname.length)}.png`)
      return url
    } else {
      return name === 'home' ? domain : `${domain}/${name}`
    }
  })
  names = names.concat(thumbNames)

  // Split array into multiple arrays with max length of 30 URLs
  // https://api.cloudflare.com/#zone-purge-files-by-url
  const MAX_LENGTH = 30
  const files = []
  while (names.length)
    files.push(names.splice(0, MAX_LENGTH))

  const url = `https://api.cloudflare.com/client/v4/zones/${config.cloudflare.zoneId}/purge_cache`
  const results = []
  await new Promise(resolve => {
    const purge = async i => {
      const result = {
        success: false,
        files: files[i],
        errors: []
      }

      try {
        const fetchPurge = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            files: result.files
          }),
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Email': config.cloudflare.email,
            'X-Auth-Key': config.cloudflare.apiKey
          }
        }).then(res => res.json())
        result.success = fetchPurge.success
        if (Array.isArray(fetchPurge.errors) && fetchPurge.errors.length)
          result.errors = fetchPurge.errors.map(error => `${error.code}: ${error.message}`)
      } catch (error) {
        result.errors = [error.toString()]
      }

      results.push(result)

      if (i < files.length - 1)
        purge(i + 1)
      else
        resolve()
    }
    purge(0)
  })

  return results
}

utilsController.getMemoryUsage = () => {
  // For now this is linux-only. Not sure if darwin has this too.
  return new Promise((resolve, reject) => {
    const prc = spawn('free', ['-b'])
    prc.stdout.setEncoding('utf8')
    prc.stdout.on('data', data => {
      const parsed = {}
      const str = data.toString()
      const lines = str.split(/\n/g)
      for (let i = 0; i < lines.length; i++) {
        lines[i] = lines[i].split(/\s+/)
        if (i === 0) continue
        const id = lines[i][0].toLowerCase().slice(0, -1)
        if (!id) continue
        if (!parsed[id]) parsed[id] = {}
        for (let j = 1; j < lines[i].length; j++) {
          const bytes = parseInt(lines[i][j])
          parsed[id][lines[0][j]] = isNaN(bytes) ? null : bytes
        }
      }
      resolve(parsed)
    })
    prc.on('close', code => {
      reject(new Error(`Process exited with code ${code}.`))
    })
  })
}

utilsController.invalidateStatsCache = type => {
  if (!['albums', 'users', 'uploads'].includes(type)) return
  _stats[type].cache = null
  _stats[type].valid = false
}

utilsController.stats = async (req, res, next) => {
  const user = await utilsController.authorize(req, res)
  if (!user) return

  const isadmin = perms.is(user, 'admin')
  if (!isadmin) return res.status(403).end()

  const stats = {}

  // Re-use system cache for only 1000ms
  if (Date.now() - _stats.system.timestamp <= 1000) {
    stats.system = _stats.system.cache
  } else {
    const platform = os.platform()
    stats.system = {
      platform: `${platform}-${os.arch()}`,
      systemMemory: null,
      nodeVersion: `${process.versions.node}`,
      memoryUsage: process.memoryUsage().rss
    }

    if (platform === 'linux') {
      const memoryUsage = await utilsController.getMemoryUsage()
      stats.system.systemMemory = {
        used: memoryUsage.mem.used,
        total: memoryUsage.mem.total
      }
    } else {
      delete stats.system.systemMemory
    }

    if (platform !== 'win32')
      stats.system.loadAverage = `${os.loadavg().map(load => load.toFixed(2)).join(', ')}`

    // Cache
    _stats.system = {
      cache: stats.system,
      timestamp: Date.now()
    }
  }

  // Re-use albums, users, and uploads caches as long as they are still valid

  if (_stats.albums.valid) {
    stats.albums = _stats.albums.cache
  } else {
    stats.albums = {
      total: 0,
      active: 0,
      downloadable: 0,
      public: 0,
      zips: 0
    }

    const albums = await db.table('albums')
    stats.albums.total = albums.length
    const identifiers = []
    for (const album of albums)
      if (album.enabled) {
        stats.albums.active++
        if (album.download) stats.albums.downloadable++
        if (album.public) stats.albums.public++
        if (album.zipGeneratedAt) identifiers.push(album.identifier)
      }

    const zipsDir = path.join(uploadsDir, 'zips')
    await Promise.all(identifiers.map(identifier => {
      return new Promise(resolve => {
        const filePath = path.join(zipsDir, `${identifier}.zip`)
        fs.access(filePath, error => {
          if (!error) stats.albums.zips++
          resolve(true)
        })
      })
    }))

    // Cache
    _stats.albums = {
      cache: stats.albums,
      valid: true
    }
  }

  if (_stats.users.valid) {
    stats.users = _stats.users.cache
  } else {
    stats.users = {
      total: 0,
      disabled: 0
    }

    const permissionKeys = Object.keys(perms.permissions)
    permissionKeys.forEach(p => {
      stats.users[p] = 0
    })

    const users = await db.table('users')
    stats.users.total = users.length
    for (const user of users) {
      if (user.enabled === false || user.enabled === 0)
        stats.users.disabled++

      // This may be inaccurate on installations with customized permissions
      user.permission = user.permission || 0
      for (const p of permissionKeys)
        if (user.permission === perms.permissions[p]) {
          stats.users[p]++
          break
        }
    }

    // Cache
    _stats.users = {
      cache: stats.users,
      valid: true
    }
  }

  if (_stats.uploads.valid) {
    stats.uploads = _stats.uploads.cache
  } else {
    stats.uploads = {
      total: 0,
      size: 0,
      images: 0,
      videos: 0,
      others: 0
    }

    const uploads = await db.table('files')
    stats.uploads.total = uploads.length
    for (const upload of uploads) {
      stats.uploads.size += parseInt(upload.size)
      const extname = utilsController.extname(upload.name)
      if (utilsController.imageExtensions.includes(extname))
        stats.uploads.images++
      else if (utilsController.videoExtensions.includes(extname))
        stats.uploads.videos++
      else
        stats.uploads.others++
    }

    // Cache
    _stats.uploads = {
      cache: stats.uploads,
      valid: true
    }
  }

  return res.json({ success: true, stats })
}

module.exports = utilsController
