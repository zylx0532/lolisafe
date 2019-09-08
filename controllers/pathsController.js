const { promisify } = require('util')
const config = require('./../config')
const fs = require('fs')
const logger = require('./../logger')
const path = require('path')

const self = {}

// Promisify these fs functions
const fsFuncs = [
  'access',
  'lstat',
  'mkdir',
  'readdir',
  'readFile',
  'rename',
  'rmdir',
  'symlink',
  'unlink'
]

for (const fsFunc of fsFuncs)
  self[fsFunc] = promisify(fs[fsFunc])

self.uploads = path.resolve(config.uploads.folder)
self.chunks = path.join(self.uploads, 'chunks')
self.thumbs = path.join(self.uploads, 'thumbs')
self.zips = path.join(self.uploads, 'zips')

self.thumbPlaceholder = path.resolve(config.uploads.generateThumbs.placeholder || 'public/images/unavailable.png')

self.logs = path.resolve(config.logsFolder)

self.customPages = path.resolve('pages/custom')
self.public = path.resolve('public')

self.errorRoot = path.resolve(config.errorPages.rootDir)

const verify = [
  self.uploads,
  self.chunks,
  self.thumbs,
  self.zips,
  self.logs,
  self.customPages
]

self.init = async () => {
  try {
    for (const p of verify)
      try {
        await self.access(p)
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.error(err)
        } else {
          const mkdir = await self.mkdir(p)
          if (mkdir)
            logger.log(`Created directory: ${p}`)
        }
      }

    // Purge chunks directory
    const uuidDirs = await self.readdir(self.chunks)
    for (const uuid of uuidDirs) {
      const root = path.join(self.chunks, uuid)
      const chunks = await self.readdir(root)
      for (const chunk of chunks)
        await self.unlink(path.join(root, chunk))
      await self.rmdir(root)
    }

    self.verified = true
  } catch (error) {
    logger.error(error)
  }
}

module.exports = self
