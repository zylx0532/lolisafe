const bcrypt = require('bcrypt')
const config = require('./../config')
const db = require('knex')(config.database)
const perms = require('./permissionController')
const randomstring = require('randomstring')
const utils = require('./utilsController')

const authController = {}

authController.verify = async (req, res, next) => {
  const username = req.body.username
  const password = req.body.password

  if (username === undefined) return res.json({ success: false, description: 'No username provided.' })
  if (password === undefined) return res.json({ success: false, description: 'No password provided.' })

  const user = await db.table('users').where('username', username).first()
  if (!user)
    return res.json({ success: false, description: 'Username doesn\'t exist.' })

  if (user.enabled === false || user.enabled === 0)
    return res.json({ success: false, description: 'This account has been disabled.' })

  bcrypt.compare(password, user.password, (error, result) => {
    if (error) {
      console.error(error)
      return res.json({ success: false, description: 'There was an error.' })
    }
    if (result === false) return res.json({ success: false, description: 'Wrong password.' })
    return res.json({ success: true, token: user.token })
  })
}

authController.register = async (req, res, next) => {
  if (config.enableUserAccounts === false)
    return res.json({ success: false, description: 'Register is disabled at the moment.' })

  const username = req.body.username
  const password = req.body.password

  if (username === undefined) return res.json({ success: false, description: 'No username provided.' })
  if (password === undefined) return res.json({ success: false, description: 'No password provided.' })

  if (username.length < 4 || username.length > 32)
    return res.json({ success: false, description: 'Username must have 4-32 characters.' })

  if (password.length < 6 || password.length > 64)
    return res.json({ success: false, description: 'Password must have 6-64 characters.' })

  const user = await db.table('users').where('username', username).first()
  if (user) return res.json({ success: false, description: 'Username already exists.' })

  bcrypt.hash(password, 10, async (error, hash) => {
    if (error) {
      console.error(error)
      return res.json({ success: false, description: 'Error generating password hash (╯°□°）╯︵ ┻━┻.' })
    }
    const token = randomstring.generate(64)
    await db.table('users').insert({
      username,
      password: hash,
      token,
      enabled: 1,
      permission: perms.permissions.user
    })
    utils.invalidateStatsCache('users')
    return res.json({ success: true, token })
  })
}

authController.changePassword = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const password = req.body.password
  if (password === undefined) return res.json({ success: false, description: 'No password provided.' })

  if (password.length < 6 || password.length > 64)
    return res.json({ success: false, description: 'Password must have 6-64 characters.' })

  bcrypt.hash(password, 10, async (error, hash) => {
    if (error) {
      console.error(error)
      return res.json({ success: false, description: 'Error generating password hash (╯°□°）╯︵ ┻━┻.' })
    }

    await db.table('users')
      .where('id', user.id)
      .update('password', hash)

    return res.json({ success: true })
  })
}

authController.getFileLengthConfig = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return
  return res.json({
    success: true,
    fileLength: user.fileLength,
    config: config.uploads.fileLength
  })
}

authController.changeFileLength = async (req, res, next) => {
  if (config.uploads.fileLength.userChangeable === false)
    return res.json({
      success: false,
      description: 'Changing file name length is disabled at the moment.'
    })

  const user = await utils.authorize(req, res)
  if (!user) return

  const fileLength = parseInt(req.body.fileLength)
  if (fileLength === undefined)
    return res.json({
      success: false,
      description: 'No file name length provided.'
    })

  if (isNaN(fileLength))
    return res.json({
      success: false,
      description: 'File name length is not a valid number.'
    })

  if (fileLength < config.uploads.fileLength.min || fileLength > config.uploads.fileLength.max)
    return res.json({
      success: false,
      description: `File name length must be ${config.uploads.fileLength.min} to ${config.uploads.fileLength.max} characters.`
    })

  if (fileLength === user.fileLength)
    return res.json({ success: true })

  await db.table('users')
    .where('id', user.id)
    .update('fileLength', fileLength)

  return res.json({ success: true })
}

authController.editUser = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const id = parseInt(req.body.id)
  if (isNaN(id))
    return res.json({ success: false, description: 'No user specified.' })

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
    update.username = `${req.body.username}`
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

  await db.table('users')
    .where('id', id)
    .update(update)
  utils.invalidateStatsCache('users')

  if (!req.body.resetPassword)
    return res.json({ success: true, update })

  const password = randomstring.generate(16)
  bcrypt.hash(password, 10, async (error, hash) => {
    if (error) {
      console.error(error)
      return res.json({ success: false, description: 'Error generating password hash (╯°□°）╯︵ ┻━┻.' })
    }

    await db.table('users')
      .where('id', id)
      .update('password', hash)

    return res.json({ success: true, update, password })
  })
}

authController.disableUser = async (req, res, next) => {
  const body = {
    id: req.body.id,
    enabled: false
  }
  req.body = body
  return authController.editUser(req, res, next)
}

authController.listUsers = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const isadmin = perms.is(user, 'admin')
  if (!isadmin) return res.status(403).end()

  const count = await db.table('users')
    .count('id as count')
    .then(rows => rows[0].count)
  if (!count) return res.json({ success: true, users: [], count })

  let offset = req.params.page
  if (offset === undefined) offset = 0

  const users = await db.table('users')
    .limit(25)
    .offset(25 * offset)
    .select('id', 'username', 'enabled', 'fileLength', 'permission')

  const userids = []

  for (const user of users) {
    user.groups = perms.mapPermissions(user)
    delete user.permission

    userids.push(user.id)
    user.uploadsCount = 0
    user.diskUsage = 0
  }

  const maps = {}
  const uploads = await db.table('files').whereIn('userid', userids)

  for (const upload of uploads) {
    // This is the fastest method that I can think of
    if (maps[upload.userid] === undefined)
      maps[upload.userid] = {
        count: 0,
        size: 0
      }

    maps[upload.userid].count++
    maps[upload.userid].size += parseInt(upload.size)
  }

  for (const user of users) {
    if (!maps[user.id]) continue
    user.uploadsCount = maps[user.id].count
    user.diskUsage = maps[user.id].size
  }

  return res.json({ success: true, users, count })
}

module.exports = authController
