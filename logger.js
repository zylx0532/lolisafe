const { inspect } = require('util')

const logger = {}

logger.clean = item => {
  if (typeof item === 'string') return item
  const cleaned = inspect(item, { depth: 0 })
  return cleaned
}

logger.write = (content, options = {}) => {
  const date = new Date().toISOString()
    .replace(/T/, ' ')
    .replace(/\..*/, '')
  const stream = options.error ? process.stderr : process.stdout
  stream.write(`[${date}]: ${options.prefix || ''}${logger.clean(content)}\n`)
}

logger.log = logger.write

logger.error = (content, options = {}) => {
  options.error = true
  logger.write(content, options)
}

module.exports = logger
