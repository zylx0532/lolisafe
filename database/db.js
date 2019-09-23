const randomstring = require('randomstring')
const perms = require('./../controllers/permissionController')
const logger = require('./../logger')

const init = function (db) {
  // Create the tables we need to store galleries and files
  db.schema.hasTable('albums').then(exists => {
    if (exists) return
    db.schema.createTable('albums', function (table) {
      table.increments()
      table.integer('userid')
      table.string('name')
      table.string('identifier')
      table.integer('enabled')
      table.integer('timestamp')
      table.integer('editedAt')
      table.integer('zipGeneratedAt')
      table.integer('download')
      table.integer('public')
      table.string('description')
    }).then(() => {})
  })

  db.schema.hasTable('files').then(exists => {
    if (exists) return
    db.schema.createTable('files', function (table) {
      table.increments()
      table.integer('userid')
      table.string('name')
      table.string('original')
      table.string('type')
      table.string('size')
      table.string('hash')
      table.string('ip')
      table.integer('albumid')
      table.integer('timestamp')
      table.integer('expirydate')
    }).then(() => {})
  })

  db.schema.hasTable('users').then(exists => {
    if (exists) return
    db.schema.createTable('users', function (table) {
      table.increments()
      table.string('username')
      table.string('password')
      table.string('token')
      table.integer('enabled')
      table.integer('timestamp')
      table.integer('permission')
    }).then(() => {
      db.table('users').where({ username: 'root' }).then((user) => {
        if (user.length > 0) return
        require('bcrypt').hash('root', 10, function (error, hash) {
          if (error) logger.error('Error generating password hash for root')
          db.table('users').insert({
            username: 'root',
            password: hash,
            token: randomstring.generate(64),
            timestamp: Math.floor(Date.now() / 1000),
            permission: perms.permissions.superadmin
          }).then(() => {})
        })
      })
    })
  })
}

module.exports = init
