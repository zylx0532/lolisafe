/* global swal, axios, Dropzone, ClipboardJS, LazyLoad */

const page = {
  // user token
  token: localStorage.token,

  // configs from api/check
  private: null,
  enableUserAccounts: null,
  maxFileSize: null,
  chunkSize: null,

  // store album id that will be used with upload requests
  album: null,

  albumSelect: null,
  previewTemplate: null,

  dropzone: null,
  clipboardJS: null,
  lazyLoad: null,

  imageExtensions: ['.webp', '.jpg', '.jpeg', '.bmp', '.gif', '.png', '.svg']
}

page.checkIfPublic = function () {
  axios.get('api/check').then(function (response) {
    page.private = response.data.private
    page.enableUserAccounts = response.data.enableUserAccounts
    page.maxFileSize = response.data.maxFileSize
    page.chunkSize = response.data.chunkSize
    page.preparePage()
  }).catch(function (error) {
    console.log(error)
    const button = document.getElementById('loginToUpload')
    button.classList.remove('is-loading')
    button.innerText = 'Error occurred. Reload the page?'
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.preparePage = function () {
  if (page.private)
    if (page.token) {
      return page.verifyToken(page.token, true)
    } else {
      const button = document.getElementById('loginToUpload')
      button.href = 'auth'
      button.classList.remove('is-loading')

      if (page.enableUserAccounts)
        button.innerText = 'Anonymous upload is disabled. Log in to page.'
      else
        button.innerText = 'Running in private mode. Log in to page.'
    }
  else
    return page.prepareUpload()
}

page.verifyToken = function (token, reloadOnError) {
  if (reloadOnError === undefined) reloadOnError = false

  axios.post('api/tokens/verify', { token }).then(function (response) {
    if (response.data.success === false)
      return swal({
        title: 'An error occurred!',
        text: response.data.description,
        icon: 'error'
      }).then(function () {
        if (!reloadOnError) return
        localStorage.removeItem('token')
        location.reload()
      })

    localStorage.token = token
    page.token = token
    return page.prepareUpload()
  }).catch(function (error) {
    console.log(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.prepareUpload = function () {
  // I think this fits best here because we need to check for a valid token before we can get the albums
  if (page.token) {
    page.albumSelect = document.getElementById('albumSelect')

    page.albumSelect.addEventListener('change', function () {
      page.album = parseInt(page.albumSelect.value)
    })

    page.prepareAlbums()

    // Display the album selection
    document.getElementById('albumDiv').style.display = 'flex'
  }

  document.getElementById('maxFileSize').innerHTML = `Maximum upload size per file is ${page.maxFileSize}`
  document.getElementById('loginToUpload').style.display = 'none'

  if (!page.token && page.enableUserAccounts)
    document.getElementById('loginLinkText').innerHTML = 'Create an account and keep track of your uploads'

  const previewNode = document.querySelector('#tpl')
  page.previewTemplate = previewNode.innerHTML
  previewNode.parentNode.removeChild(previewNode)

  page.prepareDropzone()

  const tabs = document.getElementById('tabs')
  if (tabs) {
    tabs.style.display = 'flex'
    const items = tabs.getElementsByTagName('li')
    for (let i = 0; i < items.length; i++)
      items[i].addEventListener('click', function () {
        page.setActiveTab(this.dataset.id)
      })

    document.getElementById('uploadUrls').addEventListener('click', function () {
      page.uploadUrls(this)
    })
    page.setActiveTab('tab-files')
  } else {
    document.getElementById('tab-files').style.display = 'block'
  }
}

page.prepareAlbums = function () {
  const option = document.createElement('option')
  option.value = ''
  option.innerHTML = 'Upload to album'
  option.disabled = true
  option.selected = true
  page.albumSelect.appendChild(option)

  axios.get('api/albums', {
    headers: {
      token: page.token
    }
  }).then(function (response) {
    if (response.data.success === false)
      return swal('An error occurred!', response.data.description, 'error')

    // If the user doesn't have any albums we don't really need to display
    // an album selection
    if (!response.data.albums.length) return

    // Loop through the albums and create an option for each album
    for (let i = 0; i < response.data.albums.length; i++) {
      const album = response.data.albums[i]
      const option = document.createElement('option')
      option.value = album.id
      option.innerHTML = album.name
      page.albumSelect.appendChild(option)
    }
  }).catch(function (error) {
    console.log(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.setActiveTab = function (activeId) {
  const items = document.getElementById('tabs').getElementsByTagName('li')
  for (let i = 0; i < items.length; i++) {
    const tabId = items[i].dataset.id
    if (tabId === activeId) {
      items[i].classList.add('is-active')
      document.getElementById(tabId).style.display = 'block'
    } else {
      items[i].classList.remove('is-active')
      document.getElementById(tabId).style.display = 'none'
    }
  }
}

page.prepareDropzone = function () {
  const tabDiv = document.getElementById('tab-files')
  const div = document.createElement('div')
  div.className = 'control is-expanded'
  div.innerHTML = `
    <div id="dropzone" class="button is-danger is-fullwidth is-unselectable">
      <span class="icon">
        <i class="icon-upload-cloud"></i>
      </span>
      <span>Click here or drag and drop files</span>
    </div>
  `
  tabDiv.querySelector('.dz-container').appendChild(div)

  const previewsContainer = tabDiv.querySelector('#tab-files .field.uploads')
  page.dropzone = new Dropzone('#dropzone', {
    url: 'api/upload',
    paramName: 'files[]',
    maxFilesize: parseInt(page.maxFileSize),
    parallelUploads: 2,
    uploadMultiple: false,
    previewsContainer,
    previewTemplate: page.previewTemplate,
    createImageThumbnails: false,
    maxFiles: 1000,
    autoProcessQueue: true,
    headers: { token: page.token },
    chunking: Boolean(page.chunkSize),
    chunkSize: parseInt(page.chunkSize) * 1000000, // 1000000 B = 1 MB,
    parallelChunkUploads: false, // when set to true, sometimes it often hangs with hundreds of parallel uploads
    chunksUploaded (file, done) {
      file.previewElement.querySelector('.progress').setAttribute('value', 100)
      file.previewElement.querySelector('.progress').innerHTML = '100%'

      return axios.post('api/upload/finishchunks', {
        // The API supports an array of multiple files
        files: [{
          uuid: file.upload.uuid,
          original: file.name,
          size: file.size,
          type: file.type,
          count: file.upload.totalChunkCount,
          albumid: page.album
        }]
      }, {
        headers: {
          token: page.token
        }
      }).then(function (response) {
        file.previewElement.querySelector('.progress').style.display = 'none'

        if (response.data.success === false)
          file.previewElement.querySelector('.error').innerHTML = response.data.description

        if (response.data.files && response.data.files[0])
          page.updateTemplate(file, response.data.files[0])

        return done()
      }).catch(function (error) {
        return {
          success: false,
          description: error.toString()
        }
      })
    }
  })

  page.dropzone.on('addedfile', function (file) {
    tabDiv.getElementsByClassName('uploads')[0].style.display = 'block'
    file.previewElement.querySelector('.name').innerHTML = file.name
  })

  // Add the selected albumid, if an album is selected, as a header
  page.dropzone.on('sending', function (file, xhr) {
    if (file.upload.chunked) return
    if (page.album) xhr.setRequestHeader('albumid', page.album)
  })

  // Update the total progress bar
  page.dropzone.on('uploadprogress', function (file, progress) {
    if (file.upload.chunked && progress === 100) return
    file.previewElement.querySelector('.progress').setAttribute('value', progress)
    file.previewElement.querySelector('.progress').innerHTML = `${progress}%`
  })

  page.dropzone.on('success', function (file, response) {
    if (!response) return
    file.previewElement.querySelector('.progress').style.display = 'none'
    // file.previewElement.querySelector('.name').innerHTML = file.name

    if (response.success === false)
      file.previewElement.querySelector('.error').innerHTML = response.description

    if (response.files && response.files[0])
      page.updateTemplate(file, response.files[0])
  })

  page.dropzone.on('error', function (file, error) {
    page.updateTemplateIcon(file.previewElement, 'icon-block')
    file.previewElement.querySelector('.progress').style.display = 'none'
    file.previewElement.querySelector('.name').innerHTML = file.name
    file.previewElement.querySelector('.error').innerHTML = error.description || error
  })

  if (typeof page.prepareShareX === 'function') page.prepareShareX()
}

page.uploadUrls = function (button) {
  const tabDiv = document.getElementById('tab-urls')
  if (!tabDiv) return

  if (button.classList.contains('is-loading')) return
  button.classList.add('is-loading')

  function done (error) {
    if (error) swal('An error occurred!', error, 'error')
    button.classList.remove('is-loading')
  }

  function run () {
    const albumid = page.album
    const previewsContainer = tabDiv.getElementsByClassName('uploads')[0]
    const urls = document.getElementById('urls').value
      .split(/\r?\n/)
      .filter(function (url) {
        return url.trim().length
      })
    document.getElementById('urls').value = urls.join('\n')

    if (!urls.length)
      // eslint-disable-next-line prefer-promise-reject-errors
      return done('You have not entered any URLs.')

    tabDiv.getElementsByClassName('uploads')[0].style.display = 'block'
    const files = urls.map(function (url) {
      const previewTemplate = document.createElement('template')
      previewTemplate.innerHTML = page.previewTemplate.trim()
      const previewElement = previewTemplate.content.firstChild
      previewElement.querySelector('.name').innerHTML = url
      previewElement.querySelector('.progress').removeAttribute('value')
      previewsContainer.appendChild(previewElement)
      return {
        url,
        previewElement
      }
    })

    function post (i) {
      if (i === files.length) return done()

      const file = files[i]

      function posted (result) {
        file.previewElement.querySelector('.progress').style.display = 'none'
        if (result.success) {
          page.updateTemplate(file, result.files[0])
        } else {
          page.updateTemplateIcon(file.previewElement, 'icon-block')
          file.previewElement.querySelector('.error').innerHTML = result.description
        }
        return post(i + 1)
      }

      axios.post('api/upload', {
        urls: [file.url]
      }, {
        headers: {
          token: page.token,
          albumid
        }
      }).then(function (response) {
        return posted(response.data)
      }).catch(function (error) {
        return posted({
          success: false,
          description: error.response ? error.response.data.description : error.toString()
        })
      })
    }
    return post(0)
  }
  return run()
}

page.updateTemplateIcon = function (templateElement, iconClass) {
  const iconElement = templateElement.querySelector('.icon')
  if (!iconElement) return
  iconElement.classList.add(iconClass)
  iconElement.style.display = ''
}

page.updateTemplate = function (file, response) {
  if (!response.url) return

  const a = file.previewElement.querySelector('.link > a')
  const clipboard = file.previewElement.querySelector('.clipboard-mobile > .clipboard-js')
  a.href = a.innerHTML = clipboard.dataset['clipboardText'] = response.url
  clipboard.parentElement.style.display = 'block'

  const exec = /.[\w]+(\?|$)/.exec(response.url)
  if (exec && exec[0] && page.imageExtensions.includes(exec[0].toLowerCase())) {
    const img = file.previewElement.querySelector('img')
    img.setAttribute('alt', response.name || '')
    img.dataset['src'] = response.url
    img.style.display = ''
    img.onerror = function () {
      // Hide image elements that fail to load
      // Consequently include WEBP in browsers that do not have WEBP support (Firefox/IE)
      this.style.display = 'none'
      file.previewElement.querySelector('.icon').style.display = ''
    }
    page.lazyLoad.update(file.previewElement.querySelectorAll('img'))
  } else {
    page.updateTemplateIcon(file.previewElement, 'icon-doc-inv')
  }
}

page.createAlbum = function () {
  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <div class="controls">
        <input id="swalName" class="input" type="text" placeholder="Name">
      </div>
    </div>
    <div class="field">
      <div class="control">
        <textarea id="swalDescription" class="textarea" placeholder="Description" rows="2"></textarea>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalDownload" type="checkbox" checked>
          Enable download
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalPublic" type="checkbox" checked>
          Enable public link
        </label>
      </div>
    </div>
  `

  swal({
    title: 'Create new album',
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

    const name = document.getElementById('swalName').value
    axios.post('api/albums', {
      name,
      description: document.getElementById('swalDescription').value,
      download: document.getElementById('swalDownload').checked,
      public: document.getElementById('swalPublic').checked
    }, {
      headers: {
        token: page.token
      }
    }).then(function (response) {
      if (response.data.success === false)
        return swal('An error occurred!', response.data.description, 'error')

      const option = document.createElement('option')
      option.value = response.data.id
      option.innerHTML = name
      page.albumSelect.appendChild(option)

      swal('Woohoo!', 'Album was created successfully', 'success')
    }).catch(function (error) {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  })
}

// Handle image paste event
window.addEventListener('paste', function (event) {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items
  for (const index in items) {
    const item = items[index]
    if (item.kind === 'file') {
      const blob = item.getAsFile()
      const file = new File([blob], `pasted-image.${blob.type.match(/(?:[^/]*\/)([^;]*)/)[1]}`)
      file.type = blob.type
      page.dropzone.addFile(file)
    }
  }
})

window.onload = function () {
  page.checkIfPublic()

  page.clipboardJS = new ClipboardJS('.clipboard-js')

  page.clipboardJS.on('success', function () {
    return swal('Copied!', 'The link has been copied to clipboard.', 'success')
  })

  page.clipboardJS.on('error', function (event) {
    console.error(event)
    return swal('An error occurred!', 'There was an error when trying to copy the link to clipboard, please check the console for more information.', 'error')
  })

  page.lazyLoad = new LazyLoad({
    elements_selector: '.field.uploads img'
  })

  document.getElementById('createAlbum').addEventListener('click', function () {
    page.createAlbum()
  })
}
