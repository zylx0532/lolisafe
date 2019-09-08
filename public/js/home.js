/* global swal, axios, Dropzone, ClipboardJS, LazyLoad */

const lsKeys = {
  token: 'token',
  chunkSize: 'chunkSize',
  parallelUploads: 'parallelUploads',
  fileLength: 'fileLength',
  uploadAge: 'uploadAge'
}

const page = {
  // user token
  token: localStorage[lsKeys.token],

  // configs from api/check
  private: null,
  enableUserAccounts: null,
  maxSize: null,
  chunkSize: null,
  temporaryUploadAges: null,
  fileIdentifierLength: null,

  // store album id that will be used with upload requests
  album: null,

  parallelUploads: null,
  fileLength: null,
  uploadAge: null,

  maxSizeBytes: null,
  urlMaxSize: null,
  urlMaxSizeBytes: null,

  tabs: null,
  activeTab: null,
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
    page.maxSize = parseInt(response.data.maxSize)
    page.maxSizeBytes = page.maxSize * 1e6
    page.chunkSize = parseInt(response.data.chunkSize)
    page.temporaryUploadAges = response.data.temporaryUploadAges
    page.fileIdentifierLength = response.data.fileIdentifierLength
    page.preparePage()
  }).catch(function (error) {
    console.error(error)
    document.querySelector('#albumDiv').style.display = 'none'
    document.querySelector('#tabs').style.display = 'none'
    const button = document.querySelector('#loginToUpload')
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
      const button = document.querySelector('#loginToUpload')
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
    console.error(error)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
  })
}

page.prepareUpload = function () {
  // I think this fits best here because we need to check for a valid token before we can get the albums
  if (page.token) {
    page.albumSelect = document.querySelector('#albumSelect')
    page.albumSelect.addEventListener('change', function () {
      page.album = parseInt(page.albumSelect.value)
      // Re-generate ShareX config file
      if (typeof page.prepareShareX === 'function')
        page.prepareShareX()
    })

    page.prepareAlbums()

    // Display the album selection
    document.querySelector('#albumDiv').style.display = 'flex'
  }

  page.prepareUploadConfig()

  document.querySelector('#maxSize').innerHTML = `Maximum upload size per file is ${page.getPrettyBytes(page.maxSizeBytes)}`
  document.querySelector('#loginToUpload').style.display = 'none'

  if (!page.token && page.enableUserAccounts)
    document.querySelector('#loginLinkText').innerHTML = 'Create an account and keep track of your uploads'

  const previewNode = document.querySelector('#tpl')
  page.previewTemplate = previewNode.innerHTML
  previewNode.parentNode.removeChild(previewNode)

  page.prepareDropzone()

  // Generate ShareX config file
  if (typeof page.prepareShareX === 'function')
    page.prepareShareX()

  const urlMaxSize = document.querySelector('#urlMaxSize')
  if (urlMaxSize) {
    page.urlMaxSize = parseInt(urlMaxSize.innerHTML)
    page.urlMaxSizeBytes = page.urlMaxSize * 1e6
    urlMaxSize.innerHTML = page.getPrettyBytes(page.urlMaxSizeBytes)
    document.querySelector('#uploadUrls').addEventListener('click', function () {
      page.uploadUrls(this)
    })
  }

  const tabs = document.querySelector('#tabs')
  page.tabs = tabs.querySelectorAll('li')
  for (let i = 0; i < page.tabs.length; i++)
    page.tabs[i].addEventListener('click', function () {
      page.setActiveTab(this.dataset.id)
    })
  page.setActiveTab('tab-files')
  tabs.style.display = 'flex'
}

page.prepareAlbums = function () {
  const option = document.createElement('option')
  option.value = ''
  option.innerHTML = 'Upload to album'
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
    console.error(error)
    const description = error.response.data && error.response.data.description
      ? error.response.data.description
      : 'There was an error with the request, please check the console for more information.'
    return swal(`${error.response.status} ${error.response.statusText}`, description, 'error')
  })
}

page.setActiveTab = function (tabId) {
  if (tabId === page.activeTab) return
  for (let i = 0; i < page.tabs.length; i++) {
    const id = page.tabs[i].dataset.id
    if (id === tabId) {
      page.tabs[i].classList.add('is-active')
      document.querySelector(`#${id}`).style.display = 'block'
    } else {
      page.tabs[i].classList.remove('is-active')
      document.querySelector(`#${id}`).style.display = 'none'
    }
  }
  page.activeTab = tabId
}

page.prepareDropzone = function () {
  const tabDiv = document.querySelector('#tab-files')
  const div = document.createElement('div')
  div.className = 'control is-expanded'
  div.innerHTML = `
    <div id="dropzone" class="button is-danger is-fullwidth is-unselectable">
      <span class="icon">
        <i class="icon-upload-cloud"></i>
      </span>
      <span>Click here or drag & drop files</span>
    </div>
  `
  tabDiv.querySelector('.dz-container').appendChild(div)

  const previewsContainer = tabDiv.querySelector('#tab-files .field.uploads')

  page.dropzone = new Dropzone(document.body, {
    url: 'api/upload',
    paramName: 'files[]',
    clickable: tabDiv.querySelector('#dropzone'),
    maxFilesize: page.maxSizeBytes / 1024 / 1024, // this option expects MiB
    parallelUploads: page.parallelUploads,
    uploadMultiple: false,
    previewsContainer,
    previewTemplate: page.previewTemplate,
    createImageThumbnails: false,
    autoProcessQueue: true,
    headers: { token: page.token },
    chunking: Boolean(page.chunkSize),
    chunkSize: page.chunkSize * 1e6, // the option below expects Bytes
    parallelChunkUploads: false, // when set to true, it often hangs with hundreds of parallel uploads
    chunksUploaded (file, done) {
      file.previewElement.querySelector('.progress').setAttribute('value', 100)
      file.previewElement.querySelector('.progress').innerHTML = '100%'

      return axios.post('api/upload/finishchunks', {
        // This API supports an array of multiple files
        files: [{
          uuid: file.upload.uuid,
          original: file.name,
          type: file.type,
          albumid: page.album,
          filelength: page.fileLength,
          age: page.uploadAge
        }]
      }, {
        headers: { token: page.token }
      }).catch(function (error) {
        if (error.response.data) return error.response
        return {
          data: {
            success: false,
            description: error.toString()
          }
        }
      }).then(function (response) {
        file.previewElement.querySelector('.progress').style.display = 'none'

        if (response.data.success === false)
          file.previewElement.querySelector('.error').innerHTML = response.data.description

        if (response.data.files && response.data.files[0])
          page.updateTemplate(file, response.data.files[0])

        return done()
      })
    }
  })

  page.dropzone.on('addedfile', function (file) {
    // Set active tab to file uploads
    page.setActiveTab('tab-files')
    // Add file entry
    tabDiv.querySelector('.uploads').style.display = 'block'
    file.previewElement.querySelector('.name').innerHTML = file.name
  })

  page.dropzone.on('sending', function (file, xhr) {
    if (file.upload.chunked) return
    // Add headers if not uploading chunks
    if (page.album !== null) xhr.setRequestHeader('albumid', page.album)
    if (page.fileLength !== null) xhr.setRequestHeader('filelength', page.fileLength)
    if (page.uploadAge !== null) xhr.setRequestHeader('age', page.uploadAge)
  })

  // Update the total progress bar
  page.dropzone.on('uploadprogress', function (file, progress) {
    // For some reason, chunked uploads fire 100% progress event
    // for each chunk's successful uploads
    if (file.upload.chunked && progress === 100) return
    file.previewElement.querySelector('.progress').setAttribute('value', progress)
    file.previewElement.querySelector('.progress').innerHTML = `${progress}%`
  })

  page.dropzone.on('success', function (file, response) {
    if (!response) return
    file.previewElement.querySelector('.progress').style.display = 'none'

    if (response.success === false)
      file.previewElement.querySelector('.error').innerHTML = response.description

    if (response.files && response.files[0])
      page.updateTemplate(file, response.files[0])
  })

  page.dropzone.on('error', function (file, error) {
    // Clean up file size errors
    if ((typeof error === 'string' && /^File is too big/.test(error)) ||
      (typeof error === 'object' && /File too large/.test(error.description)))
      error = `File too large (${page.getPrettyBytes(file.size)}).`

    page.updateTemplateIcon(file.previewElement, 'icon-block')
    file.previewElement.querySelector('.progress').style.display = 'none'
    file.previewElement.querySelector('.name').innerHTML = file.name
    file.previewElement.querySelector('.error').innerHTML = error.description || error
  })
}

page.uploadUrls = function (button) {
  const tabDiv = document.querySelector('#tab-urls')
  if (!tabDiv) return

  if (button.classList.contains('is-loading')) return
  button.classList.add('is-loading')

  function done (error) {
    if (error) swal('An error occurred!', error, 'error')
    button.classList.remove('is-loading')
  }

  function run () {
    const headers = {
      token: page.token,
      albumid: page.album,
      age: page.uploadAge,
      filelength: page.fileLength
    }

    const previewsContainer = tabDiv.querySelector('.uploads')
    const urls = document.querySelector('#urls').value
      .split(/\r?\n/)
      .filter(function (url) {
        return url.trim().length
      })
    document.querySelector('#urls').value = urls.join('\n')

    if (!urls.length)
      // eslint-disable-next-line prefer-promise-reject-errors
      return done('You have not entered any URLs.')

    tabDiv.querySelector('.uploads').style.display = 'block'
    const files = urls.map(function (url) {
      const previewTemplate = document.createElement('template')
      previewTemplate.innerHTML = page.previewTemplate.trim()
      const previewElement = previewTemplate.content.firstChild
      previewElement.querySelector('.name').innerHTML = url
      previewsContainer.appendChild(previewElement)
      return { url, previewElement }
    })

    function post (i) {
      if (i === files.length)
        return done()

      function posted (result) {
        files[i].previewElement.querySelector('.progress').style.display = 'none'
        if (result.success) {
          page.updateTemplate(files[i], result.files[0])
        } else {
          page.updateTemplateIcon(files[i].previewElement, 'icon-block')
          files[i].previewElement.querySelector('.error').innerHTML = result.description
        }
        return post(i + 1)
      }

      // Animate progress bar
      files[i].previewElement.querySelector('.progress').removeAttribute('value')

      axios.post('api/upload', { urls: [files[i].url] }, { headers }).then(function (response) {
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
  a.href = a.innerHTML = clipboard.dataset.clipboardText = response.url
  clipboard.parentElement.style.display = 'block'

  const exec = /.[\w]+(\?|$)/.exec(response.url)
  if (exec && exec[0] && page.imageExtensions.includes(exec[0].toLowerCase())) {
    const img = file.previewElement.querySelector('img')
    img.setAttribute('alt', response.name || '')
    img.dataset.src = response.url
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

  if (response.expirydate) {
    const expiryDate = file.previewElement.querySelector('.expiry-date')
    expiryDate.innerHTML = `Expiry date: ${page.getPrettyDate(new Date(response.expirydate * 1000))}`
    expiryDate.style.display = 'block'
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

    const name = document.querySelector('#swalName').value.trim()
    axios.post('api/albums', {
      name,
      description: document.querySelector('#swalDescription').value.trim(),
      download: document.querySelector('#swalDownload').checked,
      public: document.querySelector('#swalPublic').checked
    }, {
      headers: {
        token: page.token
      }
    }).then(function (response) {
      if (response.data.success === false)
        return swal('An error occurred!', response.data.description, 'error')

      const option = document.createElement('option')
      page.albumSelect.appendChild(option)
      option.value = response.data.id
      option.innerHTML = name
      option.selected = true

      swal('Woohoo!', 'Album was created successfully.', 'success')
    }).catch(function (error) {
      console.error(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  })
}

page.prepareUploadConfig = function () {
  const fallback = {
    chunkSize: page.chunkSize,
    parallelUploads: 2
  }

  page.chunkSize = parseInt(localStorage[lsKeys.chunkSize]) || fallback.chunkSize
  page.parallelUploads = parseInt(localStorage[lsKeys.parallelUploads]) || fallback.parallelUploads
  document.querySelector('#chunkSize').value = page.chunkSize
  document.querySelector('#parallelUploads').value = page.parallelUploads

  const numConfig = {
    chunkSize: { min: 1, max: 95 },
    parallelUploads: { min: 1, max: Number.MAX_SAFE_INTEGER }
  }

  document.querySelector('#chunkSizeDiv .help').innerHTML =
    `Default is ${fallback.chunkSize} MB. Max is ${numConfig.chunkSize.max}.`
  document.querySelector('#parallelUploadsDiv .help').innerHTML =
    `Default is ${fallback.parallelUploads}.`

  const fileLengthDiv = document.querySelector('#fileLengthDiv')
  if (page.fileIdentifierLength && fileLengthDiv) {
    const element = document.querySelector('#fileLength')
    const stored = parseInt(localStorage[lsKeys.fileLength])

    fallback.fileLength = page.fileIdentifierLength.default
    let helpText = `Default is ${page.fileIdentifierLength.default}.`

    const range = typeof page.fileIdentifierLength.min === 'number' &&
      typeof page.fileIdentifierLength.max === 'number'

    if (range) {
      helpText += ` Min is ${page.fileIdentifierLength.min}. Max is ${page.fileIdentifierLength.max}`
      numConfig.fileLength = {
        min: page.fileIdentifierLength.min,
        max: page.fileIdentifierLength.max
      }
    }

    if (page.fileIdentifierLength.force) {
      helpText += ' This option is currently disabled.'
      element.disabled = true
    }

    if (page.fileIdentifierLength.force ||
      isNaN(stored) ||
      !range ||
      stored < page.fileIdentifierLength.min ||
      stored > page.fileIdentifierLength.max) {
      element.value = fallback.fileLength
      page.fileLength = null
    } else {
      element.value = stored
      page.fileLength = stored
    }

    fileLengthDiv.style.display = 'block'
    fileLengthDiv.querySelector('.help').innerHTML = helpText
  }

  Object.keys(numConfig).forEach(function (key) {
    document.querySelector(`#${key}`).setAttribute('min', numConfig[key].min)
    document.querySelector(`#${key}`).setAttribute('max', numConfig[key].max)
  })

  const uploadAgeDiv = document.querySelector('#uploadAgeDiv')
  if (Array.isArray(page.temporaryUploadAges) && page.temporaryUploadAges.length && uploadAgeDiv) {
    const element = document.querySelector('#uploadAge')
    const stored = parseFloat(localStorage[lsKeys.uploadAge])
    for (let i = 0; i < page.temporaryUploadAges.length; i++) {
      const age = page.temporaryUploadAges[i]
      const option = document.createElement('option')
      option.value = i === 0 ? 'default' : age
      option.innerHTML = page.getPrettyUploadAge(age) +
        (i === 0 ? ' (default)' : '')
      element.appendChild(option)
      if (age === stored) {
        element.value = option.value
        page.uploadAge = stored
      }
    }
    uploadAgeDiv.style.display = 'block'
  }

  const tabContent = document.querySelector('#tab-config')
  const form = tabContent.querySelector('form')
  form.addEventListener('submit', function (event) {
    event.preventDefault()
  })

  const siBytes = localStorage[lsKeys.siBytes] !== '0'
  if (!siBytes) document.querySelector('#siBytes').value = '0'

  document.querySelector('#saveConfig').addEventListener('click', function () {
    if (!form.checkValidity())
      return

    const prefKeys = ['siBytes', 'uploadAge']
    for (let i = 0; i < prefKeys.length; i++) {
      const value = form.elements[prefKeys[i]].value
      if (value !== 'default' && value !== fallback[prefKeys[i]])
        localStorage[lsKeys[prefKeys[i]]] = value
      else
        localStorage.removeItem(lsKeys[prefKeys[i]])
    }

    const numKeys = Object.keys(numConfig)
    for (let i = 0; i < numKeys.length; i++) {
      const parsed = parseInt(form.elements[numKeys[i]].value) || 0
      const value = Math.min(Math.max(parsed, numConfig[numKeys[i]].min), numConfig[numKeys[i]].max)
      if (value > 0 && value !== fallback[numKeys[i]])
        localStorage[lsKeys[numKeys[i]]] = value
      else
        localStorage.removeItem(lsKeys[numKeys[i]])
    }

    swal({
      title: 'Woohoo!',
      text: 'Configuration saved into this browser.',
      icon: 'success'
    }).then(function () {
      location.reload()
    })
  })
}

page.getPrettyUploadAge = function (hours) {
  if (hours === 0) {
    return 'Permanent'
  } else if (hours < 1) {
    const minutes = hours * 60
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  } else if (hours >= 24) {
    const days = hours / 24
    return `${days} day${days === 1 ? '' : 's'}`
  } else {
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
}

// Handle image paste event
window.addEventListener('paste', function (event) {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items
  const index = Object.keys(items)
  for (let i = 0; i < index.length; i++) {
    const item = items[index[i]]
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

  document.querySelector('#createAlbum').addEventListener('click', function () {
    page.createAlbum()
  })
}
