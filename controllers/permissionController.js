const permissionController = {}

permissionController.permissions = {
  user: 0, // upload & delete own files, create & delete albums
  moderator: 50, // delete other user's files
  admin: 80, // manage users (disable accounts) & create moderators
  superadmin: 100 // create admins
  // groups will inherit permissions from groups which have lower value
}

permissionController.is = (user, group) => {
  // root bypass
  if (user.username === 'root') return true
  const permission = user.permission || 0
  return permission >= permissionController.permissions[group]
}

permissionController.higher = (user, target) => {
  const userPermission = user.permission || 0
  const targetPermission = target.permission || 0
  return userPermission > targetPermission
}

permissionController.mapPermissions = user => {
  const map = {}
  Object.keys(permissionController.permissions).forEach(group => {
    map[group] = permissionController.is(user, group)
  })
  return map
}

module.exports = permissionController
