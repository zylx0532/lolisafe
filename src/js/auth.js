/* global swal, axios */

const lsKeys = {
  token: 'token'
}

const page = {
  // user token
  token: localStorage[lsKeys.token],

  // HTML elements
  user: null,
  pass: null
}

page.do = (dest, trigger) => {
  const user = page.user.value.trim()
  if (!user)
    return swal('An error occurred!', 'You need to specify a username.', 'error')

  const pass = page.pass.value.trim()
  if (!pass)
    return swal('An error occurred!', 'You need to specify a password.', 'error')

  trigger.classList.add('is-loading')
  axios.post(`api/${dest}`, {
    username: user,
    password: pass
  }).then(response => {
    if (response.data.success === false) {
      trigger.classList.remove('is-loading')
      return swal(`Unable to ${dest}!`, response.data.description, 'error')
    }

    localStorage.token = response.data.token
    window.location = 'dashboard'
  }).catch(error => {
    console.error(error)
    trigger.classList.remove('is-loading')
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.verify = () => {
  if (!page.token) return

  axios.post('api/tokens/verify', {
    token: page.token
  }).then(response => {
    if (response.data.success === false)
      return swal('An error occurred!', response.data.description, 'error')

    window.location = 'dashboard'
  }).catch(error => {
    console.error(error)
    const description = error.response.data && error.response.data.description
      ? error.response.data.description
      : 'There was an error with the request, please check the console for more information.'
    return swal(`${error.response.status} ${error.response.statusText}`, description, 'error')
  })
}

window.onload = () => {
  page.verify()

  page.user = document.querySelector('#user')
  page.pass = document.querySelector('#pass')

  // Prevent default form's submit action
  document.querySelector('#authForm').addEventListener('submit', event => {
    event.preventDefault()
  })

  document.querySelector('#loginBtn').addEventListener('click', event => {
    page.do('login', event.currentTarget)
  })

  document.querySelector('#registerBtn').addEventListener('click', event => {
    page.do('register', event.currentTarget)
  })
}
