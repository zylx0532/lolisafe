const { inspect } = require('util')

const self = {}

const clean = item => {
  if (typeof item === 'string') return item
  const cleaned = inspect(item, { depth: 0 })
  return cleaned
}

const write = (content, options = {}) => {
  const date = new Date().toISOString()
    .replace(/T/, ' ')
    .replace(/\..*/, '')
  const stream = options.error ? process.stderr : process.stdout
  stream.write(`[${date}]: ${options.prefix || ''}${clean(content)}\n`)
}

self.log = write

self.error = (content, options = {}) => {
  options.error = true
  write(content, options)
}

module.exports = self
