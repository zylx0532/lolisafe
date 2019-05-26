/* global swal, axios, ClipboardJS, LazyLoad */

// keys for localStorage
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
      uploader: null, // uploader's name
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

  imageExtensions: ['.webp', '.jpg', '.jpeg', '.bmp', '.gif', '.png'],

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
        title: '发生错误！',
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
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.prepareDashboard = function () {
  page.dom = document.getElementById('page')
  page.dom.addEventListener('click', page.domClick, true)

  // document.getElementById('auth').style.display = 'none'
  document.getElementById('dashboard').style.display = 'block'

  if (page.permissions.moderator) {
    const itemManageUploads = document.getElementById('itemManageUploads')
    itemManageUploads.removeAttribute('disabled')
    itemManageUploads.addEventListener('click', function () {
      page.setActiveMenu(this)
      page.getUploads({ all: true })
    })
  }

  if (page.permissions.admin) {
    const itemManageUsers = document.getElementById('itemManageUsers')
    itemManageUsers.removeAttribute('disabled')
    itemManageUsers.addEventListener('click', function () {
      page.setActiveMenu(this)
      page.getUsers()
    })
  }

  document.getElementById('itemUploads').addEventListener('click', function () {
    page.setActiveMenu(this)
    page.getUploads({ all: false })
  })

  document.getElementById('itemDeleteByNames').addEventListener('click', function () {
    page.setActiveMenu(this)
    page.deleteByNames()
  })

  document.getElementById('itemManageGallery').addEventListener('click', function () {
    page.setActiveMenu(this)
    page.getAlbums()
  })

  document.getElementById('itemFileLength').addEventListener('click', function () {
    page.setActiveMenu(this)
    page.changeFileLength()
  })

  document.getElementById('itemTokens').addEventListener('click', function () {
    page.setActiveMenu(this)
    page.changeToken()
  })

  document.getElementById('itemPassword').addEventListener('click', function () {
    page.setActiveMenu(this)
    page.changePassword()
  })

  const logoutBtn = document.getElementById('itemLogout')
  logoutBtn.addEventListener('click', function () {
    page.logout()
  })
  logoutBtn.innerHTML = `登出 ( ${page.username} )`

  page.getAlbumsSidebar()

  if (typeof page.prepareShareX === 'function') page.prepareShareX()
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
  let element = event.target
  if (!element) return

  // If the clicked element is an icon, delegate event to its A parent; hacky
  if (element.tagName === 'I' && element.parentNode.tagName === 'SPAN') element = element.parentNode
  if (element.tagName === 'SPAN' && element.parentNode.tagName === 'A') element = element.parentNode

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
    case 'add-selected-files-to-album':
      return page.addSelectedFilesToAlbum()
    case 'bulk-delete':
      return page.deleteSelectedFiles()
    case 'select':
      return page.select(element, event)
    case 'add-to-album':
      return page.addSingleFileToAlbum(id)
    case 'delete-file':
      return page.deleteFile(id)
    case 'select-all':
      return page.selectAll(element)
    case 'display-thumbnail':
      return page.displayThumbnail(id)
    case 'delete-file-by-names':
      return page.deleteFileByNames()
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
    case 'filter-by-uploader':
      return page.filterByUploader(element)
    case 'view-user-uploads':
      return page.viewUserUploads(id)
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

page.fadeIn = function (content) {
  if (page.fadingIn) {
    clearTimeout(page.fadingIn)
    page.dom.classList.remove('fade-in')
  }
  page.dom.classList.add('fade-in')
  page.fadingIn = setTimeout(function () {
    page.dom.classList.remove('fade-in')
  }, 500)
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
    views.uploader = page.views[page.currentView].uploader
  }

  switch (action) {
    case 'page-prev':
      views.pageNum = page.views[page.currentView].pageNum - 1
      if (views.pageNum < 0)
        return swal('发生错误！', '这已经是第一页了。', 'error')
      return func(views, element)
    case 'page-next':
      views.pageNum = page.views[page.currentView].pageNum + 1
      return func(views, element)
    case 'page-goto':
      views.pageNum = parseInt(element.dataset.goto)
      return func(views, element)
    case 'jump-to-page':
      const jumpToPage = parseInt(document.getElementById('jumpToPage').value)
      views.pageNum = isNaN(jumpToPage) ? 0 : (jumpToPage - 1)
      if (views.pageNum < 0) views.pageNum = 0
      return func(views, element)
  }
}

page.getUploads = function ({ pageNum, album, all, uploader } = {}, element) {
  if (element) page.isLoading(element, true)

  if ((all || uploader) && !page.permissions.moderator)
    return swal('发生错误！', '你不能做这个！', 'error')

  if (typeof pageNum !== 'number' || pageNum < 0)
    pageNum = 0

  let url = `api/uploads/${pageNum}`
  if (typeof album === 'string')
    url = `api/album/${album}/${pageNum}`

  const headers = {}
  if (all) headers.all = '1'
  if (uploader) headers.uploader = uploader
  axios.get(url, { headers }).then(function (response) {
    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('发生错误！', response.data.description, 'error')
      }

    if (pageNum && (response.data.files.length === 0)) {
      // Only remove loading class here, since beyond this the entire page will be replaced anyways
      if (element) page.isLoading(element, false)
      return swal('发生错误！', `没有更多上传来填充页面 ${pageNum + 1}.`, 'error')
    }

    page.currentView = all ? 'uploadsAll' : 'uploads'
    page.cache.uploads = {}

    const pagination = page.paginate(response.data.count, 25, pageNum)

    let filter = ''
    if (all)
      filter = `
        <div class="column is-one-quarter">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="uploader" class="input is-small" type="text" placeholder="用户名" value="${uploader || ''}">
            </div>
            <div class="control">
              <a class="button is-small is-breeze" title="按上传者过滤" data-action="filter-by-uploader">
                <span class="icon">
                  <i class="icon-filter"></i>
                </span>
              </a>
            </div>
          </div>
        </div>
      `
    const extraControls = `
      <div class="columns" style="margin-top: 10px">
        ${filter}
        <div class="column is-hidden-mobile"></div>
        <div class="column is-one-quarter">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="jumpToPage" class="input is-small" type="text" value="${pageNum + 1}">
            </div>
            <div class="control">
              <a class="button is-small is-breeze" title="跳转到页面" data-action="jump-to-page">
                <span class="icon">
                  <i class="icon-paper-plane-empty"></i>
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    `

    const controls = `
      <div class="columns">
        <div class="column is-hidden-mobile"></div>
        <div class="column" style="text-align: center">
          <a class="button is-small is-danger" title="列表查看" data-action="view-list">
            <span class="icon">
              <i class="icon-th-list"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="缩略图查看" data-action="view-thumbs">
            <span class="icon">
              <i class="icon-th-large"></i>
            </span>
          </a>
        </div>
        <div class="column" style="text-align: right">
          <a class="button is-small is-info" title="清除选择" data-action="clear-selection">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          ${all ? '' : `
          <a class="button is-small is-warning" title="添加所选图片到相册" data-action="add-selected-files-to-album">
            <span class="icon">
              <i class="icon-plus"></i>
            </span>
          </a>`}
          <a class="button is-small is-danger" title="批量删除" data-action="bulk-delete">
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>批量删除</span>
          </a>
        </div>
      </div>
    `

    let allSelected = true
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
      page.fadeIn()

      const table = document.getElementById('table')

      for (let i = 0; i < response.data.files.length; i++) {
        const upload = response.data.files[i]
        const selected = page.selected[page.currentView].includes(upload.id)
        if (!selected && allSelected) allSelected = false

        page.cache.uploads[upload.id] = {
          name: upload.name,
          thumb: upload.thumb,
          original: upload.file
        }

        // Prettify
        upload.prettyBytes = page.getPrettyBytes(parseInt(upload.size))
        upload.prettyDate = page.getPrettyDate(new Date(upload.timestamp * 1000))

        let displayAlbumOrUser = upload.album
        if (all) displayAlbumOrUser = upload.username || ''

        const div = document.createElement('div')
        div.className = 'image-container column is-narrow'
        div.dataset.id = upload.id
        if (upload.thumb !== undefined)
          div.innerHTML = `<a class="image" href="${upload.file}" target="_blank" rel="noopener"><img alt="${upload.name}" data-src="${upload.thumb}"/></a>`
        else
          div.innerHTML = `<a class="image" href="${upload.file}" target="_blank" rel="noopener"><h1 class="title">${upload.extname || 'N/A'}</h1></a>`

        div.innerHTML += `
          <input type="checkbox" class="checkbox" title="选择此文件" data-action="select"${selected ? ' checked' : ''}>
          <div class="controls">
            <a class="button is-small is-primary" title="查看缩略图" data-action="display-thumbnail"${upload.thumb ? '' : ' disabled'}>
              <span class="icon">
                <i class="icon-picture-1"></i>
              </span>
            </a>
            <a class="button is-small is-info clipboard-js" title="复制链接到剪贴板" data-clipboard-text="${upload.file}">
              <span class="icon">
                <i class="icon-clipboard-1"></i>
              </span>
            </a>
            <a class="button is-small is-warning" title="添加到相册" data-action="add-to-album">
              <span class="icon">
                <i class="icon-plus"></i>
              </span>
            </a>
            <a class="button is-small is-danger" title="删除文件" data-action="delete-file">
              <span class="icon">
                <i class="icon-trash"></i>
              </span>
            </a>
          </div>
          <div class="details">
            <p><span class="name" title="${upload.file}">${upload.name}</span></p>
            <p>${displayAlbumOrUser ? `<span>${displayAlbumOrUser}</span> – ` : ''}${upload.prettyBytes}</p>
          </div>
        `

        table.appendChild(div)
        page.checkboxes[page.currentView] = Array.from(table.querySelectorAll('.checkbox[data-action="select"]'))
        page.lazyLoad.update()
      }
    } else {
      let albumOrUser = '相册'
      if (all) albumOrUser = '用户'

      page.dom.innerHTML = `
        ${pagination}
        ${extraControls}
        ${controls}
        <div class="table-container">
          <table class="table is-narrow is-fullwidth is-hoverable">
            <thead>
              <tr>
                <th><input id="selectAll" class="checkbox" type="checkbox" title="全选" data-action="select-all"></th>
                <th style="width: 25%">文件</th>
                <th>${albumOrUser}</th>
                <th>文件大小</th>
                <th>日期</th>
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
      page.fadeIn()

      const table = document.getElementById('table')

      for (let i = 0; i < response.data.files.length; i++) {
        const upload = response.data.files[i]
        const selected = page.selected[page.currentView].includes(upload.id)
        if (!selected && allSelected) allSelected = false

        page.cache.uploads[upload.id] = {
          name: upload.name,
          thumb: upload.thumb,
          original: upload.file
        }

        // Prettify
        upload.prettyBytes = page.getPrettyBytes(parseInt(upload.size))
        upload.prettyDate = page.getPrettyDate(new Date(upload.timestamp * 1000))

        let displayAlbumOrUser = upload.album
        if (all) displayAlbumOrUser = upload.username || ''

        const tr = document.createElement('tr')
        tr.dataset.id = upload.id
        tr.innerHTML = `
          <td class="controls"><input type="checkbox" class="checkbox" title="Select this file" data-action="select"${selected ? ' checked' : ''}></td>
          <th><a href="${upload.file}" target="_blank" rel="noopener" title="${upload.file}">${upload.name}</a></th>
          <th>${displayAlbumOrUser}</th>
          <td>${upload.prettyBytes}</td>
          <td>${upload.prettyDate}</td>
          <td class="controls" style="text-align: right">
            <a class="button is-small is-primary" title="查看缩略图" data-action="display-thumbnail"${upload.thumb ? '' : ' disabled'}>
              <span class="icon">
                <i class="icon-picture-1"></i>
              </span>
            </a>
            <a class="button is-small is-info clipboard-js" title="复制链接到剪贴板" data-clipboard-text="${upload.file}">
              <span class="icon">
                <i class="icon-clipboard-1"></i>
              </span>
            </a>
            ${all ? '' : `
            <a class="button is-small is-warning" title="添加到相册" data-action="add-to-album">
              <span class="icon">
                <i class="icon-plus"></i>
              </span>
            </a>`}
            <a class="button is-small is-danger" title="删除文件" data-action="delete-file">
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

    if (allSelected && response.data.files.length) {
      const selectAll = document.getElementById('selectAll')
      if (selectAll) selectAll.checked = true
    }

    if (page.currentView === 'uploads') page.views.uploads.album = album
    if (page.currentView === 'uploadsAll') page.views.uploadsAll.uploader = uploader
    page.views[page.currentView].pageNum = response.data.files.length ? pageNum : 0
  }).catch(function (error) {
    if (element) page.isLoading(element, false)
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
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
          <a id="swalOriginal" type="button" class="button is-breeze" data-original="${file.original}">加载原图</a>
        </div>
      </div>
    `
    div.querySelector('#swalOriginal').addEventListener('click', function () {
      const button = this
      const original = button.dataset.original
      button.classList.add('is-loading')

      const thumb = div.querySelector('#swalThumb')
      const exec = /.[\w]+(\?|$)/.exec(original)
      const isimage = exec && exec[0] && page.imageExtensions.includes(exec[0].toLowerCase())

      if (isimage) {
        thumb.src = file.original
        thumb.onload = function () {
          button.style.display = 'none'
          document.body.querySelector('.swal-overlay .swal-modal:not(.is-expanded)').classList.add('is-expanded')
        }
        thumb.onerror = function () {
          button.className = 'button is-danger'
          button.innerHTML = '无法加载原图'
        }
      } else {
        thumb.style.display = 'none'
        const video = document.createElement('video')
        video.id = 'swalVideo'
        video.controls = true
        video.src = file.original
        thumb.insertAdjacentElement('afterend', video)

        button.style.display = 'none'
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
  const checkboxes = page.checkboxes[page.currentView]
  const selected = page.selected[page.currentView]

  for (let i = 0; i < checkboxes.length; i++) {
    const id = page.getItemID(checkboxes[i])
    if (isNaN(id)) continue
    if (checkboxes[i].checked !== element.checked) {
      checkboxes[i].checked = element.checked
      if (checkboxes[i].checked)
        selected.push(id)
      else
        selected.splice(selected.indexOf(id), 1)
    }
  }

  localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(selected)
  page.selected[page.currentView] = selected
  element.title = element.checked ? '取消全选' : '全选'
}

page.selectInBetween = function (element, lastElement) {
  if (!element || !lastElement) return
  if (element === lastElement) return

  const checkboxes = page.checkboxes[page.currentView]
  if (!checkboxes || !checkboxes.length) return

  const thisIndex = checkboxes.indexOf(element)
  const lastIndex = checkboxes.indexOf(lastElement)

  const distance = thisIndex - lastIndex
  if (distance >= -1 && distance <= 1) return

  for (let i = 0; i < checkboxes.length; i++)
    if ((thisIndex > lastIndex && i > lastIndex && i < thisIndex) ||
      (thisIndex < lastIndex && i > thisIndex && i < lastIndex)) {
      checkboxes[i].checked = true
      page.selected[page.currentView].push(page.getItemID(checkboxes[i]))
    }

  localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
  page.checkboxes[page.currentView] = checkboxes
}

page.select = function (element, event) {
  const lastSelected = page.lastSelected[page.currentView]
  if (event.shiftKey && lastSelected)
    page.selectInBetween(element, lastSelected)
  else
    page.lastSelected[page.currentView] = element

  const id = page.getItemID(element)
  if (isNaN(id)) return

  const selected = page.selected[page.currentView]
  if (!selected.includes(id) && element.checked)
    selected.push(id)
  else if (selected.includes(id) && !element.checked)
    selected.splice(selected.indexOf(id), 1)

  localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(selected)
  page.selected[page.currentView] = selected
}

page.clearSelection = function () {
  const selected = page.selected[page.currentView]
  const type = page.currentView === 'users' ? 'users' : 'uploads'
  const count = selected.length
  if (!count)
    return swal('发生错误！', `你没有选择任何 ${type}.`, 'error')

  const suffix = count === 1 ? type.substring(0, type.length - 1) : type
  return swal({
    title: '你确定吗？',
    text: `你要取消选择 ${count} ${suffix}.`,
    buttons: true
  }).then(function (proceed) {
    if (!proceed) return

    const checkboxes = page.checkboxes[page.currentView]
    for (let i = 0; i < checkboxes.length; i++)
      if (checkboxes[i].checked)
        checkboxes[i].checked = false

    localStorage[lsKeys.selected[page.currentView]] = '[]'
    page.selected[page.currentView] = []

    const selectAll = document.getElementById('selectAll')
    if (selectAll) selectAll.checked = false

    return swal('清除选择！', `Unselected ${count} ${suffix}.`, 'success')
  })
}

page.filterByUploader = function (element) {
  const uploader = document.getElementById('uploader').value
  page.getUploads({ all: true, uploader }, element)
}

page.viewUserUploads = function (id) {
  const user = page.cache.users[id]
  if (!user) return
  page.setActiveMenu(document.getElementById('itemManageUploads'))
  page.getUploads({ all: true, uploader: user.username })
}

page.deleteFile = function (id) {
  // TODO: Share function with bulk delete, just like 'add selected uploads to album' and 'add single file to album'
  swal({
    title: '你确定吗？',
    text: '你将不能恢复文件！',
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: '是的，删除它！',
        closeModal: false
      }
    }
  }).then(function (proceed) {
    if (!proceed) return

    axios.post('api/upload/delete', { id }).then(function (response) {
      if (!response) return

      if (response.data.success === false)
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('发生错误！', response.data.description, 'error')
        }

      swal('删除！', '该文件已被删除。', 'success')
      page.getUploads(page.views[page.currentView])
    }).catch(function (error) {
      console.log(error)
      return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
    })
  })
}

page.deleteSelectedFiles = function () {
  const count = page.selected[page.currentView].length
  if (!count)
    return swal('发生错误！', '您尚未选择任何上传。', 'error')

  const suffix = `upload${count === 1 ? '' : 's'}`
  let text = `你将无法恢复 ${count} ${suffix}!`
  if (page.currentView === 'uploadsAll')
    text += '\nBe 知道，您可能正在努力上传其他用户！'

  swal({
    title: '你确定吗？',
    text,
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: `是的，核对 ${suffix}!`,
        closeModal: false
      }
    }
  }).then(function (proceed) {
    if (!proceed) return

    axios.post('api/upload/bulkdelete', {
      field: 'id',
      values: page.selected[page.currentView]
    }).then(function (bulkdelete) {
      if (!bulkdelete) return

      if (bulkdelete.data.success === false)
        if (bulkdelete.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('发生错误！', bulkdelete.data.description, 'error')
        }

      let deleted = count
      if (bulkdelete.data.failed && bulkdelete.data.failed.length) {
        deleted -= bulkdelete.data.failed.length
        page.selected[page.currentView] = page.selected[page.currentView].filter(function (id) {
          return bulkdelete.data.failed.includes(id)
        })
      } else {
        page.selected[page.currentView] = []
      }

      localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])

      swal('已删除！', `${deleted} 个文件被删除。`, 'success')
      return page.getUploads(page.views[page.currentView])
    }).catch(function (error) {
      console.log(error)
      swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
    })
  })
}

page.deleteByNames = function () {
  page.dom.innerHTML = `
    <h2 class="subtitle">按名称删除</h2>
    <div class="field">
      <label class="label">文件名:</label>
      <div class="control">
        <textarea id="names" class="textarea"></textarea>
      </div>
      <p class="help">每一行代表一个文件，以分行分隔。</p>
    </div>
    <div class="field">
      <div class="control">
        <a class="button is-danger is-fullwidth" data-action="delete-file-by-names">
          <span class="icon">
            <i class="icon-trash"></i>
          </span>
          <span>批量删除</span>
        </a>
      </div>
    </div>
  `
  page.fadeIn()
}

page.deleteFileByNames = function () {
  const names = document.getElementById('names').value
    .split(/\r?\n/)
    .filter(function (n) {
      return n.trim().length
    })
  const count = names.length
  if (!count)
    return swal('发生错误！', '您尚未输入任何文件名。', 'error')

  const suffix = `file${count === 1 ? '' : 's'}`
  swal({
    title: '你确定吗？',
    text: `你将无法恢复 ${count} 个文件!`,
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: `是的，核对文件!`,
        closeModal: false
      }
    }
  }).then(function (proceed) {
    if (!proceed) return

    axios.post('api/upload/bulkdelete', {
      field: 'name',
      values: names
    }).then(function (bulkdelete) {
      if (!bulkdelete) return

      if (bulkdelete.data.success === false)
        if (bulkdelete.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('发生错误！', bulkdelete.data.description, 'error')
        }

      let deleted = count
      if (bulkdelete.data.failed && bulkdelete.data.failed.length)
        deleted -= bulkdelete.data.failed.length

      document.getElementById('names').value = bulkdelete.data.failed.join('\n')
      swal('Deleted!', `${deleted} file${deleted === 1 ? ' has' : 's have'} been deleted.`, 'success')
    }).catch(function (error) {
      console.log(error)
      swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
    })
  })
}

page.addSelectedFilesToAlbum = function () {
  if (page.currentView !== 'uploads')
    return

  const count = page.selected[page.currentView].length
  if (!count)
    return swal('发生错误！', '您尚未选择任何上传。', 'error')

  page.addFilesToAlbum(page.selected[page.currentView], function (failed) {
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

page.addSingleFileToAlbum = function (id) {
  page.addFilesToAlbum([id], function (failed) {
    if (!failed) return
    page.getUploads(page.views[page.currentView])
  })
}

page.addFilesToAlbum = function (ids, callback) {
  const count = ids.length

  const content = document.createElement('div')
  content.innerHTML = `
    <div class="field has-text-centered">
      <p>你即将添加 <b>${count}</b> 个文件到相册。</p>
      <p><b>如果某个文件已在相册中，则会移动该文件。</b></p>
    </div>
    <div class="field">
      <div class="control">
        <div class="select is-fullwidth">
          <select id="swalAlbum" disabled>
            <option value="-1">从相册中删除</option>
            <option value="" selected disabled>获取相册列表\u2026</option>
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

    const albumid = parseInt(document.getElementById('swalAlbum').value)
    if (isNaN(albumid))
      return swal('发生错误！', '你没有选择专辑。', 'error')

    axios.post('api/albums/addfiles', {
      ids,
      albumid
    }).then(function (add) {
      if (!add) return

      if (add.data.success === false) {
        if (add.data.description === 'No token provided')
          page.verifyToken(page.token)
        else
          swal('发生错误！', add.data.description, 'error')

        return
      }

      let added = ids.length
      if (add.data.failed && add.data.failed.length)
        added -= add.data.failed.length

      const suffix = `file${ids.length === 1 ? '' : 's'}`
      if (!added)
        return swal('发生错误！', `无法添加 ${suffix} 到相册.`, 'error')

      swal('哇噢！', `成功 ${albumid < 0 ? 'removed' : 'added'} ${added} ${suffix} ${albumid < 0 ? 'from' : 'to'} 相册.`, 'success')
      return callback(add.data.failed)
    }).catch(function (error) {
      console.log(error)
      return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
    })
  }).catch(function (error) {
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })

  // Get albums list then update content of swal
  axios.get('api/albums').then(function (list) {
    if (list.data.success === false) {
      if (list.data.description === 'No token provided')
        page.verifyToken(page.token)
      else
        swal('发生错误！', list.data.description, 'error')

      return
    }

    const select = document.getElementById('swalAlbum')
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
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.getAlbums = function () {
  axios.get('api/albums').then(function (response) {
    if (!response) return

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('发生错误！', response.data.description, 'error')
      }

    page.cache.albums = {}

    page.dom.innerHTML = `
      <h2 class="subtitle">新建相册</h2>
      <div class="field">
        <div class="control">
          <input id="albumName" class="input" type="text" placeholder="名称">
        </div>
      </div>
      <div class="field">
        <div class="control">
          <textarea id="albumDescription" class="textarea" placeholder="描述" rows="1"></textarea>
        </div>
      </div>
      <div class="field">
        <div class="control">
          <a id="submitAlbum" class="button is-breeze is-fullwidth" data-action="submit-album">
            <span class="icon">
              <i class="icon-paper-plane-empty"></i>
            </span>
            <span>创建</span>
          </a>
        </div>
      </div>
      <hr>
      <h2 class="subtitle">相册列表</h2>
      <div class="table-container">
        <table class="table is-fullwidth is-hoverable">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>文件</th>
              <th>创建时间</th>
              <th>公共链接</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="table">
          </tbody>
        </table>
      </div>
    `
    page.fadeIn()

    const homeDomain = response.data.homeDomain
    const table = document.getElementById('table')

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
          <a class="button is-small is-primary" title="编辑相册" data-action="edit-album">
            <span class="icon is-small">
              <i class="icon-pencil-1"></i>
            </span>
          </a>
          <a class="button is-small is-info clipboard-js" title="复制链接到剪贴板" ${album.public ? `data-clipboard-text="${albumUrl}"` : 'disabled'}>
            <span class="icon is-small">
              <i class="icon-clipboard-1"></i>
            </span>
          </a>
          <a class="button is-small is-warning" title="下载相册" ${album.download ? `href="api/album/zip/${album.identifier}?v=${album.editedAt}"` : 'disabled'}>
            <span class="icon is-small">
              <i class="icon-download"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="删除相册" data-action="delete-album">
            <span class="icon is-small">
              <i class="icon-trash"></i>
            </span>
          </a>
        </td>
      `

      table.appendChild(tr)
    }
  }).catch(function (error) {
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
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
          启用下载
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalPublic" type="checkbox" ${album.public ? 'checked' : ''}>
          启用公共链接
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalRequestLink" type="checkbox">
          请求新的公共链接
        </label>
      </div>
    </div>
  `

  swal({
    title: '编辑相册',
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
      name: document.getElementById('swalName').value,
      description: document.getElementById('swalDescription').value,
      download: document.getElementById('swalDownload').checked,
      public: document.getElementById('swalPublic').checked,
      requestLink: document.getElementById('swalRequestLink').checked
    }).then(function (response) {
      if (!response) return

      if (response.data.success === false)
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('发生错误！', response.data.description, 'error')
        }

      if (response.data.identifier)
        swal('成功！', `您相册的新标识符是: ${response.data.identifier}.`, 'success')
      else if (response.data.name !== album.name)
        swal('成功！', `您的相册已重命名为: ${response.data.name}.`, 'success')
      else
        swal('成功！', '你的相册已更新！', 'success')

      page.getAlbumsSidebar()
      page.getAlbums()
    }).catch(function (error) {
      console.log(error)
      return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
    })
  })
}

page.deleteAlbum = function (id) {
  swal({
    title: '你确定吗？',
    text: '这将不会删除您上传的内容，只会删除相册！',
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: '是的，删除它！',
        closeModal: false
      },
      purge: {
        text: '删除它，并删除已上传文件！',
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
        } else {
          return swal('发生错误！', response.data.description, 'error')
        }

      swal('删除！', '您的相册已被删除。', 'success')
      page.getAlbumsSidebar()
      page.getAlbums()
    }).catch(function (error) {
      console.log(error)
      return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
    })
  })
}

page.submitAlbum = function (element) {
  page.isLoading(element, true)

  axios.post('api/albums', {
    name: document.getElementById('albumName').value,
    description: document.getElementById('albumDescription').value
  }).then(function (response) {
    if (!response) return

    page.isLoading(element, false)

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('发生错误！', response.data.description, 'error')
      }

    swal('哇噢！', '专辑已成功创建', 'success')
    page.getAlbumsSidebar()
    page.getAlbums()
  }).catch(function (error) {
    console.log(error)
    page.isLoading(element, false)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.getAlbumsSidebar = function () {
  axios.get('api/albums/sidebar').then(function (response) {
    if (!response) return

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('发生错误！', response.data.description, 'error')
      }

    const albumsContainer = document.getElementById('albumsContainer')
    albumsContainer.innerHTML = ''

    if (response.data.albums === undefined) return

    for (let i = 0; i < response.data.albums.length; i++) {
      const album = response.data.albums[i]
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
  }).catch(function (error) {
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.getAlbum = function (album) {
  page.setActiveMenu(album)
  page.getUploads({ album: album.id })
}

page.changeFileLength = function () {
  axios.get('api/filelength/config').then(function (response) {
    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('发生错误！', response.data.description, 'error')
      }

    // Shorter vars
    const { max, min } = response.data.config
    const [ chg, def ] = [ response.data.config.userChangeable, response.data.config.default ]
    const len = response.data.fileLength

    page.dom.innerHTML = `
      <h2 class="subtitle">文件名长度</h2>
      <div class="field">
        <div class="field">
          <label class="label">您当前的文件名长度：</label>
          <div class="control">
            <input id="fileLength" class="input" type="text" placeholder="你的文件长度" value="${len ? Math.min(Math.max(len, min), max) : def}">
          </div>
          <p class="help">默认文件名长度为 <b>${def}</b> 个字符。 ${(chg ? `用户允许的范围是 <b>${min}</b> 至 <b>${max}</b> 个字符。` : '目前已禁止更改文件名长度。')}</p>
        </div>
        <div class="field">
          <div class="control">
            <a id="setFileLength" class="button is-breeze is-fullwidth">
              <span class="icon">
                <i class="icon-paper-plane-empty"></i>
              </span>
              <span>设置文件名长度</span>
            </a>
          </div>
        <div>
      </div>
    `
    page.fadeIn()

    document.getElementById('setFileLength').addEventListener('click', function () {
      page.setFileLength(document.getElementById('fileLength').value, this)
    })
  }).catch(function (error) {
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.setFileLength = function (fileLength, element) {
  page.isLoading(element, true)

  axios.post('api/filelength/change', { fileLength }).then(function (response) {
    page.isLoading(element, false)

    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('发生错误！', response.data.description, 'error')
      }

    swal({
      title: '哇噢！',
      text: '您的文件长度已成功更改。',
      icon: 'success'
    }).then(function () {
      page.changeFileLength()
    })
  }).catch(function (error) {
    console.log(error)
    page.isLoading(element, false)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.changeToken = function () {
  axios.get('api/tokens').then(function (response) {
    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('发生错误！', response.data.description, 'error')
      }

    page.dom.innerHTML = `
      <h2 class="subtitle">管理您的token令牌</h2>
      <div class="field">
        <label class="label">你当前的令牌:</label>
        <div class="field">
          <div class="control">
            <input id="token" readonly class="input" type="text" placeholder="你的令牌" value="${response.data.token}">
          </div>
        </div>
      </div>
      <div class="field">
        <div class="control">
          <a id="getNewToken" class="button is-breeze is-fullwidth" data-action="get-new-token">
            <span class="icon">
              <i class="icon-arrows-cw"></i>
            </span>
            <span>请求新令牌</span>
          </a>
        </div>
      </div>
    `
    page.fadeIn()
  }).catch(function (error) {
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
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
        return swal('发生错误！', response.data.description, 'error')
      }

    swal({
      title: '哇噢！',
      text: '您的令牌已成功更改。',
      icon: 'success'
    }).then(function () {
      axios.defaults.headers.common.token = response.data.token
      localStorage[lsKeys.token] = response.data.token
      page.token = response.data.token
      page.changeToken()
    })
  }).catch(function (error) {
    console.log(error)
    page.isLoading(element, false)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.changePassword = function () {
  page.dom.innerHTML = `
    <h2 class="subtitle">更改您的密码</h2>
    <div class="field">
      <label class="label">新密码:</label>
      <div class="control">
        <input id="password" class="input" type="password">
      </div>
    </div>
    <div class="field">
      <label class="label">再次输入新密码:</label>
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
          <span>设置新密码</span>
        </a>
      </div>
    </div>
  `
  page.fadeIn()

  document.getElementById('sendChangePassword').addEventListener('click', function () {
    if (document.getElementById('password').value === document.getElementById('passwordConfirm').value)
      page.sendNewPassword(document.getElementById('password').value, this)
    else
      swal({
        title: '密码有误！',
        text: '您的密码不匹配，请重试。',
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
        return swal('发生错误！', response.data.description, 'error')
      }

    swal({
      title: '哇噢！',
      text: '您的密码已成功更改。',
      icon: 'success'
    }).then(function () {
      page.changePassword()
    })
  }).catch(function (error) {
    console.log(error)
    page.isLoading(element, false)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
  })
}

page.setActiveMenu = function (activeItem) {
  const menu = document.getElementById('menu')
  const items = menu.getElementsByTagName('a')
  for (let i = 0; i < items.length; i++)
    items[i].classList.remove('is-active')

  activeItem.classList.add('is-active')
}

page.getUsers = function ({ pageNum } = {}, element) {
  if (element) page.isLoading(element, true)
  if (pageNum === undefined) pageNum = 0

  if (!page.permissions.admin)
    return swal('发生错误！', '你不能做这个！', 'error')

  const url = `api/users/${pageNum}`
  axios.get(url).then(function (response) {
    if (response.data.success === false)
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('发生错误！', response.data.description, 'error')
      }

    if (pageNum && (response.data.users.length === 0)) {
      // Only remove loading class here, since beyond this the entire page will be replaced anyways
      if (element) page.isLoading(element, false)
      return swal('发生错误！', `没有更多用户填充页面 ${pageNum + 1}.`, 'error')
    }

    page.currentView = 'users'
    page.cache.users = {}

    const pagination = page.paginate(response.data.count, 25, pageNum)

    const extraControls = `
      <div class="columns" style="margin-top: 10px">
        <div class="column is-hidden-mobile"></div>
        <div class="column is-one-quarter">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="jumpToPage" class="input is-small" type="text" value="${pageNum + 1}">
            </div>
            <div class="control">
              <a class="button is-small is-breeze" title="跳转到页面" data-action="jump-to-page">
                <span class="icon">
                  <i class="icon-paper-plane-empty"></i>
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    `

    const controls = `
      <div class="columns">
        <div class="column is-hidden-mobile"></div>
        <div class="column" style="text-align: right">
          <a class="button is-small is-info" title="清空选项" data-action="clear-selection">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          <a class="button is-small is-warning" title="批量禁用（WIP）" data-action="bulk-disable-users" disabled>
            <span class="icon">
              <i class="icon-hammer"></i>
            </span>
            <span>批量禁用</span>
          </a>
          <a class="button is-small is-danger" title="批量删除（WIP）" data-action="bulk-delete-users" disabled>
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>批量删除</span>
          </a>
        </div>
      </div>
    `

    let allSelected = true

    page.dom.innerHTML = `
      ${pagination}
      ${extraControls}
      ${controls}
      <div class="table-container">
        <table class="table is-narrow is-fullwidth is-hoverable">
          <thead>
            <tr>
              <th><input id="selectAll" class="checkbox" type="checkbox" title="选择所有用户" data-action="select-all"></th>
              <th>ID</th>
              <th style="width: 25%">用户名</th>
              <th>已上传</th>
              <th>占用大小</th>
              <th>文件长度</th>
              <th>组</th>
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
    page.fadeIn()

    const table = document.getElementById('table')

    for (let i = 0; i < response.data.users.length; i++) {
      const user = response.data.users[i]
      const selected = page.selected.users.includes(user.id)
      if (!selected && allSelected) allSelected = false

      let displayGroup = null
      for (const group of Object.keys(user.groups)) {
        if (!user.groups[group]) break
        displayGroup = group
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
        <td class="controls"><input type="checkbox" class="checkbox" title="选择此用户" data-action="select"${selected ? ' checked' : ''}></td>
        <th>${user.id}</th>
        <th${enabled ? '' : ' class="is-linethrough"'}>${user.username}</td>
        <th>${user.uploadsCount}</th>
        <td>${page.getPrettyBytes(user.diskUsage)}</td>
        <td>${user.fileLength || 'default'}</td>
        <td>${displayGroup}</td>
        <td class="controls" style="text-align: right">
          <a class="button is-small is-primary" title="编辑用户" data-action="edit-user">
            <span class="icon">
              <i class="icon-pencil-1"></i>
            </span>
          </a>
          <a class="button is-small is-info" title="查看已上传文件" data-action="view-user-uploads" ${user.uploadsCount ? '' : 'disabled'}>
            <span class="icon">
              <i class="icon-docs"></i>
            </span>
          </a>
          <a class="button is-small is-warning" title="禁用该用户" data-action="disable-user" ${enabled ? '' : 'disabled'}>
            <span class="icon">
              <i class="icon-hammer"></i>
            </span>
          </a>
          <a class="button is-small is-danger" title="删除用户（WIP）" data-action="delete-user" disabled>
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
          </a>
        </td>
      `

      table.appendChild(tr)
      // page.checkboxes.users = Array.from(table.getElementsByClassName('checkbox'))
      page.checkboxes.users = Array.from(table.querySelectorAll('.checkbox[data-action="select"]'))
    }

    if (allSelected && response.data.users.length) {
      const selectAll = document.getElementById('selectAll')
      if (selectAll) selectAll.checked = true
    }

    page.views.users.pageNum = response.data.users.length ? pageNum : 0
  }).catch(function (error) {
    if (element) page.isLoading(element, false)
    console.log(error)
    return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
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
      <label class="label">用户名</label>
      <div class="controls">
        <input id="swalUsername" class="input" type="text" value="${user.username || ''}">
      </div>
    </div>
    <div class="field">
      <label class="label">用户组</label>
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
          启用
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalResetPassword" type="checkbox">
          重置密码
        </label>
      </div>
    </div>
  `

  swal({
    title: '编辑用户',
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
      username: document.getElementById('swalUsername').value,
      group: document.getElementById('swalGroup').value,
      enabled: document.getElementById('swalEnabled').checked,
      resetPassword: document.getElementById('swalResetPassword').checked
    }).then(function (response) {
      if (!response) return

      if (response.data.success === false)
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('发生错误！', response.data.description, 'error')
        }

      if (response.data.password) {
        const div = document.createElement('div')
        div.innerHTML = `
          <p>${user.username}'s 新密码是:</p>
          <p class="is-code">${response.data.password}</p>
        `
        swal({
          title: '成功！',
          icon: 'success',
          content: div
        })
      } else if (response.data.update && response.data.update.username !== user.username) {
        swal('成功！', `${user.username} was renamed into: ${response.data.update.name}.`, 'success')
      } else {
        swal('成功！', '用户已被编辑！', 'success')
      }

      page.getUsers(page.views.users)
    }).catch(function (error) {
      console.log(error)
      return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
    })
  })
}

page.disableUser = function (id) {
  const user = page.cache.users[id]
  if (!user || !user.enabled) return

  const content = document.createElement('div')
  content.innerHTML = `您将禁用用户 <b>${page.cache.users[id].username}</b>!`

  swal({
    title: '你确定吗？',
    icon: 'warning',
    content,
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: '是的，禁用它们！',
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
          return swal('发生错误！', response.data.description, 'error')

      swal('成功！', '用户已被禁用。', 'success')
      page.getUsers(page.views.users)
    }).catch(function (error) {
      console.log(error)
      return swal('发生错误！', '请求出错，请查看控制台以获取更多信息。', 'error')
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
        <li><span class="pagination-ellipsis">&hellip;</span></li>
      `
    },
    endDots () {
      template += `
        <li><span class="pagination-ellipsis">&hellip;</span></li>
        <li><a class="button pagination-link" aria-label="Goto page ${numPages}" data-action="page-goto" data-goto="${numPages - 1}">${numPages}</a></li>
      `
    }
  }

  if (elementsToShow >= numPages) {
    add.pageNum(1, numPages)
  } else if (currentPage < elementsToShow) {
    add.pageNum(1, elementsToShow)
    add.endDots()
  } else if (currentPage > numPages - elementsToShow) {
    add.startDots()
    add.pageNum(numPages - elementsToShow, numPages)
  } else {
    add.startDots()
    add.pageNum(currentPage - step, currentPage, step)
    add.endDots()
  }

  return `
    <nav class="pagination is-centered is-small">
      <a class="button pagination-previous" data-action="page-prev">上一页</a>
      <a class="button pagination-next" data-action="page-next">下一页</a>
      <ul class="pagination-list">${template}</ul>
    </nav>
  `
}

page.getPrettyDate = function (date) {
  return date.getFullYear() + '-' +
    (date.getMonth() < 9 ? '0' : '') + // month's index starts from zero
    (date.getMonth() + 1) + '-' +
    (date.getDate() < 10 ? '0' : '') +
    date.getDate() + ' ' +
    (date.getHours() < 10 ? '0' : '') +
    date.getHours() + ':' +
    (date.getMinutes() < 10 ? '0' : '') +
    date.getMinutes() + ':' +
    (date.getSeconds() < 10 ? '0' : '') +
    date.getSeconds()
}

page.getPrettyBytes = function (num, si) {
  // MIT License
  // Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
  if (!Number.isFinite(num)) return num

  const neg = num < 0 ? '-' : ''
  const scale = si ? 1000 : 1024
  if (neg) num = -num
  if (num < scale) return `${neg}${num} B`

  const exponent = Math.min(Math.floor(Math.log10(num) / 3), 8) // 8 is count of KMGTPEZY
  const numStr = Number((num / Math.pow(scale, exponent)).toPrecision(3))
  const pre = (si ? 'kMGTPEZY' : 'KMGTPEZY').charAt(exponent - 1) + (si ? '' : 'i')
  return `${neg}${numStr} ${pre}B`
}

window.onload = function () {
  // Add 'no-touch' class to non-touch devices
  if (!('ontouchstart' in document.documentElement))
    document.documentElement.classList.add('no-touch')

  const selectedKeys = ['uploads', 'uploadsAll', 'users']
  for (const selectedKey of selectedKeys) {
    const ls = localStorage[lsKeys.selected[selectedKey]]
    if (ls) page.selected[selectedKey] = JSON.parse(ls)
  }

  page.preparePage()

  page.clipboardJS = new ClipboardJS('.clipboard-js')

  page.clipboardJS.on('success', function () {
    return swal('已复制！', '该链接已复制到剪贴板。', 'success')
  })

  page.clipboardJS.on('error', function (event) {
    console.error(event)
    return swal('发生错误！', '尝试将链接复制到剪贴板时出错，请检查控制台以获取更多信息。', 'error')
  })

  page.lazyLoad = new LazyLoad()
}
