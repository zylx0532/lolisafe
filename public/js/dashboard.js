/* global swal, axios, ClipboardJS, LazyLoad */

const page = {
  // #page
  dom: null,

  // user token
  token: localStorage.token,
  username: null, // from api/tokens/verify

  // view config (either list or thumbs)
  filesView: localStorage.filesView,

  // current view (which album and which page)
  currentView: { album: null, pageNum: null },

  // id of selected files (shared across pages and will be synced with localStorage)
  selectedFiles: [],
  checkboxes: [],
  lastSelected: null,

  // select album dom, for 'add to album' dialog
  selectAlbumContainer: null,

  // cache of albums data, for 'edit album' dialog
  albums: [],

  clipboardJS: null,
  lazyLoad: null
}

page.preparePage = () => {
  if (!page.token) {
    window.location = 'auth'
    return
  }
  page.verifyToken(page.token, true)
}

page.verifyToken = async (token, reloadOnError) => {
  if (reloadOnError === undefined) {
    reloadOnError = false
  }

  const response = await axios.post('api/tokens/verify', { token })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

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
  page.token = token
  page.username = response.data.username
  page.prepareDashboard()
}

page.prepareDashboard = () => {
  page.dom = document.getElementById('page')
  document.getElementById('auth').style.display = 'none'
  document.getElementById('dashboard').style.display = 'block'

  document.getElementById('itemUploads').addEventListener('click', function () {
    page.setActiveMenu(this)
  })

  document.getElementById('itemManageGallery').addEventListener('click', function () {
    page.setActiveMenu(this)
  })

  document.getElementById('itemFileLength').addEventListener('click', function () {
    page.setActiveMenu(this)
  })

  document.getElementById('itemTokens').addEventListener('click', function () {
    page.setActiveMenu(this)
  })

  document.getElementById('itemPassword').addEventListener('click', function () {
    page.setActiveMenu(this)
  })

  document.getElementById('itemLogout').innerHTML = `Logout ( ${page.username} )`

  page.getAlbumsSidebar()
}

page.logout = () => {
  localStorage.removeItem('token')
  location.reload('.')
}

page.closeModal = () => {
  document.getElementById('modal').className = 'modal'
}

page.isLoading = (element, state) => {
  if (!element) { return }
  if (state && !element.className.includes(' is-loading')) {
    element.className += ' is-loading'
  } else if (!state && element.className.includes(' is-loading')) {
    element.className = element.className.replace(' is-loading', '')
  }
}

page.getUploads = (album, pageNum, element) => {
  if (element) { page.isLoading(element, true) }
  if (pageNum === undefined) { pageNum = 0 }

  let url = 'api/uploads/' + pageNum
  if (album !== undefined) { url = 'api/album/' + album + '/' + pageNum }

  axios.get(url).then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    let prevPage = 0
    let nextPage = pageNum + 1

    if (response.data.files.length < 25) { nextPage = pageNum }

    if (pageNum > 0) { prevPage = pageNum - 1 }

    const pagination = `
      <nav class="pagination is-centered">
        <a class="button pagination-previous" onclick="page.getUploads(${album}, ${prevPage}, this)">Previous</a>
        <a class="button pagination-next" onclick="page.getUploads(${album}, ${nextPage}, this)">Next page</a>
      </nav>
    `
    const controls = `
      <div class="columns">
        <div class="column is-hidden-mobile"></div>
        <div class="column" style="text-align: center">
          <a class="button is-small is-danger" title="List view" onclick="page.setFilesView('list', this)">
            <span class="icon">
              <i class="icon-th-list"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="Thumbs view" onclick="page.setFilesView('thumbs', this)">
            <span class="icon">
              <i class="icon-th-large"></i>
            </span>
          </a>
        </div>
        <div class="column" style="text-align: right">
          <a class="button is-small is-info" title="Clear selection" onclick="page.clearSelection()">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          <a class="button is-small is-warning" title="Add selected files to album" onclick="page.addSelectedFilesToAlbum()">
            <span class="icon">
              <i class="icon-plus"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="Bulk delete" onclick="page.deleteSelectedFiles()">
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>Bulk delete</span>
          </a>
        </div>
      </div>
    `

    let allFilesSelected = true
    if (page.filesView === 'thumbs') {
      page.dom.innerHTML = `
        ${pagination}
        <hr>
        ${controls}
        <div id="table" class="columns is-multiline is-mobile is-centered">

        </div>
        ${pagination}
      `

      const table = document.getElementById('table')

      for (const file of response.data.files) {
        const selected = page.selectedFiles.includes(file.id)
        if (!selected && allFilesSelected) { allFilesSelected = false }

        const div = document.createElement('div')

        let displayAlbumOrUser = file.album
        if (page.username === 'root') {
          displayAlbumOrUser = ''
          if (file.username !== undefined) { displayAlbumOrUser = file.username }
        }

        div.className = 'image-container column is-narrow'
        if (file.thumb !== undefined) {
          div.innerHTML = `<a class="image" href="${file.file}" target="_blank" rel="noopener"><img alt="${file.name}" data-src="${file.thumb}"/></a>`
        } else {
          div.innerHTML = `<a class="image" href="${file.file}" target="_blank" rel="noopener"><h1 class="title">${file.extname || 'N/A'}</h1></a>`
        }
        div.innerHTML += `
          <input type="checkbox" class="file-checkbox" title="Select this file" data-id="${file.id}" onclick="page.selectFile(this, event)"${selected ? ' checked' : ''}>
          <div class="controls">
            <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" data-clipboard-text="${file.file}">
              <span class="icon">
                <i class="icon-clipboard-1"></i>
              </span>
            </a>
            <a class="button is-small is-warning" title="Add to album" onclick="page.addSingleFileToAlbum(${file.id})">
              <span class="icon">
                <i class="icon-plus"></i>
              </span>
            </a>
            <a class="button is-small is-danger" title="Delete file" onclick="page.deleteFile(${file.id})">
              <span class="icon">
                <i class="icon-trash"></i>
              </span>
            </a>
          </div>
          <div class="details">
            <p><span class="name" title="${file.file}">${file.name}</span></p>
            <p>${displayAlbumOrUser ? `<span>${displayAlbumOrUser}</span> – ` : ''}${file.size}</p>
          </div>
        `
        table.appendChild(div)
        page.checkboxes = Array.from(table.getElementsByClassName('file-checkbox'))
        page.lazyLoad.update()
      }
    } else {
      let albumOrUser = 'Album'
      if (page.username === 'root') { albumOrUser = 'User' }

      page.dom.innerHTML = `
        ${pagination}
        <hr>
        ${controls}
        <div class="table-container">
          <table class="table is-narrow is-fullwidth is-hoverable">
            <thead>
              <tr>
                  <th><input id="selectAll" type="checkbox" title="Select all files" onclick="page.selectAllFiles(this)"></th>
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
        const selected = page.selectedFiles.includes(file.id)
        if (!selected && allFilesSelected) { allFilesSelected = false }

        const tr = document.createElement('tr')

        let displayAlbumOrUser = file.album
        if (page.username === 'root') {
          displayAlbumOrUser = ''
          if (file.username !== undefined) { displayAlbumOrUser = file.username }
        }

        tr.innerHTML = `
          <tr>
            <th><input type="checkbox" class="file-checkbox" title="Select this file" data-id="${file.id}" onclick="page.selectFile(this, event)"${selected ? ' checked' : ''}></th>
            <th><a href="${file.file}" target="_blank" rel="noopener" title="${file.file}">${file.name}</a></th>
            <th>${displayAlbumOrUser}</th>
            <td>${file.size}</td>
            <td>${file.date}</td>
            <td style="text-align: right">
              <a class="button is-small is-primary" title="View thumbnail" onclick="page.displayThumbnailModal(${file.thumb ? `'${file.thumb}'` : null})"${file.thumb ? '' : ' disabled'}>
                <span class="icon">
                  <i class="icon-picture-1"></i>
                </span>
              </a>
              <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" data-clipboard-text="${file.file}">
                <span class="icon">
                  <i class="icon-clipboard-1"></i>
                </span>
              </a>
              <a class="button is-small is-warning" title="Add to album" onclick="page.addSingleFileToAlbum(${file.id})">
                <span class="icon">
                  <i class="icon-plus"></i>
                </span>
              </a>
              <a class="button is-small is-danger" title="Delete file" onclick="page.deleteFile(${file.id})">
                <span class="icon">
                  <i class="icon-trash"></i>
                </span>
              </a>
            </td>
          </tr>
        `

        table.appendChild(tr)
        page.checkboxes = Array.from(table.getElementsByClassName('file-checkbox'))
      }
    }

    if (allFilesSelected && response.data.files.length) {
      const selectAll = document.getElementById('selectAll')
      if (selectAll) { selectAll.checked = true }
    }

    page.currentView.album = album
    page.currentView.pageNum = pageNum
  }).catch(error => {
    console.log(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.setFilesView = (view, element) => {
  localStorage.filesView = view
  page.filesView = view
  page.getUploads(page.currentView.album, page.currentView.pageNum, element)
}

page.displayThumbnailModal = thumb => {
  if (!thumb) { return }
  document.getElementById('modalImage').src = thumb
  document.getElementById('modal').className += ' is-active'
}

page.selectAllFiles = element => {
  const table = document.getElementById('table')
  const checkboxes = table.getElementsByClassName('file-checkbox')

  for (const checkbox of checkboxes) {
    const id = parseInt(checkbox.dataset.id)
    if (isNaN(id)) { continue }
    if (checkbox.checked !== element.checked) {
      checkbox.checked = element.checked
      if (checkbox.checked) {
        page.selectedFiles.push(id)
      } else {
        page.selectedFiles.splice(page.selectedFiles.indexOf(id), 1)
      }
    }
  }

  if (page.selectedFiles.length) {
    localStorage.selectedFiles = JSON.stringify(page.selectedFiles)
  } else {
    localStorage.removeItem('selectedFiles')
  }

  element.title = element.checked ? 'Unselect all files' : 'Select all files'
}

page.selectInBetween = (element, lastElement) => {
  if (!element || !lastElement) { return }
  if (element === lastElement) { return }
  if (!page.checkboxes || !page.checkboxes.length) { return }

  const thisIndex = page.checkboxes.indexOf(element)
  const lastIndex = page.checkboxes.indexOf(lastElement)

  const distance = thisIndex - lastIndex
  if (distance >= -1 && distance <= 1) { return }

  for (let i = 0; i < page.checkboxes.length; i++) {
    if ((thisIndex > lastIndex && i > lastIndex && i < thisIndex) ||
      (thisIndex < lastIndex && i > thisIndex && i < lastIndex)) {
      page.checkboxes[i].checked = true
      page.selectedFiles.push(parseInt(page.checkboxes[i].dataset.id))
    }
  }

  localStorage.selectedFiles = JSON.stringify(page.selectedFiles)
}

page.selectFile = (element, event) => {
  if (event.shiftKey && page.lastSelected) {
    page.selectInBetween(element, page.lastSelected)
  } else {
    page.lastSelected = element
  }

  const id = parseInt(element.dataset.id)

  if (isNaN(id)) { return }

  if (!page.selectedFiles.includes(id) && element.checked) {
    page.selectedFiles.push(id)
  } else if (page.selectedFiles.includes(id) && !element.checked) {
    page.selectedFiles.splice(page.selectedFiles.indexOf(id), 1)
  }

  if (page.selectedFiles.length) {
    localStorage.selectedFiles = JSON.stringify(page.selectedFiles)
  } else {
    localStorage.removeItem('selectedFiles')
  }
}

page.clearSelection = async () => {
  const count = page.selectedFiles.length
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

  page.selectedFiles = []
  localStorage.removeItem('selectedFiles')

  const selectAll = document.getElementById('selectAll')
  if (selectAll) { selectAll.checked = false }

  return swal('Cleared selection!', `Unselected ${count} ${suffix}.`, 'success')
}

page.deleteFile = id => {
  // TODO: Share function with bulk delete, just like 'add selected files to album' and 'add single file to album'
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
            return page.verifyToken(page.token)
          } else {
            return swal('An error occurred!', response.data.description, 'error')
          }
        }

        swal('Deleted!', 'The file has been deleted.', 'success')
        page.getUploads(page.currentView.album, page.currentView.pageNum)
      })
      .catch(error => {
        console.log(error)
        return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
      })
  })
}

page.deleteSelectedFiles = async () => {
  const count = page.selectedFiles.length
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
    ids: page.selectedFiles
  })
    .catch(error => {
      console.log(error)
      swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!bulkdelete) { return }

  if (bulkdelete.data.success === false) {
    if (bulkdelete.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', bulkdelete.data.description, 'error')
    }
  }

  let deleted = count
  if (bulkdelete.data.failedids && bulkdelete.data.failedids.length) {
    deleted -= bulkdelete.data.failedids.length
    page.selectedFiles = page.selectedFiles.filter(id => bulkdelete.data.failedids.includes(id))
  } else {
    page.selectedFiles = []
  }

  localStorage.selectedFiles = JSON.stringify(page.selectedFiles)

  swal('Deleted!', `${deleted} file${deleted === 1 ? ' has' : 's have'} been deleted.`, 'success')
  return page.getUploads(page.currentView.album, page.currentView.pageNum)
}

page.addSelectedFilesToAlbum = async () => {
  const count = page.selectedFiles.length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any files.', 'error')
  }

  const failedids = await page.addFilesToAlbum(page.selectedFiles)
  if (!failedids) { return }
  if (failedids.length) {
    page.selectedFiles = page.selectedFiles.filter(id => failedids.includes(id))
  } else {
    page.selectedFiles = []
  }
  localStorage.selectedFiles = JSON.stringify(page.selectedFiles)
  page.getUploads(page.currentView.album, page.currentView.pageNum)
}

page.addSingleFileToAlbum = async id => {
  const failedids = await page.addFilesToAlbum([id])
  if (!failedids) { return }
  page.getUploads(page.currentView.album, page.currentView.pageNum)
}

page.addFilesToAlbum = async ids => {
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
      page.verifyToken(page.token)
    } else {
      swal('An error occurred!', list.data.description, 'error')
    }
    return
  }

  if (!page.selectAlbumContainer) {
    // We want to this to be re-usable
    page.selectAlbumContainer = document.createElement('div')
    page.selectAlbumContainer.id = 'selectAlbum'
  }

  const options = list.data.albums
    .map(album => `<option value="${album.id}">${album.name}</option>`)
    .join('\n')

  page.selectAlbumContainer.innerHTML = `
    <div class="field">
      <label class="label">If a file is already in an album, it will be moved.</label>
      <div class="control">
        <div class="select is-fullwidth">
          <select>
            <option value="-1">Remove from album</option>
            <option value="" selected disabled>Choose an album</option>
            ${options}
          </select>
        </div>
    </div>
  `

  const choose = await swal({
    content: page.selectAlbumContainer,
    buttons: {
      cancel: true,
      confirm: {
        text: 'OK',
        closeModal: false
      }
    }
  })
  if (!choose) { return }

  const albumid = parseInt(page.selectAlbumContainer.getElementsByTagName('select')[0].value)
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
      page.verifyToken(page.token)
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
  return add.data.failedids
}

page.getAlbums = () => {
  axios.get('api/albums').then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    page.dom.innerHTML = `
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

    page.albums = response.data.albums

    const homeDomain = response.data.homeDomain
    const table = document.getElementById('table')

    for (const album of response.data.albums) {
      const albumUrl = `${homeDomain}/a/${album.identifier}`
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <tr>
          <th>${album.id}</th>
          <th>${album.name}</th>
          <th>${album.files}</th>
          <td>${album.date}</td>
          <td><a${album.public ? ` href="${albumUrl}"` : ''} target="_blank" rel="noopener">${albumUrl}</a></td>
          <td style="text-align: right">
            <a class="button is-small is-primary" title="Edit album" onclick="page.editAlbum(${album.id})">
              <span class="icon is-small">
                <i class="icon-pencil-1"></i>
              </span>
            </a>
            <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" ${album.public ? `data-clipboard-text="${album.identifier}"` : 'disabled'}>
              <span class="icon is-small">
                <i class="icon-clipboard-1"></i>
              </span>
            </a>
            <a class="button is-small is-warning" title="Download album" ${album.download ? `href="api/album/zip/${album.identifier}?v=${album.editedAt}"` : 'disabled'}>
              <span class="icon is-small">
                <i class="icon-download"></i>
              </span>
            </a>
            <a class="button is-small is-danger" title="Delete album" onclick="page.deleteAlbum(${album.id})">
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
      page.submitAlbum(this)
    })
  })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.editAlbum = async id => {
  const album = page.albums.find(a => a.id === id)
  if (!album) {
    return swal('An error occurred!', 'Album with that ID could not be found.', 'error')
  }

  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <label class="label">Album name</label>
      <div class="controls">
        <input id="_name" class="input" type="text" value="${album.name || 'My super album'}">
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="_download" type="checkbox" ${album.download ? 'checked' : ''}>
          Enable download
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="_public" type="checkbox" ${album.public ? 'checked' : ''}>
          Enable public link
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="_requestLink" type="checkbox">
          Request new public link
        </label>
      </div>
    </div>
  `
  const value = await swal({
    title: 'Edit album',
    icon: 'info',
    content: div,
    buttons: {
      cancel: true,
      confirm: {
        closeModal: false
      }
    }
  })
  if (!value) { return }

  const response = await axios.post('api/albums/edit', {
    id,
    name: document.getElementById('_name').value,
    download: document.getElementById('_download').checked,
    public: document.getElementById('_public').checked,
    requestLink: document.getElementById('_requestLink').checked
  })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else if (response.data.description === 'Name already in use') {
      return swal.showInputError('That name is already in use!')
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  if (response.data.identifier) {
    swal('Success!', `Your album's new identifier is: ${response.data.identifier}.`, 'success')
  } else if (response.data.name !== album.name) {
    swal('Success!', `Your album was renamed to: ${response.data.name}.`, 'success')
  } else {
    swal('Success!', 'Your album was edited!', 'success')
  }

  page.getAlbumsSidebar()
  page.getAlbums()
}

page.deleteAlbum = async id => {
  const proceed = await swal({
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
  })
  if (!proceed) { return }

  const response = await axios.post('api/albums/delete', {
    id,
    purge: proceed === 'purge'
  })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  swal('Deleted!', 'Your album has been deleted.', 'success')
  page.getAlbumsSidebar()
  page.getAlbums()
}

page.submitAlbum = element => {
  page.isLoading(element, true)
  axios.post('api/albums', {
    name: document.getElementById('albumName').value
  })
    .then(response => {
      page.isLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      swal('Woohoo!', 'Album was added successfully', 'success')
      page.getAlbumsSidebar()
      page.getAlbums()
    })
    .catch(error => {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.getAlbumsSidebar = () => {
  axios.get('api/albums/sidebar')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
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
          page.getAlbum(this)
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

page.getAlbum = album => {
  page.setActiveMenu(album)
  page.getUploads(album.id)
}

page.changeFileLength = () => {
  axios.get('api/filelength/config')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      page.dom.innerHTML = `
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
        page.setFileLength(document.getElementById('fileLength').value, this)
      })
    })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.setFileLength = (fileLength, element) => {
  page.isLoading(element, true)
  axios.post('api/filelength/change', { fileLength })
    .then(response => {
      page.isLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
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
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.changeToken = () => {
  axios.get('api/tokens')
    .then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      page.dom.innerHTML = `
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
        page.getNewToken(this)
      })
    })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.getNewToken = element => {
  page.isLoading(element, true)
  axios.post('api/tokens/change')
    .then(response => {
      page.isLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
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
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.changePassword = () => {
  page.dom.innerHTML = `
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
      page.sendNewPassword(document.getElementById('password').value, this)
    } else {
      swal({
        title: 'Password mismatch!',
        text: 'Your passwords do not match, please try again.',
        icon: 'error'
      }).then(() => {
        page.changePassword()
      })
    }
  })
}

page.sendNewPassword = (pass, element) => {
  page.isLoading(element, true)
  axios.post('api/password/change', { password: pass })
    .then(response => {
      page.isLoading(element, false)
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
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
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.setActiveMenu = item => {
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
    page.selectedFiles = JSON.parse(selectedFiles)
  }

  page.preparePage()

  page.clipboardJS = new ClipboardJS('.clipboard-js')

  page.clipboardJS.on('success', () => {
    return swal('Copied!', 'The link has been copied to clipboard.', 'success')
  })

  page.clipboardJS.on('error', event => {
    console.error(event)
    return swal('An error occurred!', 'There was an error when trying to copy the link to clipboard, please check the console for more information.', 'error')
  })

  page.lazyLoad = new LazyLoad()
}
