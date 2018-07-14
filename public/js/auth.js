/* global swal, axios */

var page = {
  // user token
  token: localStorage.token
}

page.do = function (dest) {
  var user = document.getElementById('user').value
  var pass = document.getElementById('pass').value

  if (!user) {
    return swal('Error', 'You need to specify a username', 'error')
  }

  if (!pass) {
    return swal('Error', 'You need to specify a username', 'error')
  }

  axios.post(`api/${dest}`, {
    username: user,
    password: pass
  })
    .then(function (response) {
      if (response.data.success === false) {
        return swal('Error', response.data.description, 'error')
      }

      localStorage.token = response.data.token
      window.location = 'dashboard'
    })
    .catch(function (error) {
      console.error(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.verify = function () {
  if (!page.token) { return }

  axios.post('api/tokens/verify', {
    token: page.token
  })
    .then(function (response) {
      if (response.data.success === false) {
        return swal('Error', response.data.description, 'error')
      }

      window.location = 'dashboard'
    })
    .catch(function (error) {
      console.error(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

window.onload = function () {
  page.verify()

  document.body.addEventListener('keydown', function (event) {
    event = event || window.event
    if (!event) { return }
    var id = event.target.id
    if (!['user', 'pass'].includes(id)) { return }
    if (event.keyCode === 13 || event.which === 13) { page.do('login') }
  })
}
