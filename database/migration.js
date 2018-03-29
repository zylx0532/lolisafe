const config = require('../config.js')
const db = require('knex')(config.database)

const migration = {}
migration.start = async () => {
  await db.schema.table('albums', t => t.dateTime('editedAt')).catch(error => console.warn(error.message))
  await db.schema.table('albums', t => t.dateTime('zipGeneratedAt')).catch(error => console.warn(error.message))
  await db.schema.table('users', t => t.dateTime('enabled')).catch(error => console.warn(error.message))
  await db.schema.table('users', t => t.dateTime('fileLength')).catch(error => console.warn(error.message))
  console.log('Migration finished! Now start lolisafe normally')
  process.exit(0)
}

migration.start()
