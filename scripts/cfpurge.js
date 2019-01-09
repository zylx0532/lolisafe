// This is sorta no longer in use since lolisafe.js will do this automatically
// everytime is launches.

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

  const filenames = args.length ? args : config.pages.concat(['api/check'])
  const result = await utils.purgeCloudflareCache(filenames, Boolean(args.length))
  if (result.errors.length)
    return result.errors.forEach(error => console.error(`CF: ${error}`))
  else
    console.log(`URLs:\n${result.files.join('\n')}\n\nSuccess: ${result.success}`)
}

cfpurge.do()
