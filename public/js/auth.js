/* global swal, axios */

const page = {}

page.do = dest => {
  const user = document.getElementById('user').value
  const pass = document.getElementById('pass').value

  if (user === undefined || user === null || user === '') {
    return swal('Error', 'You need to specify a username', 'error')
  }
  if (pass === undefined || pass === null || pass === '') {
    return swal('Error', 'You need to specify a username', 'error')
  }

  axios.post('api/' + dest, {
    username: user,
    password: pass
  })
    .then(response => {
      if (response.data.success === false) {
        return swal('Error', response.data.description, 'error')
      }

      localStorage.token = response.data.token
      window.location = 'dashboard'
    })
    .catch(err => {
      console.log(err)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.onkeypress = function (event, element) {
  event = event || window.event
  if (!event) return
  if (event.keyCode === 13 || event.which === 13) {
    return this.do('login')
  }
}

page.verify = () => {
  page.token = localStorage.token
  if (page.token === undefined) return

  axios.post('api/tokens/verify', {
    token: page.token
  })
    .then(response => {
      if (response.data.success === false) {
        return swal('Error', response.data.description, 'error')
      }

      window.location = 'dashboard'
    })
    .catch(err => {
      console.log(err)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

window.onload = () => {
  page.verify()
}
