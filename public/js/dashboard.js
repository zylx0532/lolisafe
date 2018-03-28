/* eslint-disable no-unused-expressions */
/* global swal, axios, ClipboardJS */

const panel = {
  page: undefined,
  username: undefined,
  token: localStorage.token,
  filesView: localStorage.filesView,
  clipboardJS: undefined
}

panel.preparePage = () => {
  if (!panel.token) {
    window.location = 'auth'
  }
  panel.verifyToken(panel.token, true)
}

panel.verifyToken = (token, reloadOnError) => {
  if (reloadOnError === undefined) {
    reloadOnError = false
  }

  axios.post('api/tokens/verify', {
    token: token
  })
    .then(response => {
      if (response.data.success === false) {
        swal({
          title: 'An error occurred',
          text: response.data.description,
          icon: 'error'
        }).then(() => {
          if (reloadOnError) {
            localStorage.removeItem('token')
            location.location = 'auth'
          }
        })
        return
      }

      axios.defaults.headers.common.token = token
      localStorage.token = token
      panel.token = token
      panel.username = response.data.username
      return panel.prepareDashboard()
    })
    .catch(err => {
      console.log(err)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.prepareDashboard = () => {
  panel.page = document.getElementById('page')
  document.getElementById('auth').style.display = 'none'
  document.getElementById('dashboard').style.display = 'block'

  document.getElementById('itemUploads').addEventListener('click', function () {
    panel.setActiveMenu(this)
  })

  document.getElementById('itemManageGallery').addEventListener('click', function () {
    panel.setActiveMenu(this)
  })

  document.getElementById('itemFileLength').addEventListener('click', function () {
    panel.setActiveMenu(this)
  })

  document.getElementById('itemTokens').addEventListener('click', function () {
    panel.setActiveMenu(this)
  })

  document.getElementById('itemPassword').addEventListener('click', function () {
    panel.setActiveMenu(this)
  })

  document.getElementById('itemLogout').innerHTML = `Logout ( ${panel.username} )`

  panel.getAlbumsSidebar()
}

panel.logout = () => {
  localStorage.removeItem('token')
  location.reload('.')
}

panel.closeModal = () => {
  document.getElementById('modal').className = 'modal'
}

panel.isLoading = (element, state) => {
  if (!element) { return }
  if (state && !element.className.includes(' is-loading')) {
    element.className += ' is-loading'
  } else if (!state && element.className.includes(' is-loading')) {
    element.className = element.className.replace(' is-loading', '')
  }
}

panel.getUploads = (album, page, element) => {
  if (element) { panel.isLoading(element, true) }
  if (page === undefined) { page = 0 }

  let url = 'api/uploads/' + page
  if (album !== undefined) { url = 'api/album/' + album + '/' + page }

  axios.get(url).then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return panel.verifyToken(panel.token)
      } else {
        return swal('An error occurred', response.data.description, 'error')
      }
    }

    let prevPage = 0
    let nextPage = page + 1

    if (response.data.files.length < 25) { nextPage = page }

    if (page > 0) { prevPage = page - 1 }

    const pagination = `
      <nav class="pagination is-centered">
        <a class="button pagination-previous" onclick="panel.getUploads(${album}, ${prevPage}, this)">Previous</a>
        <a class="button pagination-next" onclick="panel.getUploads(${album}, ${nextPage}, this)">Next page</a>
      </nav>
    `
    const listType = `
      <div class="columns">
        <div class="column">
          <a class="button is-small is-outlined is-danger" title="List view" onclick="panel.setFilesView('list', ${album}, ${page}, this)">
            <span class="icon is-small">
              <i class="icon-th-list"></i>
            </span>
          </a>
          <a class="button is-small is-outlined is-danger" title="Thumbs view" onclick="panel.setFilesView('thumbs', ${album}, ${page}, this)">
            <span class="icon is-small">
              <i class="icon-th-large"></i>
            </span>
          </a>
        </div>
      </div>
    `

    if (panel.filesView === 'thumbs') {
      panel.page.innerHTML = `
        ${pagination}
        <hr>
        ${listType}
        <div class="columns is-multiline is-mobile is-centered" id="table">

        </div>
        ${pagination}
      `

      const table = document.getElementById('table')

      for (const item of response.data.files) {
        const div = document.createElement('div')

        let displayAlbumOrUser = item.album
        if (panel.username === 'root') {
          displayAlbumOrUser = ''
          if (item.username !== undefined) { displayAlbumOrUser = item.username }
        }

        div.className = 'image-container column is-narrow'
        if (item.thumb !== undefined) {
          div.innerHTML = `<a class="image" href="${item.file}" target="_blank"><img src="${item.thumb}"/></a>`
        } else {
          div.innerHTML = `<a class="image" href="${item.file}" target="_blank"><h1 class="title">.${item.file.split('.').pop()}</h1></a>`
        }
        div.innerHTML += `
          <a class="button is-small is-danger is-outlined" title="Delete album" onclick="panel.deleteFile(${item.id}, ${album}, ${page})">
            <span class="icon is-small">
              <i class="icon-trash-1"></i>
            </span>
          </a>
          <div class="name">
            <p><span>${item.name}</span></p>
            <p>${displayAlbumOrUser ? `<span>${displayAlbumOrUser}</span> – ` : ''}${item.size}</div>
        `
        table.appendChild(div)
      }
    } else {
      let albumOrUser = 'Album'
      if (panel.username === 'root') { albumOrUser = 'User' }

      panel.page.innerHTML = `
        ${pagination}
        <hr>
        ${listType}
        <div class="table-container">
          <table class="table is-narrow is-fullwidth is-hoverable">
            <thead>
              <tr>
                  <th>File</th>
                  <th>${albumOrUser}</th>
                  <th>Size</th>
                  <th>Date</th>
                  <th></th>
              </tr>
            </thead>
            <tbody id="table">
            </tbody>
          </table>
        </div>
        <hr>
        ${pagination}
      `

      const table = document.getElementById('table')

      for (const item of response.data.files) {
        const tr = document.createElement('tr')

        let displayAlbumOrUser = item.album
        if (panel.username === 'root') {
          displayAlbumOrUser = ''
          if (item.username !== undefined) { displayAlbumOrUser = item.username }
        }

        tr.innerHTML = `
          <tr>
            <th><a href="${item.file}" target="_blank">${item.file}</a></th>
            <th>${displayAlbumOrUser}</th>
            <td>${item.size}</td>
            <td>${item.date}</td>
            <td style="text-align: right">
              <a class="button is-small is-info is-outlined clipboard-js" title="Copy link to clipboard" data-clipboard-text="${item.file}">
                <span class="icon is-small">
                  <i class="icon-attach"></i>
                </span>
              </a>
              <a class="button is-small is-danger is-outlined" title="Delete album" onclick="panel.deleteFile(${item.id}, ${album}, ${page})">
                <span class="icon is-small">
                  <i class="icon-trash-1"></i>
                </span>
              </a>
            </td>
          </tr>
        `

        table.appendChild(tr)

        if (item.thumb) {
          tr.addEventListener('click', function (event) {
            if (event.target.tagName.toLowerCase() === 'a') { return }
            if (event.target.className.includes('icon')) { return }
            document.getElementById('modalImage').src = item.thumb
            document.getElementById('modal').className += ' is-active'
          })
        }
      }
    }
  })
    .catch(err => {
      console.log(err)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.setFilesView = (view, album, page, element) => {
  localStorage.filesView = view
  panel.filesView = view
  panel.getUploads(album, page, element)
}

panel.deleteFile = (id, album, page) => {
  swal({
    title: 'Are you sure?',
    text: 'You won\'t be able to recover the file!',
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, delete it!',
        closeModal: false
      }
    }
  }).then(value => {
    if (!value) { return }
    axios.post('api/upload/delete', {
      id: id
    })
      .then(response => {
        if (response.data.success === false) {
          if (response.data.description === 'No token provided') {
            return panel.verifyToken(panel.token)
          } else {
            return swal('An error occurred', response.data.description, 'error')
          }
        }

        swal('Deleted!', 'The file has been deleted.', 'success')
        panel.getUploads(album, page)
      })
      .catch(err => {
        console.log(err)
        return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
      })
  })
}

panel.getAlbums = () => {
  axios.get('api/albums').then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return panel.verifyToken(panel.token)
      } else {
        return swal('An error occurred', response.data.description, 'error')
      }
    }

    panel.page.innerHTML = `
      <h2 class="subtitle">Create new album</h2>

      <div class="field has-addons has-addons-centered">
        <div class="control is-expanded">
          <input id="albumName" class="input" type="text" placeholder="Name">
        </div>
        <div class="control">
          <a id="submitAlbum" class="button is-primary">Submit</a>
        </div>
      </div>

      <h2 class="subtitle">List of albums</h2>

      <div class="table-container">
        <table class="table is-narrow is-fullwidth is-hoverable">
          <thead>
            <tr>
                <th>Name</th>
                <th>Files</th>
                <th>Created At</th>
                <th>Public link</th>
                <th></th>
            </tr>
          </thead>
          <tbody id="table">
          </tbody>
        </table>
      </div>
    `

    const table = document.getElementById('table')

    for (const item of response.data.albums) {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <tr>
          <th>${item.name}</th>
          <th>${item.files}</th>
          <td>${item.date}</td>
          <td><a href="${item.identifier}" target="_blank">${item.identifier}</a></td>
          <td style="text-align: right">
            <a class="button is-small is-primary is-outlined" title="Edit name" onclick="panel.renameAlbum(${item.id})">
              <span class="icon is-small">
                <i class="icon-edit"></i>
              </span>
            </a>
            <a class="button is-small is-info is-outlined clipboard-js" title="Copy link to clipboard" data-clipboard-text="${item.identifier}">
              <span class="icon is-small">
                <i class="icon-attach"></i>
              </span>
            </a>
            <a class="button is-small is-danger is-outlined" title="Delete album" onclick="panel.deleteAlbum(${item.id})">
              <span class="icon is-small">
                <i class="icon-trash-1"></i>
              </span>
            </a>
          </td>
        </tr>
      `

      table.appendChild(tr)
    }

    document.getElementById('submitAlbum').addEventListener('click', function () {
      panel.submitAlbum(this)
    })
  })
    .catch(err => {
      console.log(err)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.renameAlbum = id => {
  swal({
    title: 'Rename album',
    text: 'New name you want to give the album:',
    icon: 'info',
    content: {
      element: 'input',
      attributes: {
        placeholder: 'My super album'
      }
    },
    buttons: {
      cancel: true,
      confirm: {
        closeModal: false
      }
    }
  }).then(value => {
    if (!value) { return swal.close() }
    axios.post('api/albums/rename', {
      id: id,
      name: value
    })
      .then(response => {
        if (response.data.success === false) {
          if (response.data.description === 'No token provided') { return panel.verifyToken(panel.token) } else if (response.data.description === 'Name already in use') { swal.showInputError('That name is already in use!') } else { swal('An error occurred', response.data.description, 'error') }
          return
        }

        swal('Success!', 'Your album was renamed to: ' + value, 'success')
        panel.getAlbumsSidebar()
        panel.getAlbums()
      })
      .catch(err => {
        console.log(err)
        return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
      })
  })
}

panel.deleteAlbum = id => {
  swal({
    title: 'Are you sure?',
    text: 'This won\'t delete your files, only the album!',
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, delete it!',
        closeModal: false
      }
    }
  }).then(value => {
    if (!value) { return }
    axios.post('api/albums/delete', {
      id: id
    })
      .then(response => {
        if (response.data.success === false) {
          if (response.data.description === 'No token provided') {
            return panel.verifyToken(panel.token)
          } else {
            return swal('An error occurred', response.data.description, 'error')
          }
        }

        swal('Deleted!', 'Your album has been deleted.', 'success')
        panel.getAlbumsSidebar()
        panel.getAlbums()
      })
      .catch(err => {
        console.log(err)
        return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
      })
  })
}

panel.submitAlbum = element => {
  panel.isLoading(element, true)
  axios.post('api/albums', {
    name: document.getElementById('albumName').value
  })
    .then(async response => {
      panel.setLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred', response.data.description, 'error')
        }
      }

      swal('Woohoo!', 'Album was added successfully', 'success')
      panel.getAlbumsSidebar()
      panel.getAlbums()
    })
    .catch(err => {
      console.log(err)
      panel.setLoading(element, false)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.getAlbumsSidebar = () => {
  axios.get('api/albums/sidebar')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred', response.data.description, 'error')
        }
      }

      const albumsContainer = document.getElementById('albumsContainer')
      albumsContainer.innerHTML = ''

      if (response.data.albums === undefined) { return }

      for (const album of response.data.albums) {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.id = album.id
        a.innerHTML = album.name

        a.addEventListener('click', function () {
          panel.getAlbum(this)
        })

        li.appendChild(a)
        albumsContainer.appendChild(li)
      }
    })
    .catch(err => {
      console.log(err)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.getAlbum = item => {
  panel.setActiveMenu(item)
  panel.getUploads(item.id)
}

panel.changeFileLength = () => {
  axios.get('api/filelength/config')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred', response.data.description, 'error')
        }
      }

      panel.page.innerHTML = `
        <h2 class="subtitle">Preferred file name length</h2>

        <div class="field">
          <label class="label">Your current file name length:</label>
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="fileLength" class="input" type="text" placeholder="Your file length" value="${response.data.fileLength ? Math.min(Math.max(response.data.fileLength, response.data.config.min), response.data.config.max) : response.data.config.default}">
            </div>
            <div class="control">
              <a id="setFileLength" class="button is-primary">Set file name length</a>
            </div>
          </div>
          <p class="help">Default file name length is <b>${response.data.config.default}</b> characters. ${response.data.config.userChangeable ? `Range allowed for user is <b>${response.data.config.min}</b> to <b>${response.data.config.max}</b> characters.` : 'Changing file name length is disabled at the moment.'}</p>
        </div>
      `

      document.getElementById('setFileLength').addEventListener('click', function () {
        panel.setFileLength(document.getElementById('fileLength').value, this)
      })
    })
    .catch(err => {
      console.log(err)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.setFileLength = (fileLength, element) => {
  panel.isLoading(element, true)
  axios.post('api/filelength/change', { fileLength })
    .then(response => {
      panel.isLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred', response.data.description, 'error')
        }
      }

      swal({
        title: 'Woohoo!',
        text: 'Your file length was successfully changed.',
        icon: 'success'
      }).then(() => {
        location.reload()
      })
    })
    .catch(err => {
      console.log(err)
      panel.isLoading(element, false)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.changeToken = () => {
  axios.get('api/tokens')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred', response.data.description, 'error')
        }
      }

      panel.page.innerHTML = `
        <h2 class="subtitle">Manage your token</h2>

        <div class="field">
          <label class="label">Your current token:</label>
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="token" readonly class="input" type="text" placeholder="Your token" value="${response.data.token}">
            </div>
            <div class="control">
              <a id="getNewToken" class="button is-primary">Request new token</a>
            </div>
          </div>
        </div>
      `

      document.getElementById('getNewToken').addEventListener('click', function () {
        panel.getNewToken(this)
      })
    })
    .catch(err => {
      console.log(err)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.getNewToken = element => {
  panel.isLoading(element, true)
  axios.post('api/tokens/change')
    .then(response => {
      panel.isLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred', response.data.description, 'error')
        }
      }

      swal({
        title: 'Woohoo!',
        text: 'Your token was successfully changed.',
        icon: 'success'
      }).then(() => {
        localStorage.token = response.data.token
        location.reload()
      })
    })
    .catch(err => {
      console.log(err)
      panel.isLoading(element, false)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.changePassword = () => {
  panel.page.innerHTML = `
    <h2 class="subtitle">Change your password</h2>

    <div class="field">
      <label class="label">New password:</label>
      <div class="control">
        <input id="password" class="input" type="password" placeholder="Your new password">
      </div>
    </div>
    <div class="field">
      <label class="label">Confirm password:</label>
      <div class="field has-addons">
        <div class="control is-expanded">
          <input id="passwordConfirm" class="input is-expanded" type="password" placeholder="Verify your new password">
        </div>
        <div class="control">
          <a id="sendChangePassword" class="button is-primary">Set new password</a>
        </div>
      </div>
    </div>
  `

  document.getElementById('sendChangePassword').addEventListener('click', function () {
    if (document.getElementById('password').value === document.getElementById('passwordConfirm').value) {
      panel.sendNewPassword(document.getElementById('password').value, this)
    } else {
      swal({
        title: 'Password mismatch!',
        text: 'Your passwords do not match, please try again.',
        icon: 'error'
      }).then(() => {
        panel.changePassword()
      })
    }
  })
}

panel.sendNewPassword = (pass, element) => {
  panel.isLoading(element, true)
  axios.post('api/password/change', { password: pass })
    .then(response => {
      panel.isLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred', response.data.description, 'error')
        }
      }

      swal({
        title: 'Woohoo!',
        text: 'Your password was successfully changed.',
        icon: 'success'
      }).then(() => {
        location.reload()
      })
    })
    .catch(err => {
      console.log(err)
      panel.isLoading(element, false)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.setActiveMenu = item => {
  const menu = document.getElementById('menu')
  const items = menu.getElementsByTagName('a')
  for (let i = 0; i < items.length; i++) {
    items[i].className = ''
  }

  item.className = 'is-active'
}

window.onload = () => {
  // Add 'no-touch' class to non-touch devices
  if (!('ontouchstart' in document.documentElement)) {
    document.documentElement.className += ' no-touch'
  }

  panel.preparePage()

  panel.clipboardJS = new ClipboardJS('.clipboard-js')

  panel.clipboardJS.on('success', () => {
    return swal('Copied!', 'The link has been copied to clipboard.', 'success')
  })

  panel.clipboardJS.on('error', event => {
    console.error(event)
    return swal('An error occurred', 'There was an error when trying to copy the link to clipboard, please check the console for more information.', 'error')
  })
}
