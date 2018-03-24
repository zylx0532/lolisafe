const config = require('../config.js')
const db = require('knex')(config.database)

const migration = {}
migration.start = async () => {
  await db.schema.table('albums', t => t.dateTime('editedAt')).catch(err => console.warn(err.message))
  await db.schema.table('albums', t => t.dateTime('zipGeneratedAt')).catch(err => console.warn(err.message))
  await db.schema.table('users', t => t.dateTime('enabled')).catch(err => console.warn(err.message))
  await db.schema.table('users', t => t.dateTime('fileLength')).catch(err => console.warn(err.message))
  console.log('Migration finished! Now start lolisafe normally')
  process.exit(0)
}

migration.start()
