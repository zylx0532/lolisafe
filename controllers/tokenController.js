const config = require('./../config')
const db = require('knex')(config.database)
const perms = require('./permissionController')
const randomstring = require('randomstring')
const utils = require('./utilsController')

const TOKEN_LENGTH = 64
const UNIQUE_TOKEN_MAX_TRIES = 3

const tokenController = {}

tokenController.generateUniqueToken = () => {
  return new Promise(resolve => {
    const query = async i => {
      const token = randomstring.generate(TOKEN_LENGTH)
      const user = await db.table('users').where('token', token).first().catch(() => undefined)
      if (user === undefined) return resolve(token)
      if (++i < UNIQUE_TOKEN_MAX_TRIES) return query(i)
      resolve(null)
    }
    query(0)
  })
}

tokenController.verify = async (req, res, next) => {
  const token = req.body.token
  if (token === undefined)
    return res.status(401).json({
      success: false,
      description: 'No token provided.'
    })

  const user = await db.table('users').where('token', token).first()
  if (!user)
    return res.status(401).json({
      success: false,
      description: 'Invalid token.'
    })

  return res.json({
    success: true,
    username: user.username,
    permissions: perms.mapPermissions(user)
  })
}

tokenController.list = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return
  return res.json({
    success: true,
    token: user.token
  })
}

tokenController.change = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const newtoken = await tokenController.generateUniqueToken()
  if (!newtoken)
    return res.json({ success: false, description: 'Error generating unique token (╯°□°）╯︵ ┻━┻.' })

  await db.table('users').where('token', user.token).update({
    token: newtoken,
    timestamp: Math.floor(Date.now() / 1000)
  })
  return res.json({
    success: true,
    token: newtoken
  })
}

module.exports = tokenController
