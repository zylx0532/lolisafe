/* global swal, axios */

const page = {
  // user token
  token: localStorage.token,

  // HTML elements
  user: null,
  pass: null
}

page.do = function (dest) {
  const user = page.user.value
  const pass = page.pass.value

  if (!user)
    return swal('发生错误！', '您需要指定用户名', 'error')

  if (!pass)
    return swal('发生错误！', '您需要指定用户名', 'error')

  axios.post(`api/${dest}`, {
    username: user,
    password: pass
  }).then(function (response) {
    if (response.data.success === false)
      return swal('发生错误！', response.data.description, 'error')

    localStorage.token = response.data.token
    window.location = 'dashboard'
  }).catch(function (error) {
    console.error(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.verify = function () {
  if (!page.token) return

  axios.post('api/tokens/verify', {
    token: page.token
  }).then(function (response) {
    if (response.data.success === false)
      return swal('发生错误！', response.data.description, 'error')

    window.location = 'dashboard'
  }).catch(function (error) {
    console.error(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

window.onload = function () {
  page.verify()

  page.user = document.getElementById('user')
  page.pass = document.getElementById('pass')

  document.getElementById('loginBtn').addEventListener('click', function () {
    page.do('login')
  })

  document.getElementById('registerBtn').addEventListener('click', function () {
    page.do('register')
  })
}
