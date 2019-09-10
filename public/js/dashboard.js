/* global swal, axios, ClipboardJS, LazyLoad */

const lsKeys = {
  token: 'token',
  viewType: {
    uploads: 'viewTypeUploads',
    uploadsAll: 'viewTypeUploadsAll'
  },
  selected: {
    uploads: 'selectedUploads',
    uploadsAll: 'selectedUploadsAll',
    users: 'selectedUsers'
  }
}

const page = {
  // #page
  dom: null,

  // user token
  token: localStorage[lsKeys.token],

  // from api/tokens/verify
  username: null,
  permissions: null,

  // sidebar menus
  menus: [],

  currentView: null,
  views: {
    // config of uploads view
    uploads: {
      type: localStorage[lsKeys.viewType.uploads],
      album: null, // album's id
      pageNum: null // page num
    },
    // config of uploads view (all)
    uploadsAll: {
      type: localStorage[lsKeys.viewType.uploadsAll],
      filters: null, // uploads' filters
      pageNum: null, // page num
      all: true
    },
    // config of users view
    users: {
      pageNum: null
    }
  },

  // id of selected items (shared across pages and will be synced with localStorage)
  selected: {
    uploads: [],
    uploadsAll: [],
    users: []
  },
  checkboxes: {
    uploads: [],
    uploadsAll: [],
    users: []
  },
  lastSelected: {
    upload: null,
    uploadsAll: null,
    user: null
  },

  // select album dom for dialogs/modals
  selectAlbumContainer: null,

  // cache for dialogs/modals
  cache: {
    uploads: {},
    albums: {},
    users: {}
  },

  clipboardJS: null,
  lazyLoad: null,

  imageExts: ['.webp', '.jpg', '.jpeg', '.gif', '.png', '.tiff', '.tif', '.svg'],
  videoExts: ['.webm', '.mp4', '.wmv', '.avi', '.mov', '.mkv'],

  fadingIn: null
}

page.preparePage = function () {
  if (!page.token) {
    window.location = 'auth'
    return
  }
  page.verifyToken(page.token, true)
}

page.verifyToken = function (token, reloadOnError) {
  axios.post('api/tokens/verify', { token }).then(function (response) {
    if (response.data.success === false)
      return swal({
        title: 'An error occurred!',
        text: response.data.description,
        icon: 'error'
      }).then(function () {
        if (!reloadOnError) return
        localStorage.removeItem(lsKeys.token)
        location.location = 'auth'
      })

    axios.defaults.headers.common.token = token
    localStorage[lsKeys.token] = token
    page.token = token
    page.username = response.data.username
    page.permissions = response.data.permissions
    page.prepareDashboard()
  }).catch(function (error) {
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.prepareDashboard = function () {
  page.dom = document.querySelector('#page')

  // Capture all click events
  page.dom.addEventListener('click', page.domClick, true)

  // Capture all submit events
  page.dom.addEventListener('submit', function (event) {
    // Prevent default if necessary
    if (event.target && event.target.classList.contains('prevent-default'))
      return event.preventDefault()
  }, true)

  // All item menus in the sidebar
  const itemMenus = [
    { selector: '#itemUploads', onclick: page.getUploads },
    { selector: '#itemDeleteUploadsByNames', onclick: page.deleteUploadsByNames },
    { selector: '#itemManageAlbums', onclick: page.getAlbums },
    { selector: '#itemManageToken', onclick: page.changeToken },
    { selector: '#itemChangePassword', onclick: page.changePassword },
    { selector: '#itemLogout', onclick: page.logout, inactive: true },
    { selector: '#itemManageUploads', onclick: page.getUploads, params: [{ all: true }], group: 'moderator' },
    { selector: '#itemStatistics', onclick: page.getStatistics, group: 'admin' },
    { selector: '#itemManageUsers', onclick: page.getUsers, group: 'admin' }
  ]

  for (let i = 0; i < itemMenus.length; i++) {
    // Skip item menu if not enough permission
    if (itemMenus[i].group && !page.permissions[itemMenus[i].group])
      continue

    // Add onclick event listener
    const item = document.querySelector(itemMenus[i].selector)
    item.addEventListener('click', function () {
      itemMenus[i].onclick.apply(null, itemMenus[i].params)
      if (!itemMenus[i].inactive)
        page.setActiveMenu(this)
    })

    item.classList.remove('is-hidden')
    page.menus.push(item)
  }

  // If at least a moderator, show administration section
  if (page.permissions.moderator) {
    document.querySelector('#itemLabelAdmin').classList.remove('is-hidden')
    document.querySelector('#itemListAdmin').classList.remove('is-hidden')
  }

  // Update text of logout button
  document.querySelector('#itemLogout').innerHTML = `Logout ( ${page.username} )`

  // Finally display dashboard
  document.querySelector('#dashboard').classList.remove('is-hidden')

  // Load albums sidebar
  page.getAlbumsSidebar()

  if (typeof page.prepareShareX === 'function')
    page.prepareShareX()
}

page.logout = function () {
  localStorage.removeItem(lsKeys.token)
  location.reload('.')
}

page.getItemID = function (element) {
  // This expects the item's parent to have the item's ID
  let parent = element.parentNode
  // If the element is part of a set of controls, use the container's parent instead
  if (element.parentNode.classList.contains('controls')) parent = parent.parentNode
  return parseInt(parent.dataset.id)
}

page.domClick = function (event) {
  // We are processing clicks this way to avoid using "onclick" attribute
  // Apparently we will need to use "unsafe-inline" for "script-src" directive
  // of Content Security Policy (CSP), if we want to use "onclick" attribute
  // Though I think that only applies to some browsers (?)
  // Of course it wouldn't have mattered if we didn't use CSP to begin with
  // Anyway, I personally would rather not use "onclick" attribute
  let element = event.target
  if (!element) return

  // Delegate click events to their A or BUTTON parents
  if (['I'].includes(element.tagName) && ['SPAN'].includes(element.parentNode.tagName))
    element = element.parentNode
  if (['SPAN'].includes(element.tagName) && ['A', 'BUTTON'].includes(element.parentNode.tagName))
    element = element.parentNode

  // Skip elements that have no action data
  if (!element.dataset || !element.dataset.action) return

  // Skip disabled elements
  if (element.hasAttribute('disabled')) return

  event.stopPropagation() // maybe necessary
  const id = page.getItemID(element)
  const action = element.dataset.action

  switch (action) {
    case 'view-list':
      return page.setUploadsView('list', element)
    case 'view-thumbs':
      return page.setUploadsView('thumbs', element)
    case 'clear-selection':
      return page.clearSelection()
    case 'add-selected-uploads-to-album':
      return page.addSelectedUploadsToAlbum()
    case 'select':
      return page.select(element, event)
    case 'select-all':
      return page.selectAll(element)
    case 'add-to-album':
      return page.addToAlbum(id)
    case 'delete-upload':
      return page.deleteUpload(id)
    case 'bulk-delete-uploads':
      return page.bulkDeleteUploads()
    case 'display-thumbnail':
      return page.displayThumbnail(id)
    case 'submit-album':
      return page.submitAlbum(element)
    case 'edit-album':
      return page.editAlbum(id)
    case 'delete-album':
      return page.deleteAlbum(id)
    case 'get-new-token':
      return page.getNewToken(element)
    case 'edit-user':
      return page.editUser(id)
    case 'disable-user':
      return page.disableUser(id)
    case 'filters-help':
      return page.filtersHelp(element)
    case 'filter-uploads':
      return page.filterUploads(element)
    case 'view-user-uploads':
      return page.viewUserUploads(id)
    case 'page-ellipsis':
      return page.focusJumpToPage()
    case 'page-prev':
    case 'page-next':
    case 'page-goto':
    case 'jump-to-page':
      return page.switchPage(action, element)
  }
}

page.isLoading = function (element, state) {
  if (!element) return
  if (state) return element.classList.add('is-loading')
  element.classList.remove('is-loading')
}

page.fadeAndScroll = function (content) {
  if (page.fadingIn) {
    clearTimeout(page.fadingIn)
    page.dom.classList.remove('fade-in')
  }
  page.dom.classList.add('fade-in')
  page.fadingIn = setTimeout(function () {
    page.dom.classList.remove('fade-in')
  }, 500)
  page.dom.scrollIntoView(true)
}

page.switchPage = function (action, element) {
  const views = {}
  let func = null

  if (page.currentView === 'users') {
    func = page.getUsers
  } else {
    func = page.getUploads
    views.album = page.views[page.currentView].album
    views.all = page.views[page.currentView].all
    views.filters = page.views[page.currentView].filters
  }

  switch (action) {
    case 'page-prev':
      views.pageNum = page.views[page.currentView].pageNum - 1
      if (views.pageNum < 0)
        return swal('An error occurred!', 'This is already the first page.', 'error')
      return func(views, element)
    case 'page-next':
      views.pageNum = page.views[page.currentView].pageNum + 1
      return func(views, element)
    case 'page-goto':
      views.pageNum = parseInt(element.dataset.goto)
      return func(views, element)
    case 'jump-to-page': {
      const jumpToPage = document.querySelector('#jumpToPage')
      if (!jumpToPage.checkValidity()) return
      const parsed = parseInt(jumpToPage.value)
      views.pageNum = isNaN(parsed) ? 0 : (parsed - 1)
      if (views.pageNum < 0) views.pageNum = 0
      return func(views, element)
    }
  }
}

page.focusJumpToPage = function () {
  const element = document.querySelector('#jumpToPage')
  if (!element) return
  element.focus()
  element.select()
}

page.getUploads = function ({ pageNum, album, all, filters, autoPage } = {}, element) {
  if (element) page.isLoading(element, true)

  if ((all || filters) && !page.permissions.moderator)
    return swal('An error occurred!', 'You can not do this!', 'error')

  if (typeof pageNum !== 'number' || pageNum < 0)
    pageNum = 0

  let url = `api/uploads/${pageNum}`
  if (typeof album === 'string')
    url = `api/album/${album}/${pageNum}`

  const headers = {}
  if (all) headers.all = '1'
  if (filters) headers.filters = filters
  axios.get(url, { headers }).then(function (response) {
    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        if (element) page.isLoading(element, false)
        return swal('An error occurred!', response.data.description, 'error')
      }

    const files = response.data.files
    if (pageNum && (files.length === 0)) {
      if (element) page.isLoading(element, false)
      if (autoPage)
        return page.getUploads({
          pageNum: Math.ceil(response.data.count / 25) - 1,
          album,
          all,
          filters
        }, element)
      else
        return swal('An error occurred!', `There are no more uploads to populate page ${pageNum + 1}.`, 'error')
    }

    page.currentView = all ? 'uploadsAll' : 'uploads'
    page.cache.uploads = {}

    const albums = response.data.albums
    const users = response.data.users
    const basedomain = response.data.basedomain
    const pagination = page.paginate(response.data.count, 25, pageNum)

    let filter = '<div class="column is-hidden-mobile"></div>'
    if (all)
      filter = `
        <div class="column">
          <form class="prevent-default">
            <div class="field has-addons">
              <div class="control is-expanded">
                <input id="filters" class="input is-small" type="text" placeholder="Filters" value="${filters || ''}">
              </div>
              <div class="control">
                <button type="button" class="button is-small is-breeze" title="Help?" data-action="filters-help">
                  <span class="icon">
                    <i class="icon-help-circled"></i>
                  </span>
                </button>
              </div>
              <div class="control">
                <button type="submit" class="button is-small is-breeze" title="Filter uploads" data-action="filter-uploads">
                  <span class="icon">
                    <i class="icon-filter"></i>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      `
    const extraControls = `
      <div class="columns" style="margin-top: 10px">
        ${filter}
        <div class="column is-one-quarter">
          <form class="prevent-default">
            <div class="field has-addons">
              <div class="control is-expanded">
                <input id="jumpToPage" class="input is-small" type="number" value="${pageNum + 1}">
              </div>
              <div class="control">
                <button type="submit" class="button is-small is-breeze" title="Jump to page" data-action="jump-to-page">
                  <span class="icon">
                    <i class="icon-paper-plane-empty"></i>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `

    const controls = `
      <div class="columns">
        <div class="column is-hidden-mobile"></div>
        <div class="column" style="text-align: center">
          <a class="button is-small is-danger" title="List view" data-action="view-list">
            <span class="icon">
              <i class="icon-th-list"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="Thumbs view" data-action="view-thumbs">
            <span class="icon">
              <i class="icon-th-large"></i>
            </span>
          </a>
        </div>
        <div class="column" style="text-align: right">
          <a class="button is-small is-info" title="Clear selection" data-action="clear-selection">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          ${all ? '' : `
          <a class="button is-small is-warning" title="Bulk add to album" data-action="add-selected-uploads-to-album">
            <span class="icon">
              <i class="icon-plus"></i>
            </span>
          </a>`}
          <a class="button is-small is-danger" title="Bulk delete" data-action="bulk-delete-uploads">
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>Bulk delete</span>
          </a>
        </div>
      </div>
    `

    // Whether there are any unselected items
    let unselected = false

    const hasExpiryDateColumn = files.some(file => file.expirydate !== undefined)

    for (let i = 0; i < files.length; i++) {
      // Build full URLs
      files[i].file = `${basedomain}/${files[i].name}`
      if (files[i].thumb)
        files[i].thumb = `${basedomain}/${files[i].thumb}`

      // Cache bare minimum data for thumbnails viewer
      page.cache.uploads[files[i].id] = {
        name: files[i].name,
        thumb: files[i].thumb,
        original: files[i].file
      }

      // Prettify
      files[i].prettyBytes = page.getPrettyBytes(parseInt(files[i].size))
      files[i].prettyDate = page.getPrettyDate(new Date(files[i].timestamp * 1000))

      if (hasExpiryDateColumn)
        files[i].prettyExpiryDate = files[i].expirydate
          ? page.getPrettyDate(new Date(files[i].expirydate * 1000))
          : '-'

      // Update selected status
      files[i].selected = page.selected[page.currentView].includes(files[i].id)
      if (!files[i].selected) unselected = true

      // Appendix (display album or user)
      if (all)
        files[i].appendix = files[i].userid
          ? users[files[i].userid] || ''
          : ''
      else
        files[i].appendix = files[i].albumid
          ? albums[files[i].albumid] || ''
          : ''
    }

    if (page.views[page.currentView].type === 'thumbs') {
      page.dom.innerHTML = `
        ${pagination}
        ${extraControls}
        ${controls}
        <div id="table" class="columns is-multiline is-mobile is-centered">
        </div>
        <hr>
        ${pagination}
      `

      const table = document.querySelector('#table')

      for (let i = 0; i < files.length; i++) {
        const upload = files[i]
        const div = document.createElement('div')
        div.className = 'image-container column is-narrow'
        div.dataset.id = upload.id

        if (upload.thumb !== undefined)
          div.innerHTML = `<a class="image" href="${upload.file}" target="_blank" rel="noopener"><img alt="${upload.name}" data-src="${upload.thumb}"/></a>`
        else
          div.innerHTML = `<a class="image" href="${upload.file}" target="_blank" rel="noopener"><h1 class="title">${upload.extname || 'N/A'}</h1></a>`

        div.innerHTML += `
          <input type="checkbox" class="checkbox" title="Select" data-action="select"${upload.selected ? ' checked' : ''}>
          <div class="controls">
            <a class="button is-small is-primary" title="View thumbnail" data-action="display-thumbnail"${upload.thumb ? '' : ' disabled'}>
              <span class="icon">
                <i class="icon-picture-1"></i>
              </span>
            </a>
            <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" data-clipboard-text="${upload.file}">
              <span class="icon">
                <i class="icon-clipboard-1"></i>
              </span>
            </a>
            <a class="button is-small is-warning" title="Add to album" data-action="add-to-album">
              <span class="icon">
                <i class="icon-plus"></i>
              </span>
            </a>
            <a class="button is-small is-danger" title="Delete" data-action="delete-upload">
              <span class="icon">
                <i class="icon-trash"></i>
              </span>
            </a>
          </div>
          <div class="details">
            <p><span class="name" title="${upload.file}">${upload.name}</span></p>
            <p>${upload.appendix ? `<span>${upload.appendix}</span> – ` : ''}${upload.prettyBytes}</p>
          </div>
        `

        table.appendChild(div)
        page.checkboxes[page.currentView] = Array.from(table.querySelectorAll('.checkbox[data-action="select"]'))
        page.lazyLoad.update()
      }
    } else {
      page.dom.innerHTML = `
        ${pagination}
        ${extraControls}
        ${controls}
        <div class="table-container">
          <table class="table is-narrow is-fullwidth is-hoverable">
            <thead>
              <tr>
                <th><input id="selectAll" class="checkbox" type="checkbox" title="Select all" data-action="select-all"></th>
                <th style="width: 20%">File</th>
                <th>${all ? 'User' : 'Album'}</th>
                <th>Size</th>
                ${all ? '<th>IP</th>' : ''}
                <th>Date</th>
                ${hasExpiryDateColumn ? '<th>Expiry date</th>' : ''}
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

      const table = document.querySelector('#table')

      for (let i = 0; i < files.length; i++) {
        const upload = files[i]
        const tr = document.createElement('tr')
        tr.dataset.id = upload.id
        tr.innerHTML = `
          <td class="controls"><input type="checkbox" class="checkbox" title="Select" data-action="select"${upload.selected ? ' checked' : ''}></td>
          <th><a href="${upload.file}" target="_blank" rel="noopener" title="${upload.file}">${upload.name}</a></th>
          <th>${upload.appendix}</th>
          <td>${upload.prettyBytes}</td>
          ${all ? `<td>${upload.ip || ''}</td>` : ''}
          <td>${upload.prettyDate}</td>
          ${hasExpiryDateColumn ? `<td>${upload.prettyExpiryDate}</td>` : ''}
          <td class="controls" style="text-align: right">
            <a class="button is-small is-primary" title="View thumbnail" data-action="display-thumbnail"${upload.thumb ? '' : ' disabled'}>
              <span class="icon">
                <i class="icon-picture-1"></i>
              </span>
            </a>
            <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" data-clipboard-text="${upload.file}">
              <span class="icon">
                <i class="icon-clipboard-1"></i>
              </span>
            </a>
            ${all ? '' : `
            <a class="button is-small is-warning" title="Add to album" data-action="add-to-album">
              <span class="icon">
                <i class="icon-plus"></i>
              </span>
            </a>`}
            <a class="button is-small is-danger" title="Delete" data-action="delete-upload">
              <span class="icon">
                <i class="icon-trash"></i>
              </span>
            </a>
          </td>
        `

        table.appendChild(tr)
        page.checkboxes[page.currentView] = Array.from(table.querySelectorAll('.checkbox[data-action="select"]'))
      }
    }

    const selectAll = document.querySelector('#selectAll')
    if (selectAll && !unselected) {
      selectAll.checked = true
      selectAll.title = 'Unselect all'
    }

    page.fadeAndScroll()

    if (page.currentView === 'uploads') page.views.uploads.album = album
    if (page.currentView === 'uploadsAll') page.views.uploadsAll.filters = filters
    page.views[page.currentView].pageNum = files.length ? pageNum : 0
  }).catch(function (error) {
    if (element) page.isLoading(element, false)
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.setUploadsView = function (view, element) {
  localStorage[lsKeys.viewType[page.currentView]] = view
  page.views[page.currentView].type = view
  page.getUploads(page.views[page.currentView], element)
}

page.displayThumbnail = function (id) {
  const file = page.cache.uploads[id]
  if (!file.thumb) return

  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field has-text-centered">
      <label class="label">${file.name}</label>
      <div class="controls swal-display-thumb-container">
        <img id="swalThumb" src="${file.thumb}">
      </div>
    </div>
  `
  if (file.original) {
    div.innerHTML += `
      <div class="field has-text-centered">
        <div class="controls">
          <a id="swalOriginal" type="button" class="button is-breeze" data-original="${file.original}">Load original</a>
        </div>
      </div>
    `
    div.querySelector('#swalOriginal').addEventListener('click', function () {
      const button = this
      const original = button.dataset.original
      button.classList.add('is-loading')

      const thumb = div.querySelector('#swalThumb')
      const exec = /.[\w]+(\?|$)/.exec(original)
      if (!exec || !exec[0]) return

      const extname = exec[0].toLowerCase()
      if (page.imageExts.includes(extname)) {
        thumb.src = file.original
        thumb.onload = function () {
          button.classList.add('is-hidden')
          document.body.querySelector('.swal-overlay .swal-modal:not(.is-expanded)').classList.add('is-expanded')
        }
        thumb.onerror = function () {
          button.className = 'button is-danger'
          button.innerHTML = 'Unable to load original'
        }
      } else if (page.videoExts.includes(extname)) {
        thumb.classList.add('is-hidden')
        const video = document.createElement('video')
        video.id = 'swalVideo'
        video.controls = true
        video.src = file.original
        thumb.insertAdjacentElement('afterend', video)

        button.classList.add('is-hidden')
        document.body.querySelector('.swal-overlay .swal-modal:not(.is-expanded)').classList.add('is-expanded')
      }
    })
  }

  return swal({
    content: div,
    buttons: false
  }).then(function () {
    const video = div.querySelector('#swalVideo')
    if (video) video.remove()

    // Restore modal size
    document.body.querySelector('.swal-overlay .swal-modal.is-expanded').classList.remove('is-expanded')
  })
}

page.selectAll = function (element) {
  for (let i = 0; i < page.checkboxes[page.currentView].length; i++) {
    const id = page.getItemID(page.checkboxes[page.currentView][i])
    if (isNaN(id)) continue
    if (page.checkboxes[page.currentView][i].checked !== element.checked) {
      page.checkboxes[page.currentView][i].checked = element.checked
      if (page.checkboxes[page.currentView][i].checked)
        page.selected[page.currentView].push(id)
      else
        page.selected[page.currentView].splice(page.selected[page.currentView].indexOf(id), 1)
    }
  }

  if (page.selected[page.currentView].length)
    localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
  else
    delete localStorage[lsKeys.selected[page.currentView]]

  element.title = element.checked ? 'Unselect all' : 'Select all'
}

page.selectInBetween = function (element, lastElement) {
  if (!element || !lastElement || element === lastElement)
    return

  if (!Array.isArray(page.checkboxes[page.currentView]) || !page.checkboxes[page.currentView].length)
    return

  const thisIndex = page.checkboxes[page.currentView].indexOf(element)
  const lastIndex = page.checkboxes[page.currentView].indexOf(lastElement)

  const distance = thisIndex - lastIndex
  if (distance >= -1 && distance <= 1)
    return

  for (let i = 0; i < page.checkboxes[page.currentView].length; i++)
    if ((thisIndex > lastIndex && i > lastIndex && i < thisIndex) ||
      (thisIndex < lastIndex && i > thisIndex && i < lastIndex)) {
      // Check or uncheck depending on the state of the initial checkbox
      page.checkboxes[page.currentView][i].checked = lastElement.checked
      const id = page.getItemID(page.checkboxes[page.currentView][i])
      if (!page.selected[page.currentView].includes(id) && page.checkboxes[page.currentView][i].checked)
        page.selected[page.currentView].push(id)
      else if (page.selected[page.currentView].includes(id) && !page.checkboxes[page.currentView][i].checked)
        page.selected[page.currentView].splice(page.selected[page.currentView].indexOf(id), 1)
    }
}

page.select = function (element, event) {
  const id = page.getItemID(element)
  if (isNaN(id)) return

  const lastSelected = page.lastSelected[page.currentView]
  if (event.shiftKey && lastSelected) {
    page.selectInBetween(element, lastSelected)
    // Check or uncheck depending on the state of the initial checkbox
    element.checked = lastSelected.checked
  } else {
    page.lastSelected[page.currentView] = element
  }

  if (!page.selected[page.currentView].includes(id) && element.checked)
    page.selected[page.currentView].push(id)
  else if (page.selected[page.currentView].includes(id) && !element.checked)
    page.selected[page.currentView].splice(page.selected[page.currentView].indexOf(id), 1)

  // Update local storage
  if (page.selected[page.currentView].length)
    localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
  else
    delete localStorage[lsKeys.selected[page.currentView]]
}

page.clearSelection = function () {
  const selected = page.selected[page.currentView]
  const type = page.currentView === 'users' ? 'users' : 'uploads'
  const count = selected.length
  if (!count)
    return swal('An error occurred!', `You have not selected any ${type}.`, 'error')

  const suffix = count === 1 ? type.substring(0, type.length - 1) : type
  return swal({
    title: 'Are you sure?',
    text: `You are going to unselect ${count} ${suffix}.`,
    buttons: true
  }).then(function (proceed) {
    if (!proceed) return

    const checkboxes = page.checkboxes[page.currentView]
    for (let i = 0; i < checkboxes.length; i++)
      if (checkboxes[i].checked)
        checkboxes[i].checked = false

    page.selected[page.currentView] = []
    delete localStorage[lsKeys.selected[page.currentView]]

    const selectAll = document.querySelector('#selectAll')
    if (selectAll) selectAll.checked = false

    return swal('Cleared selection!', `Unselected ${count} ${suffix}.`, 'success')
  })
}

page.filtersHelp = function (element) {
  const content = document.createElement('div')
  content.style = 'text-align: left'
  content.innerHTML = `
    This supports 3 filter keys, namely <b>user</b> (username), <b>ip</b> and <b>name</b> (upload name).
    Each key can be specified more than once.
    Backlashes should be used if the usernames have spaces.
    There are also 2 additional flags, namely <b>-user</b> and <b>-ip</b>, which will match uploads by non-registered users and have no IPs respectively.

    How does it work?
    First, it will filter uploads matching ANY of the supplied <b>user</b> or <b>ip</b> keys.
    Then, it will refine the matches using the supplied <b>name</b> keys.

    Examples:

    Uploads from user with username "demo":
    <code>user:demo</code>

    Uploads from users with username either "John Doe" OR "demo":
    <code>user:John\\ Doe user:demo</code>

    Uploads from IP "127.0.0.1" AND which upload names match "*.rar" OR "*.zip":
    <code>ip:127.0.0.1 name:*.rar name:*.zip</code>

    Uploads from user with username "test" OR from non-registered users:
    <code>user:test -user</code>
  `.trim().replace(/^ {6}/gm, '').replace(/\n/g, '<br>')
  swal({ content })
}

page.filterUploads = function (element) {
  const filters = document.querySelector('#filters').value
  page.getUploads({ all: true, filters }, element)
}

page.viewUserUploads = function (id) {
  const user = page.cache.users[id]
  if (!user) return
  page.getUploads({ all: true, filters: `user:${user.username.replace(/ /g, '\\ ')}` })
  page.setActiveMenu(document.querySelector('#itemManageUploads'))
}

page.deleteUpload = function (id) {
  page.postBulkDeleteUploads({
    field: 'id',
    values: [id],
    cb (failed) {
      // Remove from remembered checkboxes if necessary
      if (!failed.length && page.selected[page.currentView].includes(id))
        page.selected[page.currentView].splice(page.selected[page.currentView].indexOf(id), 1)

      // Update local storage
      if (page.selected[page.currentView].length)
        localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
      else
        delete localStorage[lsKeys.selected[page.currentView]]

      // Reload upload list
      const views = Object.assign({}, page.views[page.currentView])
      views.autoPage = true
      page.getUploads(views)
    }
  })
}

page.bulkDeleteUploads = function () {
  const count = page.selected[page.currentView].length
  if (!count)
    return swal('An error occurred!', 'You have not selected any uploads.', 'error')

  page.postBulkDeleteUploads({
    field: 'id',
    values: page.selected[page.currentView],
    cb (failed) {
      // Update state of checkboxes
      if (failed.length)
        page.selected[page.currentView] = page.selected[page.currentView]
          .filter(function (id) {
            return failed.includes(id)
          })
      else
        page.selected[page.currentView] = []

      // Update local storage
      if (page.selected[page.currentView].length)
        localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
      else
        delete localStorage[lsKeys.selected[page.currentView]]

      // Reload uploads list
      const views = Object.assign({}, page.views[page.currentView])
      views.autoPage = true
      page.getUploads(views)
    }
  })
}

page.deleteUploadsByNames = function () {
  let appendix = ''
  if (page.permissions.moderator)
    appendix = '<br>As a staff, you can use this feature to delete uploads from other users.'

  page.dom.innerHTML = `
    <form class="prevent-default">
      <div class="field">
        <label class="label">Upload names:</label>
        <div class="control">
          <textarea id="bulkDeleteNames" class="textarea"></textarea>
        </div>
        <p class="help">Separate each entry with a new line.${appendix}</p>
      </div>
      <div class="field">
        <div class="control">
          <button type="submit" id="submitBulkDelete" class="button is-danger is-fullwidth">
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>Bulk delete</span>
          </button>
        </div>
      </div>
    </form>
  `
  page.fadeAndScroll()

  document.querySelector('#submitBulkDelete').addEventListener('click', function () {
    const textArea = document.querySelector('#bulkDeleteNames')

    // Clean up
    const seen = {}
    const names = textArea.value
      .split(/\r?\n/)
      .map(function (name) {
        const trimmed = name.trim()
        return /^[^\s]+$/.test(trimmed)
          ? trimmed
          : ''
      })
      .filter(function (name) {
        // Filter out invalid and duplicate names
        return (!name || Object.prototype.hasOwnProperty.call(seen, name))
          ? false
          : (seen[name] = true)
      })

    // Update textarea with cleaned names
    textArea.value = names.join('\n')

    if (!names.length)
      return swal('An error occurred!', 'You have not entered any upload names.', 'error')

    page.postBulkDeleteUploads({
      field: 'name',
      values: names,
      cb (failed) {
        textArea.value = failed.join('\n')
      }
    })
  })
}

page.postBulkDeleteUploads = function ({ field, values, cb } = {}) {
  const count = values.length
  const objective = `${values.length} upload${count === 1 ? '' : 's'}`
  let text = `You won't be able to recover ${objective}!`
  if (page.currentView === 'uploadsAll')
    text += '\nBe aware, you may be nuking uploads by other users!'

  swal({
    title: 'Are you sure?',
    text,
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: `Yes, nuke ${values.length === 1 ? 'it' : 'them'}!`,
        closeModal: false
      }
    }
  }).then(function (proceed) {
    if (!proceed) return

    axios.post('api/upload/bulkdelete', { field, values }).then(function (response) {
      if (!response) return

      if (response.data.success === false)
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }

      const failed = Array.isArray(response.data.failed) ? response.data.failed : []
      if (failed.length === values.length)
        swal('An error occurred!', `Unable to delete any of the ${objective}.`, 'error')
      else if (failed.length && failed.length < values.length)
        swal('Warning!', `From ${objective}, unable to delete ${failed.length} of them.`, 'warning')
      else
        swal('Deleted!', `${objective} ${count === 1 ? 'has' : 'have'} been deleted.`, 'success')

      if (typeof cb === 'function') cb(failed)
    }).catch(function (error) {
      console.error(error)
      swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  })
}

page.addSelectedUploadsToAlbum = function () {
  if (page.currentView !== 'uploads')
    return

  const count = page.selected[page.currentView].length
  if (!count)
    return swal('An error occurred!', 'You have not selected any uploads.', 'error')

  page.addUploadsToAlbum(page.selected[page.currentView], function (failed) {
    if (!failed) return
    if (failed.length)
      page.selected[page.currentView] = page.selected[page.currentView].filter(function (id) {
        return failed.includes(id)
      })
    else
      page.selected[page.currentView] = []

    localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
    page.getUploads(page.views[page.currentView])
  })
}

page.addToAlbum = function (id) {
  page.addUploadsToAlbum([id], function (failed) {
    if (!failed) return
    page.getUploads(page.views[page.currentView])
  })
}

page.addUploadsToAlbum = function (ids, callback) {
  const count = ids.length

  const content = document.createElement('div')
  content.innerHTML = `
    <div class="field has-text-centered">
      <p>You are about to add <b>${count}</b> upload${count === 1 ? '' : 's'} to an album.</p>
      <p><b>If an upload is already in an album, it will be moved.</b></p>
    </div>
    <div class="field">
      <div class="control">
        <div class="select is-fullwidth">
          <select id="swalAlbum" disabled>
            <option value="-1">Remove from album</option>
            <option value="" selected disabled>Fetching albums list\u2026</option>
          </select>
        </div>
      </div>
    </div>
  `

  swal({
    icon: 'warning',
    content,
    buttons: {
      cancel: true,
      confirm: {
        text: 'OK',
        closeModal: false
      }
    }
  }).then(function (choose) {
    if (!choose) return

    const albumid = parseInt(document.querySelector('#swalAlbum').value)
    if (isNaN(albumid))
      return swal('An error occurred!', 'You did not choose an album.', 'error')

    axios.post('api/albums/addfiles', {
      ids,
      albumid
    }).then(function (add) {
      if (!add) return

      if (add.data.success === false) {
        if (add.data.description === 'No token provided')
          page.verifyToken(page.token)
        else
          swal('An error occurred!', add.data.description, 'error')

        return
      }

      let added = ids.length
      if (add.data.failed && add.data.failed.length)
        added -= add.data.failed.length

      const suffix = `upload${ids.length === 1 ? '' : 's'}`
      if (!added)
        return swal('An error occurred!', `Could not add the ${suffix} to the album.`, 'error')

      swal('Woohoo!', `Successfully ${albumid < 0 ? 'removed' : 'added'} ${added} ${suffix} ${albumid < 0 ? 'from' : 'to'} the album.`, 'success')
      callback(add.data.failed)
    }).catch(function (error) {
      console.error(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  }).catch(function (error) {
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })

  // Get albums list then update content of swal
  axios.get('api/albums').then(function (list) {
    if (list.data.success === false) {
      if (list.data.description === 'No token provided')
        page.verifyToken(page.token)
      else
        swal('An error occurred!', list.data.description, 'error')

      return
    }

    const select = document.querySelector('#swalAlbum')
    // If the prompt was replaced, the container would be missing
    if (!select) return
    select.innerHTML += list.data.albums
      .map(function (album) {
        return `<option value="${album.id}">${album.name}</option>`
      })
      .join('\n')
    select.getElementsByTagName('option')[1].innerHTML = 'Choose an album'
    select.removeAttribute('disabled')
  }).catch(function (error) {
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.getAlbums = function () {
  axios.get('api/albums').then(function (response) {
    if (!response) return

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }

    page.cache.albums = {}

    page.dom.innerHTML = `
      <h2 class="subtitle">Create new album</h2>
      <form class="prevent-default">
        <div class="field">
          <div class="control">
            <input id="albumName" class="input" type="text" placeholder="Name">
          </div>
        </div>
        <div class="field">
          <div class="control">
            <textarea id="albumDescription" class="textarea" placeholder="Description" rows="1"></textarea>
          </div>
        </div>
        <div class="field">
          <div class="control">
            <button type="submit" id="submitAlbum" class="button is-breeze is-fullwidth" data-action="submit-album">
              <span class="icon">
                <i class="icon-paper-plane-empty"></i>
              </span>
              <span>Create</span>
            </button>
          </div>
        </div>
      </form>
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
    const table = document.querySelector('#table')

    for (let i = 0; i < response.data.albums.length; i++) {
      const album = response.data.albums[i]
      const albumUrl = `${homeDomain}/a/${album.identifier}`

      // Prettify
      album.prettyDate = page.getPrettyDate(new Date(album.timestamp * 1000))

      page.cache.albums[album.id] = {
        name: album.name,
        download: album.download,
        public: album.public,
        description: album.description
      }

      const tr = document.createElement('tr')
      tr.innerHTML = `
        <th>${album.id}</th>
        <th>${album.name}</th>
        <th>${album.files}</th>
        <td>${album.prettyDate}</td>
        <td><a ${album.public ? `href="${albumUrl}"` : 'class="is-linethrough"'} target="_blank" rel="noopener">${albumUrl}</a></td>
        <td style="text-align: right" data-id="${album.id}">
          <a class="button is-small is-primary" title="Edit album" data-action="edit-album">
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
          <a class="button is-small is-danger" title="Delete album" data-action="delete-album">
            <span class="icon is-small">
              <i class="icon-trash"></i>
            </span>
          </a>
        </td>
      `

      table.appendChild(tr)
    }
    page.fadeAndScroll()
  }).catch(function (error) {
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.editAlbum = function (id) {
  const album = page.cache.albums[id]
  if (!album) return

  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <div class="controls">
        <input id="swalName" class="input" type="text" placeholder="Name" value="${album.name || ''}">
      </div>
    </div>
    <div class="field">
      <div class="control">
        <textarea id="swalDescription" class="textarea" placeholder="Description" rows="2">${album.description || ''}</textarea>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalDownload" type="checkbox" ${album.download ? 'checked' : ''}>
          Enable download
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalPublic" type="checkbox" ${album.public ? 'checked' : ''}>
          Enable public link
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalRequestLink" type="checkbox">
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
  }).then(function (value) {
    if (!value) return

    axios.post('api/albums/edit', {
      id,
      name: document.querySelector('#swalName').value.trim(),
      description: document.querySelector('#swalDescription').value.trim(),
      download: document.querySelector('#swalDownload').checked,
      public: document.querySelector('#swalPublic').checked,
      requestLink: document.querySelector('#swalRequestLink').checked
    }).then(function (response) {
      if (!response) return

      if (response.data.success === false)
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }

      if (response.data.identifier)
        swal('Success!', `Your album's new identifier is: ${response.data.identifier}.`, 'success')
      else if (response.data.name !== album.name)
        swal('Success!', `Your album was renamed to: ${response.data.name}.`, 'success')
      else
        swal('Success!', 'Your album was edited!', 'success')

      page.getAlbumsSidebar()
      page.getAlbums()
    }).catch(function (error) {
      console.error(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  })
}

page.deleteAlbum = function (id) {
  swal({
    title: 'Are you sure?',
    text: 'This won\'t delete your uploads, only the album!',
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, delete it!',
        closeModal: false
      },
      purge: {
        text: 'Umm, delete the uploads too please?',
        value: 'purge',
        className: 'swal-button--danger',
        closeModal: false
      }
    }
  }).then(function (proceed) {
    if (!proceed) return

    axios.post('api/albums/delete', {
      id,
      purge: proceed === 'purge'
    }).then(function (response) {
      if (response.data.success === false)
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else if (Array.isArray(response.data.failed) && response.data.failed.length) {
          return swal('An error occurred!', 'Unable to delete ', 'error')
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }

      swal('Deleted!', 'Your album has been deleted.', 'success')
      page.getAlbumsSidebar()
      page.getAlbums()
    }).catch(function (error) {
      console.error(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  })
}

page.submitAlbum = function (element) {
  page.isLoading(element, true)

  axios.post('api/albums', {
    name: document.querySelector('#albumName').value,
    description: document.querySelector('#albumDescription').value
  }).then(function (response) {
    if (!response) return

    page.isLoading(element, false)

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }

    swal('Woohoo!', 'Album was created successfully.', 'success')
    page.getAlbumsSidebar()
    page.getAlbums()
  }).catch(function (error) {
    console.error(error)
    page.isLoading(element, false)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.getAlbumsSidebar = function () {
  axios.get('api/albums/sidebar').then(function (response) {
    if (!response) return

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }

    const albumsContainer = document.querySelector('#albumsContainer')

    // Clear albums sidebar if necessary
    const oldAlbums = albumsContainer.querySelectorAll('li > a')
    if (oldAlbums.length) {
      for (let i = 0; i < oldAlbums.length; i++)
        page.menus.splice(page.menus.indexOf(oldAlbums[i]), 1)
      albumsContainer.innerHTML = ''
    }

    if (response.data.albums === undefined)
      return

    for (let i = 0; i < response.data.albums.length; i++) {
      const album = response.data.albums[i]
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.id = album.id
      a.innerHTML = album.name

      a.addEventListener('click', function () {
        page.getUploads({ album: this.id })
        page.setActiveMenu(this)
      })
      page.menus.push(a)

      li.appendChild(a)
      albumsContainer.appendChild(li)
    }
  }).catch(function (error) {
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.changeToken = function () {
  axios.get('api/tokens').then(function (response) {
    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }

    page.dom.innerHTML = `
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
          <a id="getNewToken" class="button is-breeze is-fullwidth" data-action="get-new-token">
            <span class="icon">
              <i class="icon-arrows-cw"></i>
            </span>
            <span>Request new token</span>
          </a>
        </div>
      </div>
    `
    page.fadeAndScroll()
  }).catch(function (error) {
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.getNewToken = function (element) {
  page.isLoading(element, true)

  axios.post('api/tokens/change').then(function (response) {
    page.isLoading(element, false)

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }

    swal({
      title: 'Woohoo!',
      text: 'Your token was successfully changed.',
      icon: 'success'
    }).then(function () {
      axios.defaults.headers.common.token = response.data.token
      localStorage[lsKeys.token] = response.data.token
      page.token = response.data.token
      page.changeToken()
    })
  }).catch(function (error) {
    console.error(error)
    page.isLoading(element, false)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.changePassword = function () {
  page.dom.innerHTML = `
    <form class="prevent-default">
      <div class="field">
        <label class="label">New password:</label>
        <div class="control">
          <input id="password" class="input" type="password" min="6" max="64">
        </div>
      </div>
      <div class="field">
        <label class="label">Re-type new password:</label>
        <div class="control">
          <input id="passwordConfirm" class="input" type="password" min="6" max="64">
        </div>
      </div>
      <div class="field">
        <div class="control">
          <button type="submit" id="sendChangePassword" class="button is-breeze is-fullwidth">
            <span class="icon">
              <i class="icon-paper-plane-empty"></i>
            </span>
            <span>Set new password</span>
          </button>
        </div>
      </div>
    </form>
  `
  page.fadeAndScroll()

  document.querySelector('#sendChangePassword').addEventListener('click', function () {
    if (document.querySelector('#password').value === document.querySelector('#passwordConfirm').value)
      page.sendNewPassword(document.querySelector('#password').value, this)
    else
      swal({
        title: 'Password mismatch!',
        text: 'Your passwords do not match, please try again.',
        icon: 'error'
      })
  })
}

page.sendNewPassword = function (pass, element) {
  page.isLoading(element, true)

  axios.post('api/password/change', { password: pass }).then(function (response) {
    page.isLoading(element, false)

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }

    swal({
      title: 'Woohoo!',
      text: 'Your password was successfully changed.',
      icon: 'success'
    }).then(function () {
      page.changePassword()
    })
  }).catch(function (error) {
    console.error(error)
    page.isLoading(element, false)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.setActiveMenu = function (element) {
  for (let i = 0; i < page.menus.length; i++)
    page.menus[i].classList.remove('is-active')

  element.classList.add('is-active')
}

page.getUsers = function ({ pageNum } = {}, element) {
  if (element) page.isLoading(element, true)
  if (pageNum === undefined) pageNum = 0

  if (!page.permissions.admin)
    return swal('An error occurred!', 'You can not do this!', 'error')

  const url = `api/users/${pageNum}`
  axios.get(url).then(function (response) {
    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }

    if (pageNum && (response.data.users.length === 0)) {
      // Only remove loading class here, since beyond this the entire page will be replaced anyways
      if (element) page.isLoading(element, false)
      return swal('An error occurred!', `There are no more users to populate page ${pageNum + 1}.`, 'error')
    }

    page.currentView = 'users'
    page.cache.users = {}

    const pagination = page.paginate(response.data.count, 25, pageNum)

    const extraControls = `
      <div class="columns" style="margin-top: 10px">
        <div class="column is-hidden-mobile"></div>
        <div class="column is-one-quarter">
          <form class="prevent-default">
            <div class="field has-addons">
              <div class="control is-expanded">
                <input id="jumpToPage" class="input is-small" type="number" value="${pageNum + 1}">
              </div>
              <div class="control">
                <button type="submit" class="button is-small is-breeze" title="Jump to page" data-action="jump-to-page">
                  <span class="icon">
                    <i class="icon-paper-plane-empty"></i>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `

    const controls = `
      <div class="columns">
        <div class="column is-hidden-mobile"></div>
        <div class="column" style="text-align: right">
          <a class="button is-small is-info" title="Clear selection" data-action="clear-selection">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          <a class="button is-small is-warning" title="Bulk disable (WIP)" data-action="bulk-disable-users" disabled>
            <span class="icon">
              <i class="icon-hammer"></i>
            </span>
            <span>Bulk disable</span>
          </a>
          <a class="button is-small is-danger" title="Bulk delete (WIP)" data-action="bulk-delete-users" disabled>
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>Bulk delete</span>
          </a>
        </div>
      </div>
    `

    // Whether there are any unselected items
    let unselected = false

    page.dom.innerHTML = `
      ${pagination}
      ${extraControls}
      ${controls}
      <div class="table-container">
        <table class="table is-narrow is-fullwidth is-hoverable">
          <thead>
            <tr>
              <th><input id="selectAll" class="checkbox" type="checkbox" title="Select all" data-action="select-all"></th>
              <th>ID</th>
              <th style="width: 20%">Username</th>
              <th>Uploads</th>
              <th>Usage</th>
              <th>Group</th>
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

    const table = document.querySelector('#table')

    for (let i = 0; i < response.data.users.length; i++) {
      const user = response.data.users[i]
      const selected = page.selected.users.includes(user.id)
      if (!selected) unselected = true

      let displayGroup = null
      const groups = Object.keys(user.groups)
      for (let i = 0; i < groups.length; i++) {
        if (!user.groups[groups[i]]) break
        displayGroup = groups[i]
      }

      // Server-side explicitly expects either of these two values to consider a user as disabled
      const enabled = user.enabled !== false && user.enabled !== 0
      page.cache.users[user.id] = {
        username: user.username,
        groups: user.groups,
        enabled,
        displayGroup
      }

      const tr = document.createElement('tr')
      tr.dataset.id = user.id
      tr.innerHTML = `
        <td class="controls"><input type="checkbox" class="checkbox" title="Select" data-action="select"${selected ? ' checked' : ''}></td>
        <th>${user.id}</th>
        <th${enabled ? '' : ' class="is-linethrough"'}>${user.username}</td>
        <th>${user.uploads}</th>
        <td>${page.getPrettyBytes(user.usage)}</td>
        <td>${displayGroup}</td>
        <td class="controls" style="text-align: right">
          <a class="button is-small is-primary" title="Edit user" data-action="edit-user">
            <span class="icon">
              <i class="icon-pencil-1"></i>
            </span>
          </a>
          <a class="button is-small is-info" title="View uploads" data-action="view-user-uploads" ${user.uploadsCount ? '' : 'disabled'}>
            <span class="icon">
              <i class="icon-docs"></i>
            </span>
          </a>
          <a class="button is-small is-warning" title="Disable user" data-action="disable-user" ${enabled ? '' : 'disabled'}>
            <span class="icon">
              <i class="icon-hammer"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="Delete user (WIP)" data-action="delete-user" disabled>
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
          </a>
        </td>
      `

      table.appendChild(tr)
      page.checkboxes.users = Array.from(table.querySelectorAll('.checkbox[data-action="select"]'))
    }

    const selectAll = document.querySelector('#selectAll')
    if (selectAll && !unselected) {
      selectAll.checked = true
      selectAll.title = 'Unselect all'
    }

    page.fadeAndScroll()

    page.views.users.pageNum = response.data.users.length ? pageNum : 0
  }).catch(function (error) {
    if (element) page.isLoading(element, false)
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.editUser = function (id) {
  const user = page.cache.users[id]
  if (!user) return

  const groupOptions = Object.keys(page.permissions).map(function (g, i, a) {
    const selected = g === user.displayGroup
    const disabled = !(a[i + 1] && page.permissions[a[i + 1]])
    return `<option value="${g}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${g}</option>`
  }).join('\n')

  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <label class="label">Username</label>
      <div class="controls">
        <input id="swalUsername" class="input" type="text" value="${user.username || ''}">
      </div>
    </div>
    <div class="field">
      <label class="label">User group</label>
      <div class="control">
        <div class="select is-fullwidth">
          <select id="swalGroup">
            ${groupOptions}
          </select>
        </div>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalEnabled" type="checkbox" ${user.enabled ? 'checked' : ''}>
          Enabled
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalResetPassword" type="checkbox">
          Reset password
        </label>
      </div>
    </div>
  `

  swal({
    title: 'Edit user',
    icon: 'info',
    content: div,
    buttons: {
      cancel: true,
      confirm: {
        closeModal: false
      }
    }
  }).then(function (proceed) {
    if (!proceed) return

    axios.post('api/users/edit', {
      id,
      username: document.querySelector('#swalUsername').value,
      group: document.querySelector('#swalGroup').value,
      enabled: document.querySelector('#swalEnabled').checked,
      resetPassword: document.querySelector('#swalResetPassword').checked
    }).then(function (response) {
      if (!response) return

      if (response.data.success === false)
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }

      if (response.data.password) {
        const div = document.createElement('div')
        div.innerHTML = `
          <p>${user.username}'s new password is:</p>
          <p><code>${response.data.password}</code></p>
        `
        swal({
          title: 'Success!',
          icon: 'success',
          content: div
        })
      } else if (response.data.update && response.data.update.username !== user.username) {
        swal('Success!', `${user.username} was renamed into: ${response.data.update.name}.`, 'success')
      } else {
        swal('Success!', 'The user was edited!', 'success')
      }

      page.getUsers(page.views.users)
    }).catch(function (error) {
      console.error(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  })
}

page.disableUser = function (id) {
  const user = page.cache.users[id]
  if (!user || !user.enabled) return

  const content = document.createElement('div')
  content.innerHTML = `You will be disabling a user with the username <b>${page.cache.users[id].username}</b>!`

  swal({
    title: 'Are you sure?',
    icon: 'warning',
    content,
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, disable them!',
        closeModal: false
      }
    }
  }).then(function (proceed) {
    if (!proceed) return

    axios.post('api/users/disable', { id }).then(function (response) {
      if (!response) return

      if (response.data.success === false)
        if (response.data.description === 'No token provided')
          return page.verifyToken(page.token)
        else
          return swal('An error occurred!', response.data.description, 'error')

      swal('Success!', 'The user has been disabled.', 'success')
      page.getUsers(page.views.users)
    }).catch(function (error) {
      console.error(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  })
}

page.paginate = function (totalItems, itemsPerPage, currentPage) {
  // Roughly based on https://github.com/mayuska/pagination/blob/master/index.js
  currentPage = currentPage + 1
  const step = 3
  const numPages = Math.ceil(totalItems / itemsPerPage)

  let template = ''
  const elementsToShow = step * 2
  const add = {
    pageNum (start, end) {
      for (let i = start; i <= end; ++i)
        template += `<li><a class="button pagination-link ${i === currentPage ? ' is-current' : ''}" aria-label="Goto page ${i}" data-action="page-goto" data-goto="${i - 1}">${i}</a></li>`
    },
    startDots () {
      template += `
        <li><a class="button pagination-link" aria-label="Goto page 1" data-action="page-goto" data-goto="0">1</a></li>
        <li data-action="page-ellipsis"><span class="pagination-ellipsis">&hellip;</span></li>
      `
    },
    endDots () {
      template += `
        <li data-action="page-ellipsis"><span class="pagination-ellipsis">&hellip;</span></li>
        <li><a class="button pagination-link" aria-label="Goto page ${numPages}" data-action="page-goto" data-goto="${numPages - 1}">${numPages}</a></li>
      `
    }
  }

  if (elementsToShow + 1 >= numPages) {
    add.pageNum(1, numPages)
  } else if (currentPage < elementsToShow) {
    add.pageNum(1, elementsToShow)
    add.endDots()
  } else if (currentPage > numPages - elementsToShow + 1) {
    add.startDots()
    add.pageNum(numPages - elementsToShow + 1, numPages)
  } else {
    add.startDots()
    add.pageNum(currentPage - step + 1, currentPage + step - 1)
    add.endDots()
  }

  return `
    <nav class="pagination is-centered is-small">
      <a class="button pagination-previous" data-action="page-prev">Previous</a>
      <a class="button pagination-next" data-action="page-next">Next page</a>
      <ul class="pagination-list">${template}</ul>
    </nav>
  `
}

page.getStatistics = function (element) {
  if (!page.permissions.admin)
    return swal('An error occurred!', 'You can not do this!', 'error')

  page.dom.innerHTML = `
    Please wait, this may take a while\u2026
    <progress class="progress is-breeze" max="100" style="margin-top: 10px"></progress>
  `

  const url = 'api/stats'
  axios.get(url).then(function (response) {
    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }

    let content = ''
    const keys = Object.keys(response.data.stats)
    for (let i = 0; i < keys.length; i++) {
      let rows = ''
      if (!response.data.stats[keys[i]])
        rows += `
          <tr>
            <td>Generating, please try again later\u2026</td>
            <td></td>
          </tr>
        `
      else
        try {
          const types = response.data.stats[keys[i]]._types || {}
          const valKeys = Object.keys(response.data.stats[keys[i]])
          for (let j = 0; j < valKeys.length; j++) {
            // Skip keys that starts with an underscore
            if (/^_/.test(valKeys[j]))
              continue

            const value = response.data.stats[keys[i]][valKeys[j]]
            let parsed = value

            // Parse values with some preset formatting
            if ((types.number || []).includes(valKeys[j]))
              parsed = value.toLocaleString()
            if ((types.byte || []).includes(valKeys[j]))
              parsed = page.getPrettyBytes(value)
            if ((types.byteUsage || []).includes(valKeys[j]))
              parsed = `${page.getPrettyBytes(value.used)} / ${page.getPrettyBytes(value.total)} (${Math.round(value.used / value.total * 100)}%)`

            const string = valKeys[j]
              .replace(/([A-Z])/g, ' $1')
              .toUpperCase()
            rows += `
              <tr>
                <th>${string}</th>
                <td>${parsed}</td>
              </tr>
            `
          }
        } catch (error) {
          console.error(error)
          rows = `
              <tr>
                <td>Error parsing response. Try again?</td>
                <td></td>
              </tr>
            `
        }

      content += `
        <div class="table-container">
          <table class="table is-fullwidth is-hoverable">
            <thead>
              <tr>
                <th>${keys[i].toUpperCase()}</th>
                <td style="width: 50%"></td>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `
    }

    page.dom.innerHTML = content
    page.fadeAndScroll()
  }).catch(function (error) {
    console.error(error)
    const description = error.response.data && error.response.data.description
      ? error.response.data && error.response.data.description
      : 'There was an error with the request, please check the console for more information.'
    page.dom.innerHTML = `<p>${description}</p>`
    page.fadeAndScroll()
    return swal('An error occurred!', description, 'error')
  })
}

window.onload = function () {
  // Add 'no-touch' class to non-touch devices
  if (!('ontouchstart' in document.documentElement))
    document.documentElement.classList.add('no-touch')

  const selectedKeys = ['uploads', 'uploadsAll', 'users']
  for (let i = 0; i < selectedKeys.length; i++) {
    const ls = localStorage[lsKeys.selected[selectedKeys[i]]]
    if (ls) page.selected[selectedKeys[i]] = JSON.parse(ls)
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
