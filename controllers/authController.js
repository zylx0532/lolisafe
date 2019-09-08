const { promisify } = require('util')
const bcrypt = require('bcrypt')
const config = require('./../config')
const db = require('knex')(config.database)
const logger = require('./../logger')
const perms = require('./permissionController')
const randomstring = require('randomstring')
const tokens = require('./tokenController')
const utils = require('./utilsController')

const self = {
  compare: promisify(bcrypt.compare),
  hash: promisify(bcrypt.hash)
}

self.verify = async (req, res, next) => {
  const username = typeof req.body.username === 'string'
    ? req.body.username.trim()
    : ''
  if (!username)
    return res.json({ success: false, description: 'No username provided.' })

  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (!password)
    return res.json({ success: false, description: 'No password provided.' })

  try {
    const user = await db.table('users')
      .where('username', username)
      .first()

    if (!user)
      return res.json({ success: false, description: 'Username does not exist.' })

    if (user.enabled === false || user.enabled === 0)
      return res.json({ success: false, description: 'This account has been disabled.' })

    const result = await self.compare(password, user.password)
    if (result === false)
      return res.json({ success: false, description: 'Wrong password.' })
    else
      return res.json({ success: true, token: user.token })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.register = async (req, res, next) => {
  if (config.enableUserAccounts === false)
    return res.json({ success: false, description: 'Registration is currently disabled.' })

  const username = typeof req.body.username === 'string'
    ? req.body.username.trim()
    : ''
  if (username.length < 4 || username.length > 32)
    return res.json({ success: false, description: 'Username must have 4-32 characters.' })

  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (password.length < 6 || password.length > 64)
    return res.json({ success: false, description: 'Password must have 6-64 characters.' })

  try {
    const user = await db.table('users')
      .where('username', username)
      .first()

    if (user)
      return res.json({ success: false, description: 'Username already exists.' })

    const hash = await self.hash(password, 10)

    const token = await tokens.generateUniqueToken()
    if (!token)
      return res.json({ success: false, description: 'Sorry, we could not allocate a unique token. Try again?' })

    await db.table('users')
      .insert({
        username,
        password: hash,
        token,
        enabled: 1,
        permission: perms.permissions.user
      })
    utils.invalidateStatsCache('users')
    token.onHold.delete(token)

    return res.json({ success: true, token })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.changePassword = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (password.length < 6 || password.length > 64)
    return res.json({ success: false, description: 'Password must have 6-64 characters.' })

  try {
    const hash = await self.hash(password, 10)

    await db.table('users')
      .where('id', user.id)
      .update('password', hash)

    return res.json({ success: true })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.editUser = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const id = parseInt(req.body.id)
  if (isNaN(id))
    return res.json({ success: false, description: 'No user specified.' })

  try {
    const target = await db.table('users')
      .where('id', id)
      .first()

    if (!target)
      return res.json({ success: false, description: 'Could not get user with the specified ID.' })
    else if (!perms.higher(user, target))
      return res.json({ success: false, description: 'The user is in the same or higher group as you.' })
    else if (target.username === 'root')
      return res.json({ success: false, description: 'Root user may not be edited.' })

    const update = {}

    if (req.body.username !== undefined) {
      update.username = String(req.body.username).trim()
      if (update.username.length < 4 || update.username.length > 32)
        return res.json({ success: false, description: 'Username must have 4-32 characters.' })
    }

    if (req.body.enabled !== undefined)
      update.enabled = Boolean(req.body.enabled)

    if (req.body.group !== undefined) {
      update.permission = perms.permissions[req.body.group] || target.permission
      if (typeof update.permission !== 'number' || update.permission < 0)
        update.permission = target.permission
    }

    let password
    if (req.body.resetPassword) {
      password = randomstring.generate(16)
      update.password = await self.hash(password, 10)
    }

    await db.table('users')
      .where('id', id)
      .update(update)
    utils.invalidateStatsCache('users')

    const response = { success: true, update }
    if (password) response.password = password
    return res.json(response)
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.disableUser = async (req, res, next) => {
  req.body = { id: req.body.id, enabled: false }
  return self.editUser(req, res, next)
}

self.listUsers = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const isadmin = perms.is(user, 'admin')
  if (!isadmin)
    return res.status(403).end()

  try {
    const count = await db.table('users')
      .count('id as count')
      .then(rows => rows[0].count)
    if (!count)
      return res.json({ success: true, users: [], count })

    let offset = req.params.page
    if (offset === undefined) offset = 0

    const users = await db.table('users')
      .limit(25)
      .offset(25 * offset)
      .select('id', 'username', 'enabled', 'permission')

    const userids = []

    for (const user of users) {
      user.groups = perms.mapPermissions(user)
      delete user.permission

      userids.push(user.id)
      user.uploadsCount = 0
      user.diskUsage = 0
    }

    const maps = {}
    const uploads = await db.table('files')
      .whereIn('userid', userids)

    for (const upload of uploads) {
      if (maps[upload.userid] === undefined)
        maps[upload.userid] = { count: 0, size: 0 }

      maps[upload.userid].count++
      maps[upload.userid].size += parseInt(upload.size)
    }

    for (const user of users) {
      if (!maps[user.id]) continue
      user.uploadsCount = maps[user.id].count
      user.diskUsage = maps[user.id].size
    }

    return res.json({ success: true, users, count })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

module.exports = self
