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

  // select album dom for dialogs/modals
  selectAlbumContainer: null,

  // cache of files and albums data for dialogs/modals
  files: new Map(),
  albums: new Map(),

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

page.verifyToken = async (token, reloadOnError = false) => {
  const response = await axios.post('api/tokens/verify', { token })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  if (response.data.success === false) {
    await swal({
      title: 'An error occurred!',
      text: response.data.description,
      icon: 'error'
    })
    if (reloadOnError) {
      localStorage.removeItem('token')
      location.location = 'auth'
    }
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

  document.getElementById('itemDeleteByNames').addEventListener('click', function () {
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

page.isLoading = (element, state) => {
  if (!element) { return }
  if (state) { return element.classList.add('is-loading') }
  element.classList.remove('is-loading')
}

page.getUploads = async (album, pageNum, element) => {
  if (element) { page.isLoading(element, true) }
  if (pageNum === undefined) { pageNum = 0 }

  let url = 'api/uploads/' + pageNum
  if (album !== undefined) { url = 'api/album/' + album + '/' + pageNum }

  const response = await axios.get(url)
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  page.files.clear()

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

      page.files.set(file.id, {
        name: file.name,
        thumb: file.thumb
      })

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
            <a class="button is-small is-primary" title="View thumbnail" onclick="page.displayThumbnail(${file.id})"${file.thumb ? '' : ' disabled'}>
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
}

page.setFilesView = (view, element) => {
  localStorage.filesView = view
  page.filesView = view
  page.getUploads(page.currentView.album, page.currentView.pageNum, element)
}

page.displayThumbnail = id => {
  const file = page.files.get(id)
  if (!file.thumb) { return }
  swal({
    text: file.name,
    content: {
      element: 'img',
      attributes: { src: file.thumb }
    },
    button: true
  })
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

page.deleteFile = async id => {
  // TODO: Share function with bulk delete, just like 'add selected files to album' and 'add single file to album'
  const proceed = await swal({
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
  })
  if (!proceed) { return }

  const response = await axios.post('api/upload/delete', { id })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  swal('Deleted!', 'The file has been deleted.', 'success')
  page.getUploads(page.currentView.album, page.currentView.pageNum)
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
    field: 'id',
    values: page.selectedFiles
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
  if (bulkdelete.data.failed && bulkdelete.data.failed.length) {
    deleted -= bulkdelete.data.failed.length
    page.selectedFiles = page.selectedFiles.filter(id => bulkdelete.data.failed.includes(id))
  } else {
    page.selectedFiles = []
  }

  localStorage.selectedFiles = JSON.stringify(page.selectedFiles)

  swal('Deleted!', `${deleted} file${deleted === 1 ? ' has' : 's have'} been deleted.`, 'success')
  return page.getUploads(page.currentView.album, page.currentView.pageNum)
}

page.deleteByNames = () => {
  page.dom.innerHTML = `
    <h2 class="subtitle">Delete by names</h2>

    <div class="field">
      <label class="label">File names:</label>
      <div class="control">
        <textarea id="names" class="textarea"></textarea>
      </div>
      <p class="help">Separate each entry with a new line.</p>
    </div>

    <div class="field">
      <div class="control">
        <a class="button is-danger is-fullwidth" onclick="page.deleteFileByNames()">
          <span class="icon">
            <i class="icon-trash"></i>
          </span>
          <span>Bulk delete</span>
        </a>
      </div>
    </div>
  `
}

page.deleteFileByNames = async () => {
  const names = document.getElementById('names').value.split(/\r?\n/).filter(n => n.trim().length)
  const count = names.length
  if (!count) {
    return swal('An error occurred!', 'You have not entered any file names.', 'error')
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
    field: 'name',
    values: names
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
  if (bulkdelete.data.failed && bulkdelete.data.failed.length) {
    deleted -= bulkdelete.data.failed.length
    document.getElementById('names').value = bulkdelete.data.failed.join('\n')
  }

  swal('Deleted!', `${deleted} file${deleted === 1 ? ' has' : 's have'} been deleted.`, 'success')
}

page.addSelectedFilesToAlbum = async () => {
  const count = page.selectedFiles.length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any files.', 'error')
  }

  const failed = await page.addFilesToAlbum(page.selectedFiles)
  if (!failed) { return }
  if (failed.length) {
    page.selectedFiles = page.selectedFiles.filter(id => failed.includes(id))
  } else {
    page.selectedFiles = []
  }
  localStorage.selectedFiles = JSON.stringify(page.selectedFiles)
  page.getUploads(page.currentView.album, page.currentView.pageNum)
}

page.addSingleFileToAlbum = async id => {
  const failed = await page.addFilesToAlbum([id])
  if (!failed) { return }
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
  if (add.data.failed && add.data.failed.length) {
    added -= add.data.failed.length
  }
  const suffix = `file${ids.length === 1 ? '' : 's'}`

  if (!added) {
    swal('An error occurred!', `Could not add the ${suffix} to the album.`, 'error')
    return
  }

  swal('Woohoo!', `Successfully ${albumid < 0 ? 'removed' : 'added'} ${added} ${suffix} ${albumid < 0 ? 'from' : 'to'} the album.`, 'success')
  return add.data.failed
}

page.getAlbums = async () => {
  const response = await axios.get('api/albums')
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  page.albums.clear()

  page.dom.innerHTML = `
    <h2 class="subtitle">Create new album</h2>

    <div class="field">
      <div class="control">
        <input id="albumName" class="input" type="text" placeholder="Name">
      </div>
    </div>

    <div class="field">
      <div class="control">
        <a id="submitAlbum" class="button is-breeze is-fullwidth" onclick="page.submitAlbum(this)">
          <span class="icon">
            <i class="icon-paper-plane-empty"></i>
          </span>
          <span>Create</span>
        </a>
      </div>
    </div>

    <hr>

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

  const homeDomain = response.data.homeDomain
  const table = document.getElementById('table')

  for (const album of response.data.albums) {
    const albumUrl = `${homeDomain}/a/${album.identifier}`

    page.albums.set(album.id, {
      name: album.name,
      download: album.download,
      public: album.public
    })

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
          <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" ${album.public ? `data-clipboard-text="${albumUrl}"` : 'disabled'}>
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
}

page.editAlbum = async id => {
  const album = page.albums.get(id)
  if (!album) { return }

  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <label class="label">Album name</label>
      <div class="controls">
        <input id="_name" class="input" type="text" value="${album.name || ''}">
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
  if (!response) { return }

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
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

page.submitAlbum = async element => {
  page.isLoading(element, true)

  const response = await axios.post('api/albums', {
    name: document.getElementById('albumName').value
  })
    .catch(error => {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  page.isLoading(element, false)

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  swal('Woohoo!', 'Album was created successfully', 'success')
  page.getAlbumsSidebar()
  page.getAlbums()
}

page.getAlbumsSidebar = async () => {
  const response = await axios.get('api/albums/sidebar')
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

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
}

page.getAlbum = album => {
  page.setActiveMenu(album)
  page.getUploads(album.id)
}

page.changeFileLength = async () => {
  const response = await axios.get('api/filelength/config')
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

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
      <div class="field">
        <label class="label">Your current file name length:</label>
        <div class="control">
          <input id="fileLength" class="input" type="text" placeholder="Your file length" value="${response.data.fileLength ? Math.min(Math.max(response.data.fileLength, response.data.config.min), response.data.config.max) : response.data.config.default}">
        </div>
        <p class="help">Default file name length is <b>${response.data.config.default}</b> characters. ${response.data.config.userChangeable ? `Range allowed for user is <b>${response.data.config.min}</b> to <b>${response.data.config.max}</b> characters.` : 'Changing file name length is disabled at the moment.'}</p>
      </div>

      <div class="field">
        <div class="control">
          <a id="setFileLength" class="button is-breeze is-fullwidth">
            <span class="icon">
              <i class="icon-paper-plane-empty"></i>
            </span>
            <span>Set file name length</span>
          </a>
        </div>
      <div>
    </div>
  `

  document.getElementById('setFileLength').addEventListener('click', function () {
    page.setFileLength(document.getElementById('fileLength').value, this)
  })
}

page.setFileLength = async (fileLength, element) => {
  page.isLoading(element, true)

  const response = await axios.post('api/filelength/change', { fileLength })
    .catch(error => {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  page.isLoading(element, false)

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  await swal({
    title: 'Woohoo!',
    text: 'Your file length was successfully changed.',
    icon: 'success'
  })

  page.changeFileLength()
}

page.changeToken = async () => {
  const response = await axios.get('api/tokens')
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

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
      <div class="field">
        <div class="control">
          <input id="token" readonly class="input" type="text" placeholder="Your token" value="${response.data.token}">
        </div>
      </div>
    </div>

    <div class="field">
      <div class="control">
        <a id="getNewToken" class="button is-breeze is-fullwidth" onclick="page.getNewToken(this)">
          <span class="icon">
            <i class="icon-arrows-cw"></i>
          </span>
          <span>Request new token</span>
        </a>
      </div>
    </div>
  `
}

page.getNewToken = async element => {
  page.isLoading(element, true)

  const response = await axios.post('api/tokens/change')
    .catch(error => {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  page.isLoading(element, false)

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  await swal({
    title: 'Woohoo!',
    text: 'Your token was successfully changed.',
    icon: 'success'
  })

  axios.defaults.headers.common.token = response.data.token
  localStorage.token = response.data.token
  page.token = response.data.token
  page.changeToken()
}

page.changePassword = () => {
  page.dom.innerHTML = `
    <h2 class="subtitle">Change your password</h2>

    <div class="field">
      <label class="label">New password:</label>
      <div class="control">
        <input id="password" class="input" type="password">
      </div>
    </div>

    <div class="field">
      <label class="label">Re-type new password:</label>
      <div class="control">
        <input id="passwordConfirm" class="input" type="password">
      </div>
    </div>

    <div class="field">
      <div class="control">
        <a id="sendChangePassword" class="button is-breeze is-fullwidth">
          <span class="icon">
            <i class="icon-paper-plane-empty"></i>
          </span>
          <span>Set new password</span>
        </a>
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
      })
    }
  })
}

page.sendNewPassword = async (pass, element) => {
  page.isLoading(element, true)

  const response = await axios.post('api/password/change', { password: pass })
    .catch(error => {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  page.isLoading(element, false)

  if (response.data.success === false) {
    if (response.data.description === 'No token provided') {
      return page.verifyToken(page.token)
    } else {
      return swal('An error occurred!', response.data.description, 'error')
    }
  }

  await swal({
    title: 'Woohoo!',
    text: 'Your password was successfully changed.',
    icon: 'success'
  })

  page.changePassword()
}

page.setActiveMenu = activeItem => {
  const menu = document.getElementById('menu')
  const items = menu.getElementsByTagName('a')
  for (const item of items) { item.classList.remove('is-active') }

  activeItem.classList.add('is-active')
}

window.onload = () => {
  // Add 'no-touch' class to non-touch devices
  if (!('ontouchstart' in document.documentElement)) {
    document.documentElement.classList.add('no-touch')
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
