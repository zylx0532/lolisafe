/* global swal, axios */

var page = {
  // user token
  token: localStorage.token,

  // HTML elements
  user: null,
  pass: null
}

page.do = function (dest, onEnter) {
  var user = page.user.value
  var pass = page.pass.value

  // If the form is submitted with Enter button and the form is still empty
  if (onEnter && !user.length && !pass.length) { return }

  console.log('page.do()\'ing: ' + dest)

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

page.formEnter = function (event) {
  if (event.keyCode === 13 || event.which === 13) {
    event.preventDefault()
    event.stopPropagation()
    page.do('login', true)
  }
}

window.onload = function () {
  page.verify()

  page.user = document.getElementById('user')
  page.pass = document.getElementById('pass')

  var form = document.getElementById('authForm')
  form.addEventListener('keyup', page.formEnter)
  form.addEventListener('keypress', page.formEnter)
  form.onsubmit = function (event) {
    event.preventDefault()
    event.stopPropagation()
  }

  document.getElementById('loginBtn').addEventListener('click', function () {
    page.do('login')
  })

  document.getElementById('registerBtn').addEventListener('click', function () {
    page.do('register')
  })
}
