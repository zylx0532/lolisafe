const config = require('./../config')
const db = require('knex')(config.database)
const perms = require('./../controllers/permissionController')

const map = {
  albums: {
    editedAt: 'integer',
    zipGeneratedAt: 'integer',
    download: 'integer',
    public: 'integer',
    description: 'string'
  },
  users: {
    enabled: 'integer',
    fileLength: 'integer',
    permission: 'integer'
  }
}

const migration = {}
migration.start = async () => {
  const tables = Object.keys(map)
  await Promise.all(tables.map(table => {
    const columns = Object.keys(map[table])
    return Promise.all(columns.map(async column => {
      if (await db.schema.hasColumn(table, column))
        return // console.log(`SKIP: ${column} => ${table}.`)

      const columnType = map[table][column]
      return db.schema.table(table, t => { t[columnType](column) })
        .then(() => console.log(`OK: ${column} (${columnType}) => ${table}.`))
        .catch(console.error)
    }))
  }))

  await db.table('users')
    .where('username', 'root')
    .first()
    .update({
      permission: perms.permissions.superadmin
    })
    .then(rows => {
      // NOTE: permissionController.js actually have a hard-coded check for "root" account so that
      // it will always have "superadmin" permission regardless of its permission value in database
      if (!rows) return console.log('Unable to update root\'s permission into superadmin.')
      console.log(`Updated root's permission to ${perms.permissions.superadmin} (superadmin).`)
    })

  console.log('Migration finished! Now you may start lolisafe normally.')
  process.exit(0)
}

migration.start()
