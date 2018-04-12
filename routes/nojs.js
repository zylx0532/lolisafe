const routes = require('express').Router()
const uploadController = require('../controllers/uploadController')

routes.get('/nojs', async (req, res, next) => {
  return res.render('nojs', { layout: false })
})

routes.post('/nojs', (req, res, next) => {
  req.params.nojs = true
  return uploadController.upload(req, res, next)
})

module.exports = routes
