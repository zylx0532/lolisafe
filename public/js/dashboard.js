/* global swal, axios, ClipboardJS, LazyLoad */

var page = {
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
  files: {},
  albums: {},

  clipboardJS: null,
  lazyLoad: null
}

page.preparePage = function () {
  if (!page.token) {
    window.location = 'auth'
    return
  }
  page.verifyToken(page.token, true)
}

page.verifyToken = function (token, reloadOnError) {
  axios.post('api/tokens/verify', { token })
    .then(function (response) {
      if (response.data.success === false) {
        return swal({
          title: 'An error occurred!',
          text: response.data.description,
          icon: 'error'
        })
          .then(function () {
            if (!reloadOnError) { return }
            localStorage.removeItem('token')
            location.location = 'auth'
          })
      }

      axios.defaults.headers.common.token = token
      localStorage.token = token
      page.token = token
      page.username = response.data.username
      page.prepareDashboard()
    })
    .catch(function (error) {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.prepareDashboard = function () {
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

page.logout = function () {
  localStorage.removeItem('token')
  location.reload('.')
}

page.isLoading = function (element, state) {
  if (!element) { return }
  if (state) { return element.classList.add('is-loading') }
  element.classList.remove('is-loading')
}

page.getUploads = function (album, pageNum, element) {
  if (element) { page.isLoading(element, true) }
  if (pageNum === undefined) { pageNum = 0 }

  var url = 'api/uploads/' + pageNum
  if (album !== undefined) { url = 'api/album/' + album + '/' + pageNum }

  axios.get(url)
    .then(function (response) {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      page.files = {}

      var prevPage = 0
      var nextPage = pageNum + 1

      if (response.data.files.length < 25) { nextPage = pageNum }

      if (pageNum > 0) { prevPage = pageNum - 1 }

      var pagination = `
        <nav class="pagination is-centered">
          <a class="button pagination-previous" onclick="page.getUploads(${album}, ${prevPage}, this)">Previous</a>
          <a class="button pagination-next" onclick="page.getUploads(${album}, ${nextPage}, this)">Next page</a>
        </nav>
      `
      var controls = `
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

      var allFilesSelected = true
      var table
      var file
      var selected
      var displayAlbumOrUser

      if (page.filesView === 'thumbs') {
        page.dom.innerHTML = `
        ${pagination}
        <hr>
        ${controls}
        <div id="table" class="columns is-multiline is-mobile is-centered">

        </div>
        ${pagination}
      `

        table = document.getElementById('table')

        for (file of response.data.files) {
          selected = page.selectedFiles.includes(file.id)
          if (!selected && allFilesSelected) { allFilesSelected = false }


          displayAlbumOrUser = file.album
          if (page.username === 'root') {
            displayAlbumOrUser = ''
            if (file.username !== undefined) { displayAlbumOrUser = file.username }
          }

          var div = document.createElement('div')
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
        var albumOrUser = 'Album'
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

        table = document.getElementById('table')

        for (file of response.data.files) {
          selected = page.selectedFiles.includes(file.id)
          if (!selected && allFilesSelected) { allFilesSelected = false }

          page.files[file.id] = {
            name: file.name,
            thumb: file.thumb
          }

          displayAlbumOrUser = file.album
          if (page.username === 'root') {
            displayAlbumOrUser = ''
            if (file.username !== undefined) { displayAlbumOrUser = file.username }
          }

          var tr = document.createElement('tr')
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
        var selectAll = document.getElementById('selectAll')
        if (selectAll) { selectAll.checked = true }
      }

      page.currentView.album = album
      page.currentView.pageNum = pageNum
    })
    .catch(function (error) {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.setFilesView = function (view, element) {
  localStorage.filesView = view
  page.filesView = view
  page.getUploads(page.currentView.album, page.currentView.pageNum, element)
}

page.displayThumbnail = function (id) {
  var file = page.files[id]
  if (!file.thumb) { return }
  return swal({
    text: file.name,
    content: {
      element: 'img',
      attributes: { src: file.thumb }
    },
    button: true
  })
}

page.selectAllFiles = function (element) {
  var table = document.getElementById('table')
  var checkboxes = table.getElementsByClassName('file-checkbox')

  for (var checkbox of checkboxes) {
    var id = parseInt(checkbox.dataset.id)
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

page.selectInBetween = function (element, lastElement) {
  if (!element || !lastElement) { return }
  if (element === lastElement) { return }
  if (!page.checkboxes || !page.checkboxes.length) { return }

  var thisIndex = page.checkboxes.indexOf(element)
  var lastIndex = page.checkboxes.indexOf(lastElement)

  var distance = thisIndex - lastIndex
  if (distance >= -1 && distance <= 1) { return }

  for (var i = 0; i < page.checkboxes.length; i++) {
    if ((thisIndex > lastIndex && i > lastIndex && i < thisIndex) ||
      (thisIndex < lastIndex && i > thisIndex && i < lastIndex)) {
      page.checkboxes[i].checked = true
      page.selectedFiles.push(parseInt(page.checkboxes[i].dataset.id))
    }
  }

  localStorage.selectedFiles = JSON.stringify(page.selectedFiles)
}

page.selectFile = function (element, event) {
  if (event.shiftKey && page.lastSelected) {
    page.selectInBetween(element, page.lastSelected)
  } else {
    page.lastSelected = element
  }

  var id = parseInt(element.dataset.id)

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

page.clearSelection = function () {
  var count = page.selectedFiles.length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any files.', 'error')
  }

  var suffix = `file${count === 1 ? '' : 's'}`
  return swal({
    title: 'Are you sure?',
    text: `You are going to unselect ${count} ${suffix}.`,
    buttons: true
  })
    .then(function (proceed) {
      if (!proceed) { return }

      var table = document.getElementById('table')
      var checkboxes = table.getElementsByClassName('file-checkbox')

      for (var checkbox of checkboxes) {
        if (checkbox.checked) {
          checkbox.checked = false
        }
      }

      page.selectedFiles = []
      localStorage.removeItem('selectedFiles')

      var selectAll = document.getElementById('selectAll')
      if (selectAll) { selectAll.checked = false }

      return swal('Cleared selection!', `Unselected ${count} ${suffix}.`, 'success')
    })
}

page.deleteFile = function (id) {
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
  })
    .then(function (proceed) {
      if (!proceed) { return }

      axios.post('api/upload/delete', { id })
        .then(function (response) {
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
        })
        .catch(function (error) {
          console.log(error)
          return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
        })
    })
}

page.deleteSelectedFiles = function () {
  var count = page.selectedFiles.length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any files.', 'error')
  }

  var suffix = `file${count === 1 ? '' : 's'}`
  swal({
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
    .then(function (proceed) {
      if (!proceed) { return }

      axios.post('api/upload/bulkdelete', {
        field: 'id',
        values: page.selectedFiles
      })
        .then(function (bulkdelete) {
          if (!bulkdelete) { return }

          if (bulkdelete.data.success === false) {
            if (bulkdelete.data.description === 'No token provided') {
              return page.verifyToken(page.token)
            } else {
              return swal('An error occurred!', bulkdelete.data.description, 'error')
            }
          }

          var deleted = count
          if (bulkdelete.data.failed && bulkdelete.data.failed.length) {
            deleted -= bulkdelete.data.failed.length
            page.selectedFiles = page.selectedFiles.filter(function (id) {
              return bulkdelete.data.failed.includes(id)
            })
          } else {
            page.selectedFiles = []
          }

          localStorage.selectedFiles = JSON.stringify(page.selectedFiles)

          swal('Deleted!', `${deleted} file${deleted === 1 ? ' has' : 's have'} been deleted.`, 'success')
          return page.getUploads(page.currentView.album, page.currentView.pageNum)
        })
        .catch(function (error) {
          console.log(error)
          swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
        })
    })
}

page.deleteByNames = function () {
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

page.deleteFileByNames = function () {
  var names = document.getElementById('names').value
    .split(/\r?\n/)
    .filter(function (n) {
      return n.trim().length
    })
  var count = names.length
  if (!count) {
    return swal('An error occurred!', 'You have not entered any file names.', 'error')
  }

  var suffix = `file${count === 1 ? '' : 's'}`
  swal({
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
    .then(function (proceed) {
      if (!proceed) { return }

      axios.post('api/upload/bulkdelete', {
        field: 'name',
        values: names
      })
        .then(function (bulkdelete) {
          if (!bulkdelete) { return }

          if (bulkdelete.data.success === false) {
            if (bulkdelete.data.description === 'No token provided') {
              return page.verifyToken(page.token)
            } else {
              return swal('An error occurred!', bulkdelete.data.description, 'error')
            }
          }

          var deleted = count
          if (bulkdelete.data.failed && bulkdelete.data.failed.length) {
            deleted -= bulkdelete.data.failed.length
          }

          document.getElementById('names').value = bulkdelete.data.failed.join('\n')
          swal('Deleted!', `${deleted} file${deleted === 1 ? ' has' : 's have'} been deleted.`, 'success')
        })
        .catch(function (error) {
          console.log(error)
          swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
        })
    })
}

page.addSelectedFilesToAlbum = function () {
  var count = page.selectedFiles.length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any files.', 'error')
  }

  page.addFilesToAlbum(page.selectedFiles, function (failed) {
    if (!failed) { return }
    if (failed.length) {
      page.selectedFiles = page.selectedFiles.filter(function (id) {
        return failed.includes(id)
      })
    } else {
      page.selectedFiles = []
    }
    localStorage.selectedFiles = JSON.stringify(page.selectedFiles)
    page.getUploads(page.currentView.album, page.currentView.pageNum)
  })
}

page.addSingleFileToAlbum = function (id) {
  page.addFilesToAlbum([id], function (failed) {
    if (!failed) { return }
    page.getUploads(page.currentView.album, page.currentView.pageNum)
  })
}

page.addFilesToAlbum = function (ids, callback) {
  var count = ids.length
  return swal({
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
    .then(function (proceed) {
      if (!proceed) { return }

      axios.get('api/albums')
        .then(function (list) {
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

          var options = list.data.albums
            .map(function (album) {
              return `<option value="${album.id}">${album.name}</option>`
            })
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

          return swal({
            content: page.selectAlbumContainer,
            buttons: {
              cancel: true,
              confirm: {
                text: 'OK',
                closeModal: false
              }
            }
          })
            .then(function (choose) {
              if (!choose) { return }

              var albumid = parseInt(page.selectAlbumContainer.getElementsByTagName('select')[0].value)
              if (isNaN(albumid)) {
                return swal('An error occurred!', 'You did not choose an album.', 'error')
              }

              axios.post('api/albums/addfiles', { ids, albumid })
                .then(function (add) {
                  if (!add) { return }

                  if (add.data.success === false) {
                    if (add.data.description === 'No token provided') {
                      page.verifyToken(page.token)
                    } else {
                      swal('An error occurred!', add.data.description, 'error')
                    }
                    return
                  }

                  var added = ids.length
                  if (add.data.failed && add.data.failed.length) {
                    added -= add.data.failed.length
                  }

                  var suffix = `file${ids.length === 1 ? '' : 's'}`
                  if (!added) {
                    return swal('An error occurred!', `Could not add the ${suffix} to the album.`, 'error')
                  }

                  swal('Woohoo!', `Successfully ${albumid < 0 ? 'removed' : 'added'} ${added} ${suffix} ${albumid < 0 ? 'from' : 'to'} the album.`, 'success')
                  return callback(add.data.failed)
                })
                .catch(function (error) {
                  console.log(error)
                  return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
                })
            })
        })
        .catch(function (error) {
          console.log(error)
          return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
        })
    })
}

page.getAlbums = function () {
  axios.get('api/albums')
    .then(function (response) {
      if (!response) { return }

      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      page.albums = {}

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

      var homeDomain = response.data.homeDomain
      var table = document.getElementById('table')

      for (var album of response.data.albums) {
        var albumUrl = `${homeDomain}/a/${album.identifier}`

        page.albums[album.id] = {
          name: album.name,
          download: album.download,
          public: album.public
        }

        var tr = document.createElement('tr')
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
    })
    .catch(function (error) {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.editAlbum = function (id) {
  var album = page.albums[id]
  if (!album) { return }

  var div = document.createElement('div')
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
  swal({
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
    .then(function (value) {
      if (!value) { return }

      axios.post('api/albums/edit', {
        id,
        name: document.getElementById('_name').value,
        download: document.getElementById('_download').checked,
        public: document.getElementById('_public').checked,
        requestLink: document.getElementById('_requestLink').checked
      })
        .then(function (response) {
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
        })
        .catch(function (error) {
          console.log(error)
          return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
        })
    })
}

page.deleteAlbum = function (id) {
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
  })
    .then(function (proceed) {
      if (!proceed) { return }

      axios.post('api/albums/delete', {
        id,
        purge: proceed === 'purge'
      })
        .then(function (response) {
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
        })
        .catch(function (error) {
          console.log(error)
          return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
        })
    })
}

page.submitAlbum = function (element) {
  page.isLoading(element, true)

  axios.post('api/albums', {
    name: document.getElementById('albumName').value
  })
    .then(function (response) {
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
    })
    .catch(function (error) {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.getAlbumsSidebar = function () {
  axios.get('api/albums/sidebar')
    .then(function (response) {
      if (!response) { return }

      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      var albumsContainer = document.getElementById('albumsContainer')
      albumsContainer.innerHTML = ''

      if (response.data.albums === undefined) { return }

      for (var album of response.data.albums) {
        var li = document.createElement('li')
        var a = document.createElement('a')
        a.id = album.id
        a.innerHTML = album.name

        a.addEventListener('click', function () {
          page.getAlbum(this)
        })

        li.appendChild(a)
        albumsContainer.appendChild(li)
      }
    })
    .catch(function (error) {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.getAlbum = function (album) {
  page.setActiveMenu(album)
  page.getUploads(album.id)
}

page.changeFileLength = function () {
  axios.get('api/filelength/config')
    .then(function (response) {
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
    })
    .catch(function (error) {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.setFileLength = function (fileLength, element) {
  page.isLoading(element, true)

  axios.post('api/filelength/change', { fileLength })
    .then(function (response) {
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
      })
        .then(function () {
          page.changeFileLength()
        })
    })
    .catch(function (error) {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.changeToken = function () {
  axios.get('api/tokens')
    .then(function (response) {

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
    })
    .catch(function (error) {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.getNewToken = function (element) {
  page.isLoading(element, true)

  axios.post('api/tokens/change')
    .then(function (response) {
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
      })
        .then(function () {
          axios.defaults.headers.common.token = response.data.token
          localStorage.token = response.data.token
          page.token = response.data.token
          page.changeToken()
        })
    })
    .catch(function (error) {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

page.changePassword = function () {
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

page.sendNewPassword = function (pass, element) {
  page.isLoading(element, true)

  axios.post('api/password/change', { password: pass })
    .then(function (response) {
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
      })
        .then(function () {
          page.changePassword()
        })
    })
    .catch(function (error) {
      console.log(error)
      page.isLoading(element, false)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })

}

page.setActiveMenu = function (activeItem) {
  var menu = document.getElementById('menu')
  var items = menu.getElementsByTagName('a')
  for (var item of items) { item.classList.remove('is-active') }

  activeItem.classList.add('is-active')
}

window.onload = function () {
  // Add 'no-touch' class to non-touch devices
  if (!('ontouchstart' in document.documentElement)) {
    document.documentElement.classList.add('no-touch')
  }

  var selectedFiles = localStorage.selectedFiles
  if (selectedFiles) {
    page.selectedFiles = JSON.parse(selectedFiles)
  }

  page.preparePage()

  page.clipboardJS = new ClipboardJS('.clipboard-js')

  page.clipboardJS.on('success', function () {
    return swal('Copied!', 'The link has been copied to clipboard.', 'success')
  })

  page.clipboardJS.on('error', function (event) {
    console.error(event)
    return swal('An error occurred!', 'There was an error when trying to copy the link to clipboard, please check the console for more information.', 'error')
  })

  page.lazyLoad = new LazyLoad()
}
