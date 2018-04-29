/* global swal, axios */

const page = {
  // user token
  token: localStorage.token
}

page.do = async dest => {
  const user = document.getElementById('user').value
  const pass = document.getElementById('pass').value

  if (!user) {
    return swal('Error', 'You need to specify a username', 'error')
  }

  if (!pass) {
    return swal('Error', 'You need to specify a username', 'error')
  }

  const response = await axios.post(`api/${dest}`, {
    username: user,
    password: pass
  })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  if (response.data.success === false) {
    return swal('Error', response.data.description, 'error')
  }

  localStorage.token = response.data.token
  window.location = 'dashboard'
}

page.onkeypress = (event, element) => {
  event = event || window.event
  if (!event) { return }
  if (event.keyCode === 13 || event.which === 13) { page.do('login') }
}

page.verify = async () => {
  if (!page.token) { return }

  const response = await axios.post('api/tokens/verify', {
    token: page.token
  })
    .catch(error => {
      console.log(error)
      swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  if (response.data.success === false) {
    return swal('Error', response.data.description, 'error')
  }

  window.location = 'dashboard'
}

window.onload = () => {
  page.verify()
}
