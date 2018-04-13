const config = require('./../config')
const routes = require('express').Router()
const uploadController = require('./../controllers/uploadController')

const renderOptions = {
  layout: false,
  uploadDisabled: false,
  maxFileSize: config.uploads.maxSize
}

if (config.private) {
  if (config.enableUserAccounts) {
    renderOptions.uploadDisabled = 'Anonymous upload is disabled.'
  } else {
    renderOptions.uploadDisabled = 'Running in private mode.'
  }
}

routes.get('/nojs', async (req, res, next) => {
  return res.render('nojs', renderOptions)
})

routes.post('/nojs', (req, res, next) => {
  res._json = res.json
  res.json = (...args) => {
    const result = args[0]

    const _renderOptions = {}
    Object.assign(_renderOptions, renderOptions)

    _renderOptions.errorMessage = result.success ? '' : (result.description || 'An unexpected error occurred.')
    _renderOptions.files = result.files || [{}]

    return res.render('nojs', _renderOptions)
  }

  return uploadController.upload(req, res, next)
})

module.exports = routes
