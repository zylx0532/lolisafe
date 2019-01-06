const { stripIndents } = require('./_utils')
const utils = require('./../controllers/utilsController')
const config = require('./../config')

const cfpurge = {}

cfpurge.do = async () => {
  const location = process.argv[1].replace(process.cwd() + '/', '')
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h'))
    return console.log(stripIndents(`
      Purge Cloudflare's cache.

      Usage:\nnode ${location} [...filename]

      filename:
      File names (as in uploads) separated by space (will automatically include their thumbs if available).
      If not provided, this will default to frontend pages listed in "pages" array in config.js.
    `))

  const filenames = args.length ? args : config.pages
  return utils.purgeCloudflareCache(filenames, Boolean(args.length), true)
}

cfpurge.do()
