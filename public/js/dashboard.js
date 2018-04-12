/* eslint-disable no-unused-expressions */
/* global swal, axios, ClipboardJS */

const panel = {
  page: undefined,
  username: undefined,
  token: localStorage.token,
  filesView: localStorage.filesView,
  clipboardJS: undefined,
  selectedFiles: [],
  selectAlbumContainer: undefined,
  checkboxes: undefined,
  lastSelected: undefined
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

  axios.post('api/tokens/verify', { token })
    .then(response => {
      if (response.data.success === false) {
        swal({
          title: 'An error occurred!',
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
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
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
        return swal('An error occurred!', response.data.description, 'error')
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
    const controls = `
      <div class="columns">
        <div class="column is-hidden-mobile"></div>
        <div class="column" style="text-align: center">
          <a class="button is-small is-danger" title="List view" onclick="panel.setFilesView('list', ${album}, ${page}, this)">
            <span class="icon">
              <i class="icon-th-list"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="Thumbs view" onclick="panel.setFilesView('thumbs', ${album}, ${page}, this)">
            <span class="icon">
              <i class="icon-th-large"></i>
            </span>
          </a>
        </div>
        <div class="column" style="text-align: right">
          <a class="button is-small is-info" title="Clear selection" onclick="panel.clearSelection()">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          <a class="button is-small is-warning" title="Add selected files to album" onclick="panel.addSelectedFilesToAlbum(${album})">
            <span class="icon">
              <i class="icon-plus"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="Bulk delete" onclick="panel.deleteSelectedFiles(${album})">
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>Bulk delete</span>
          </a>
        </div>
      </div>
    `

    let allFilesSelected = true
    if (panel.filesView === 'thumbs') {
      panel.page.innerHTML = `
        ${pagination}
        <hr>
        ${controls}
        <div class="columns is-multiline is-mobile is-centered" id="table">

        </div>
        ${pagination}
      `

      const table = document.getElementById('table')

      for (const file of response.data.files) {
        const selected = panel.selectedFiles.includes(file.id)
        if (!selected && allFilesSelected) { allFilesSelected = false }

        const div = document.createElement('div')

        let displayAlbumOrUser = file.album
        if (panel.username === 'root') {
          displayAlbumOrUser = ''
          if (file.username !== undefined) { displayAlbumOrUser = file.username }
        }

        div.className = 'image-container column is-narrow'
        if (file.thumb !== undefined) {
          div.innerHTML = `<a class="image" href="${file.file}" target="_blank"><img src="${file.thumb}"/></a>`
        } else {
          div.innerHTML = `<a class="image" href="${file.file}" target="_blank"><h1 class="title">.${file.file.split('.').pop()}</h1></a>`
        }
        div.innerHTML += `
          <input type="checkbox" class="file-checkbox" title="Select this file" data-id="${file.id}" onclick="panel.selectFile(this, event)"${selected ? ' checked' : ''}>
          <div class="controls">
            <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" data-clipboard-text="${file.file}">
              <span class="icon">
                <i class="icon-clipboard-1"></i>
              </span>
            </a>
            <a class="button is-small is-warning" title="Add to album" onclick="panel.addToAlbum([${file.id}], ${album})">
              <span class="icon">
                <i class="icon-plus"></i>
              </span>
            </a>
            <a class="button is-small is-danger" title="Delete file" onclick="panel.deleteFile(${file.id}, ${album}, ${page})">
              <span class="icon">
                <i class="icon-trash"></i>
              </span>
            </a>
          </div>
          <div class="details">
            <p><span class="name" title="${file.file}">${file.name}</span></p>
            <p>${displayAlbumOrUser ? `<span>${displayAlbumOrUser}</span> – ` : ''}${file.size}</div>
        `
        table.appendChild(div)
        panel.checkboxes = Array.from(table.getElementsByClassName('file-checkbox'))
      }
    } else {
      let albumOrUser = 'Album'
      if (panel.username === 'root') { albumOrUser = 'User' }

      panel.page.innerHTML = `
        ${pagination}
        <hr>
        ${controls}
        <div class="table-container">
          <table class="table is-narrow is-fullwidth is-hoverable">
            <thead>
              <tr>
                  <th><input id="selectAll" type="checkbox" title="Select all files" onclick="panel.selectAllFiles(this)"></th>
                  <th style="width: 25%">File</th>
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

      for (const file of response.data.files) {
        const selected = panel.selectedFiles.includes(file.id)
        if (!selected && allFilesSelected) { allFilesSelected = false }

        const tr = document.createElement('tr')

        let displayAlbumOrUser = file.album
        if (panel.username === 'root') {
          displayAlbumOrUser = ''
          if (file.username !== undefined) { displayAlbumOrUser = file.username }
        }

        tr.innerHTML = `
          <tr>
            <th><input type="checkbox" class="file-checkbox" title="Select this file" data-id="${file.id}" onclick="panel.selectFile(this, event)"${selected ? ' checked' : ''}></th>
            <th><a href="${file.file}" target="_blank" title="${file.file}">${file.name}</a></th>
            <th>${displayAlbumOrUser}</th>
            <td>${file.size}</td>
            <td>${file.date}</td>
            <td style="text-align: right">
              <a class="button is-small is-primary" title="View thumbnail" onclick="panel.displayThumbnailModal(${file.thumb ? `'${file.thumb}'` : null})"${file.thumb ? '' : ' disabled'}>
                <span class="icon">
                  <i class="icon-picture-1"></i>
                </span>
              </a>
              <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" data-clipboard-text="${file.file}">
                <span class="icon">
                  <i class="icon-clipboard-1"></i>
                </span>
              </a>
              <a class="button is-small is-warning" title="Add to album" onclick="panel.addToAlbum([${file.id}])">
                <span class="icon">
                  <i class="icon-plus"></i>
                </span>
              </a>
              <a class="button is-small is-danger" title="Delete file" onclick="panel.deleteFile(${file.id}, ${album}, ${page})">
                <span class="icon">
                  <i class="icon-trash"></i>
                </span>
              </a>
            </td>
          </tr>
        `

        table.appendChild(tr)
        panel.checkboxes = Array.from(table.getElementsByClassName('file-checkbox'))
      }
    }

    if (allFilesSelected && response.data.files.length) {
      const selectAll = document.getElementById('selectAll')
      if (selectAll) { selectAll.checked = true }
    }
  }).catch(error => {
    console.log(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

panel.setFilesView = (view, album, page, element) => {
  localStorage.filesView = view
  panel.filesView = view
  panel.getUploads(album, page, element)
}

panel.displayThumbnailModal = thumb => {
  if (!thumb) { return }
  document.getElementById('modalImage').src = thumb
  document.getElementById('modal').className += ' is-active'
}

panel.selectAllFiles = element => {
  const table = document.getElementById('table')
  const checkboxes = table.getElementsByClassName('file-checkbox')

  for (const checkbox of checkboxes) {
    const id = parseInt(checkbox.dataset.id)
    if (isNaN(id)) { continue }
    if (checkbox.checked !== element.checked) {
      checkbox.checked = element.checked
      if (checkbox.checked) {
        panel.selectedFiles.push(id)
      } else {
        panel.selectedFiles.splice(panel.selectedFiles.indexOf(id), 1)
      }
    }
  }

  if (panel.selectedFiles.length) {
    localStorage.selectedFiles = JSON.stringify(panel.selectedFiles)
  } else {
    localStorage.removeItem('selectedFiles')
  }

  element.title = element.checked ? 'Unselect all files' : 'Select all files'
}

panel.selectInBetween = (element, lastElement) => {
  if (!element || !lastElement) { return }
  if (element === lastElement) { return }
  if (!panel.checkboxes || !panel.checkboxes.length) { return }

  const thisIndex = panel.checkboxes.indexOf(element)
  const lastIndex = panel.checkboxes.indexOf(lastElement)

  const distance = thisIndex - lastIndex
  if (distance >= -1 && distance <= 1) { return }

  for (let i = 0; i < panel.checkboxes.length; i++) {
    if ((thisIndex > lastIndex && i > lastIndex && i < thisIndex) ||
      (thisIndex < lastIndex && i > thisIndex && i < lastIndex)) {
      panel.checkboxes[i].checked = true
      panel.selectedFiles.push(parseInt(panel.checkboxes[i].dataset.id))
    }
  }

  localStorage.selectedFiles = JSON.stringify(panel.selectedFiles)
}

panel.selectFile = (element, event) => {
  if (event.shiftKey && panel.lastSelected) {
    panel.selectInBetween(element, panel.lastSelected)
  } else {
    panel.lastSelected = element
  }

  const id = parseInt(element.dataset.id)

  if (isNaN(id)) { return }

  if (!panel.selectedFiles.includes(id) && element.checked) {
    panel.selectedFiles.push(id)
  } else if (panel.selectedFiles.includes(id) && !element.checked) {
    panel.selectedFiles.splice(panel.selectedFiles.indexOf(id), 1)
  }

  if (panel.selectedFiles.length) {
    localStorage.selectedFiles = JSON.stringify(panel.selectedFiles)
  } else {
    localStorage.removeItem('selectedFiles')
  }
}

panel.clearSelection = async () => {
  const count = panel.selectedFiles.length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any files.', 'error')
  }

  const suffix = `file${count === 1 ? '' : 's'}`
  const proceed = await swal({
    title: 'Are you sure?',
    text: `You are going to unselect ${count} ${suffix}.`,
    buttons: true
  })
  if (!proceed) { return }

  const table = document.getElementById('table')
  const checkboxes = table.getElementsByClassName('file-checkbox')

  for (const checkbox of checkboxes) {
    if (checkbox.checked) {
      checkbox.checked = false
    }
  }

  panel.selectedFiles = []
  localStorage.removeItem('selectedFiles')

  const selectAll = document.getElementById('selectAll')
  if (selectAll) { selectAll.checked = false }

  return swal('Cleared selection!', `Unselected ${count} ${suffix}.`, 'success')
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
    axios.post('api/upload/delete', { id })
      .then(response => {
        if (response.data.success === false) {
          if (response.data.description === 'No token provided') {
            return panel.verifyToken(panel.token)
          } else {
            return swal('An error occurred!', response.data.description, 'error')
          }
        }

        swal('Deleted!', 'The file has been deleted.', 'success')
        panel.getUploads(album, page)
      })
      .catch(error => {
        console.log(error)
        return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
      })
  })
}

panel.deleteSelectedFiles = async album => {
  const count = panel.selectedFiles.length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any files.', 'error')
  }

  const suffix = `file${count === 1 ? '' : 's'}`
  const proceed = await swal({
    title: 'Are you sure?',
    text: `You won't be able to recover ${count} ${suffix}!`,
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: `Yes, nuke the ${suffix}!`,
        closeModal: false
      }
    }
  })
  if (!proceed) { return }

  const bulkdelete = await axios.post('api/upload/bulkdelete', {
    ids: panel.selectedFiles
  })
    .catch(error => {
      console.log(error)
      swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!bulkdelete) { return }

  if (bulkdelete.data.success === false) {
    if (bulkdelete.data.description === 'No token provided') {
      return panel.verifyToken(panel.token)
    } else {
      return swal('An error occurred!', bulkdelete.data.description, 'error')
    }
  }

  let deleted = count
  if (bulkdelete.data.failedids && bulkdelete.data.failedids.length) {
    deleted -= bulkdelete.data.failedids.length
    panel.selectedFiles = panel.selectedFiles.filter(id => bulkdelete.data.failedids.includes(id))
  } else {
    panel.selectedFiles = []
  }

  localStorage.selectedFiles = JSON.stringify(panel.selectedFiles)

  swal('Deleted!', `${deleted} file${deleted === 1 ? ' has' : 's have'} been deleted.`, 'success')
  return panel.getUploads(album)
}

panel.addSelectedFilesToAlbum = async album => {
  const count = panel.selectedFiles.length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any files.', 'error')
  }

  const failedids = await panel.addToAlbum(panel.selectedFiles, album)
  if (!failedids) { return }
  if (failedids.length) {
    panel.selectedFiles = panel.selectedFiles.filter(id => failedids.includes(id))
  } else {
    panel.selectedFiles = []
  }
  localStorage.selectedFiles = JSON.stringify(panel.selectedFiles)
}

panel.addToAlbum = async (ids, album) => {
  const count = ids.length
  const proceed = await swal({
    title: 'Are you sure?',
    text: `You are about to move ${count} file${count === 1 ? '' : 's'} to an album.`,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes',
        closeModal: false
      }
    }
  })
  if (!proceed) { return }

  const list = await axios.get('api/albums')
    .catch(error => {
      console.log(error)
      swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!list) { return }

  if (list.data.success === false) {
    if (list.data.description === 'No token provided') {
      panel.verifyToken(panel.token)
    } else {
      swal('An error occurred!', list.data.description, 'error')
    }
    return
  }

  if (!panel.selectAlbumContainer) {
    // We want to this to be re-usable
    panel.selectAlbumContainer = document.createElement('div')
    panel.selectAlbumContainer.id = 'selectAlbum'
    panel.selectAlbumContainer.className = 'select is-fullwidth'
  }

  const options = list.data.albums
    .map(album => `<option value="${album.id}">${album.name}</option>`)
    .join('\n')

  panel.selectAlbumContainer.innerHTML = `
    <select>
      <option value="">Choose an album</option>
      <option value="-1">Remove from album</option>
      ${options}
    </select>
    <p class="help is-danger">If a file is already in an album, it will be moved.</p>
  `

  const choose = await swal({
    content: panel.selectAlbumContainer,
    buttons: {
      cancel: true,
      confirm: {
        text: 'OK',
        closeModal: false
      }
    }
  })
  if (!choose) { return }

  const albumid = parseInt(panel.selectAlbumContainer.getElementsByTagName('select')[0].value)
  if (isNaN(albumid)) {
    swal('An error occurred!', 'You did not choose an album.', 'error')
    return
  }

  const add = await axios.post('api/albums/addfiles', { ids, albumid })
    .catch(error => {
      console.log(error)
      swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!add) { return }

  if (add.data.success === false) {
    if (add.data.description === 'No token provided') {
      panel.verifyToken(panel.token)
    } else {
      swal('An error occurred!', add.data.description, 'error')
    }
    return
  }

  let added = ids.length
  if (add.data.failedids && add.data.failedids.length) {
    added -= add.data.failedids.length
  }
  const suffix = `file${ids.length === 1 ? '' : 's'}`

  if (!added) {
    swal('An error occurred!', `Could not add the ${suffix} to the album.`, 'error')
    return
  }

  swal('Woohoo!', `Successfully ${albumid < 0 ? 'removed' : 'added'} ${added} ${suffix} ${albumid < 0 ? 'from' : 'to'} the album.`, 'success')
  panel.getUploads(album)
  return add.data.failedids
}

panel.getAlbums = () => {
  axios.get('api/albums').then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return panel.verifyToken(panel.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    panel.page.innerHTML = `
      <h2 class="subtitle">Create new album</h2>

      <div class="field has-addons has-addons-centered">
        <div class="control is-expanded">
          <input id="albumName" class="input" type="text" placeholder="Name">
        </div>
        <div class="control">
          <a id="submitAlbum" class="button is-breeze">
            <span class="icon">
              <i class="icon-paper-plane-empty"></i>
            </span>
            <span>Submit</span>
          </a>
        </div>
      </div>

      <h2 class="subtitle">List of albums</h2>

      <div class="table-container">
        <table class="table is-fullwidth is-hoverable">
          <thead>
            <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Files</th>
                <th>Created at</th>
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

    for (const album of response.data.albums) {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <tr>
          <th>${album.id}</th>
          <th>${album.name}</th>
          <th>${album.files}</th>
          <td>${album.date}</td>
          <td><a href="${album.identifier}" target="_blank">${album.identifier}</a></td>
          <td style="text-align: right">
            <a class="button is-small is-primary" title="Edit name" onclick="panel.renameAlbum(${album.id})">
              <span class="icon is-small">
                <i class="icon-pencil-1"></i>
              </span>
            </a>
            <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" data-clipboard-text="${album.identifier}">
              <span class="icon is-small">
                <i class="icon-clipboard-1"></i>
              </span>
            </a>
            <a class="button is-small is-danger" title="Delete album" onclick="panel.deleteAlbum(${album.id})">
              <span class="icon is-small">
                <i class="icon-trash"></i>
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
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
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
      id,
      name: value
    })
      .then(response => {
        if (response.data.success === false) {
          if (response.data.description === 'No token provided') { return panel.verifyToken(panel.token) } else if (response.data.description === 'Name already in use') { swal.showInputError('That name is already in use!') } else { swal('An error occurred!', response.data.description, 'error') }
          return
        }

        swal('Success!', 'Your album was renamed to: ' + value, 'success')
        panel.getAlbumsSidebar()
        panel.getAlbums()
      })
      .catch(error => {
        console.log(error)
        return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
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
      },
      purge: {
        text: 'Umm, delete the files too please?',
        value: 'purge',
        className: 'swal-button--danger',
        closeModal: false
      }
    }
  }).then(value => {
    if (!value) { return }
    axios.post('api/albums/delete', {
      id,
      purge: value === 'purge'
    })
      .then(response => {
        if (response.data.success === false) {
          if (response.data.description === 'No token provided') {
            return panel.verifyToken(panel.token)
          } else {
            return swal('An error occurred!', response.data.description, 'error')
          }
        }

        swal('Deleted!', 'Your album has been deleted.', 'success')
        panel.getAlbumsSidebar()
        panel.getAlbums()
      })
      .catch(error => {
        console.log(error)
        return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
      })
  })
}

panel.submitAlbum = element => {
  panel.isLoading(element, true)
  axios.post('api/albums', {
    name: document.getElementById('albumName').value
  })
    .then(async response => {
      panel.isLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      swal('Woohoo!', 'Album was added successfully', 'success')
      panel.getAlbumsSidebar()
      panel.getAlbums()
    })
    .catch(error => {
      console.log(error)
      panel.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.getAlbumsSidebar = () => {
  axios.get('api/albums/sidebar')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
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
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.getAlbum = album => {
  panel.setActiveMenu(album)
  panel.getUploads(album.id)
}

panel.changeFileLength = () => {
  axios.get('api/filelength/config')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      panel.page.innerHTML = `
        <h2 class="subtitle">File name length</h2>

        <div class="field">
          <label class="label">Your current file name length:</label>
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="fileLength" class="input" type="text" placeholder="Your file length" value="${response.data.fileLength ? Math.min(Math.max(response.data.fileLength, response.data.config.min), response.data.config.max) : response.data.config.default}">
            </div>
            <div class="control">
              <a id="setFileLength" class="button is-breeze">
                <span class="icon">
                  <i class="icon-paper-plane-empty"></i>
                </span>
                <span>Set file name length</span>
              </a>
            </div>
          </div>
          <p class="help">Default file name length is <b>${response.data.config.default}</b> characters. ${response.data.config.userChangeable ? `Range allowed for user is <b>${response.data.config.min}</b> to <b>${response.data.config.max}</b> characters.` : 'Changing file name length is disabled at the moment.'}</p>
        </div>
      `

      document.getElementById('setFileLength').addEventListener('click', function () {
        panel.setFileLength(document.getElementById('fileLength').value, this)
      })
    })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
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
          return swal('An error occurred!', response.data.description, 'error')
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
    .catch(error => {
      console.log(error)
      panel.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.changeToken = () => {
  axios.get('api/tokens')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return panel.verifyToken(panel.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
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
              <a id="getNewToken" class="button is-breeze">
                <span class="icon">
                  <i class="icon-arrows-cw"></i>
                </span>
                <span>Request new token</span>
              </a>
            </div>
          </div>
        </div>
      `

      document.getElementById('getNewToken').addEventListener('click', function () {
        panel.getNewToken(this)
      })
    })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
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
          return swal('An error occurred!', response.data.description, 'error')
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
    .catch(error => {
      console.log(error)
      panel.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
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
          <a id="sendChangePassword" class="button is-breeze">
            <span class="icon">
              <i class="icon-paper-plane-empty"></i>
            </span>
            <span>Set new password</span>
          </a>
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
          return swal('An error occurred!', response.data.description, 'error')
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
    .catch(error => {
      console.log(error)
      panel.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

panel.setActiveMenu = item => {
  const menu = document.getElementById('menu')
  const items = menu.getElementsByTagName('a')
  for (const item of items) { item.className = '' }

  item.className = 'is-active'
}

window.onload = () => {
  // Add 'no-touch' class to non-touch devices
  if (!('ontouchstart' in document.documentElement)) {
    document.documentElement.className += ' no-touch'
  }

  const selectedFiles = localStorage.selectedFiles
  if (selectedFiles) {
    panel.selectedFiles = JSON.parse(selectedFiles)
  }

  panel.preparePage()

  panel.clipboardJS = new ClipboardJS('.clipboard-js')

  panel.clipboardJS.on('success', () => {
    return swal('Copied!', 'The link has been copied to clipboard.', 'success')
  })

  panel.clipboardJS.on('error', event => {
    console.error(event)
    return swal('An error occurred!', 'There was an error when trying to copy the link to clipboard, please check the console for more information.', 'error')
  })
}
