/* global swal, axios, Dropzone, ClipboardJS, LazyLoad */

const lsKeys = {
  token: 'token',
  chunkSize: 'chunkSize',
  parallelUploads: 'parallelUploads',
  uploadsHistoryOrder: 'uploadsHistoryOrder',
  previewImages: 'previewImages',
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
  previewImages: null,
  fileLength: null,
  uploadAge: null,

  maxSizeBytes: null,
  urlMaxSize: null,
  urlMaxSizeBytes: null,

  tabs: [],
  activeTab: null,
  albumSelect: null,
  previewTemplate: null,

  dropzone: null,
  clipboardJS: null,
  lazyLoad: null,

  // Include BMP for uploads preview only, cause the real images will be used
  // Sharp isn't capable of making their thumbnails for dashboard and album public pages
  imageExts: ['.webp', '.jpg', '.jpeg', '.bmp', '.gif', '.png', '.tiff', '.tif', '.svg'],
  videoExts: ['.webm', '.mp4', '.wmv', '.avi', '.mov', '.mkv'],

  albumTitleMaxLength: 280,
  albumDescMaxLength: 4000
}

// Error handler for all API requests on init
page.onInitError = error => {
  console.error(error)

  // Hide these elements
  document.querySelector('#albumDiv').classList.add('is-hidden')
  document.querySelector('#tabs').classList.add('is-hidden')
  document.querySelectorAll('.tab-content').forEach(element => {
    return element.classList.add('is-hidden')
  })

  // Update upload button
  const uploadButton = document.querySelector('#loginToUpload')
  uploadButton.innerText = 'An error occurred. Try to reload?'
  uploadButton.classList.remove('is-loading')
  uploadButton.classList.remove('is-hidden')

  uploadButton.addEventListener('click', () => {
    location.reload()
  })

  // Defer to the other handler if not API errors
  if (!error.response)
    return page.onUnexpectedError(error, true)

  // Better error messages for Cloudflare errors
  const cloudflareErrors = {
    520: 'Unknown Error',
    521: 'Web Server Is Down',
    522: 'Connection Timed Out',
    523: 'Origin Is Unreachable',
    524: 'A Timeout Occurred',
    525: 'SSL Handshake Failed',
    526: 'Invalid SSL Certificate',
    527: 'Railgun Error',
    530: 'Origin DNS Error'
  }
  const statusText = cloudflareErrors[error.response.status] || error.response.statusText
  const description = error.response.data && error.response.data.description
    ? error.response.data.description
    : 'Please check the console for more information.'
  return swal(`${error.response.status} ${statusText}`, description, 'error')
}

// Error handler for all other unexpected errors
page.onUnexpectedError = (error, skipLog) => {
  if (!skipLog) console.error(error)

  if (error.response)
    return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')

  const content = document.createElement('div')
  content.innerHTML = `<code>${error.toString()}</code>`
  return swal({
    title: 'An error occurred!',
    icon: 'error',
    content
  })
}

page.checkIfPublic = onFailure => {
  let renderShown = false
  return axios.get('api/check', {
    onDownloadProgress: () => {
      // Only show render after this request has been initiated
      if (!renderShown && typeof page.doRender === 'function') {
        page.doRender()
        renderShown = true
      }
    }
  }).then(response => {
    page.private = response.data.private
    page.enableUserAccounts = response.data.enableUserAccounts
    page.maxSize = parseInt(response.data.maxSize)
    page.maxSizeBytes = page.maxSize * 1e6
    page.chunkSize = parseInt(response.data.chunkSize)
    page.temporaryUploadAges = response.data.temporaryUploadAges
    page.fileIdentifierLength = response.data.fileIdentifierLength
    return page.preparePage(onFailure)
  }).catch(page.onInitError)
}

page.preparePage = () => {
  if (page.private)
    if (page.token) {
      return page.verifyToken(page.token, true)
    } else {
      const button = document.querySelector('#loginToUpload')
      button.href = 'auth'
      button.classList.remove('is-loading')
      if (page.enableUserAccounts)
        button.innerText = 'Anonymous upload is disabled. Log in to upload.'
      else
        button.innerText = 'Running in private mode. Log in to upload.'
    }
  else
    return page.prepareUpload()
}

page.verifyToken = (token, reloadOnError) => {
  return axios.post('api/tokens/verify', { token }).then(response => {
    if (response.data.success === false)
      return swal({
        title: 'An error occurred!',
        text: response.data.description,
        icon: 'error'
      }).then(() => {
        if (!reloadOnError) return
        localStorage.removeItem('token')
        location.reload()
      })

    localStorage.token = token
    page.token = token
    return page.prepareUpload()
  }).catch(page.onInitError)
}

page.prepareUpload = () => {
  // I think this fits best here because we need to check for a valid token before we can get the albums
  if (page.token) {
    // Display the album selection
    document.querySelector('#albumDiv').classList.remove('is-hidden')

    page.albumSelect = document.querySelector('#albumSelect')
    page.albumSelect.addEventListener('change', () => {
      page.album = parseInt(page.albumSelect.value)
      // Re-generate ShareX config file
      if (typeof page.prepareShareX === 'function')
        page.prepareShareX()
    })

    // Fetch albums
    page.fetchAlbums()
  }

  // Prepare & generate config tab
  page.prepareUploadConfig()

  // Update elements wherever applicable
  document.querySelector('#maxSize > span').innerHTML = page.getPrettyBytes(page.maxSizeBytes)
  document.querySelector('#loginToUpload').classList.add('is-hidden')

  if (!page.token && page.enableUserAccounts)
    document.querySelector('#loginLinkText').innerHTML = 'Create an account and keep track of your uploads'

  // Prepare & generate files upload tab
  page.prepareDropzone()

  // Generate ShareX config file
  if (typeof page.prepareShareX === 'function')
    page.prepareShareX()

  // Prepare urls upload tab
  const urlMaxSize = document.querySelector('#urlMaxSize')
  if (urlMaxSize) {
    page.urlMaxSize = parseInt(urlMaxSize.innerHTML)
    page.urlMaxSizeBytes = page.urlMaxSize * 1e6
    urlMaxSize.innerHTML = page.getPrettyBytes(page.urlMaxSizeBytes)
    document.querySelector('#uploadUrls').addEventListener('click', event => {
      page.uploadUrls(event.currentTarget)
    })
  }

  // Get all tabs
  const tabsContainer = document.querySelector('#tabs')
  const tabs = tabsContainer.querySelectorAll('li')
  for (let i = 0; i < tabs.length; i++) {
    const id = tabs[i].dataset.id
    const tabContent = document.querySelector(`#${id}`)
    if (!tabContent) continue

    tabs[i].addEventListener('click', () => {
      page.setActiveTab(i)
    })
    page.tabs.push({ tab: tabs[i], content: tabContent })
  }

  // Set first valid tab as the default active tab
  if (page.tabs.length) {
    page.setActiveTab(0)
    tabsContainer.classList.remove('is-hidden')
  }
}

page.setActiveTab = index => {
  for (let i = 0; i < page.tabs.length; i++)
    if (i === index) {
      page.tabs[i].tab.classList.add('is-active')
      page.tabs[i].content.classList.remove('is-hidden')
      page.activeTab = index
    } else {
      page.tabs[i].tab.classList.remove('is-active')
      page.tabs[i].content.classList.add('is-hidden')
    }
}

page.fetchAlbums = () => {
  return axios.get('api/albums', { headers: { token: page.token } }).then(response => {
    if (response.data.success === false)
      return swal('An error occurred!', response.data.description, 'error')

    // Create an option for each album
    if (Array.isArray(response.data.albums) && response.data.albums.length)
      for (let i = 0; i < response.data.albums.length; i++) {
        const album = response.data.albums[i]
        const option = document.createElement('option')
        option.value = album.id
        option.innerHTML = album.name
        page.albumSelect.appendChild(option)
      }
  }).catch(page.onInitError)
}

page.prepareDropzone = () => {
  // Parse template element
  const previewNode = document.querySelector('#tpl')
  page.previewTemplate = previewNode.innerHTML
  previewNode.parentNode.removeChild(previewNode)

  // Generate files upload tab
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
      }, { headers: { token: page.token } }).catch(error => {
        // Format error for display purpose
        return error.response.data ? error.response : {
          data: {
            success: false,
            description: error.toString()
          }
        }
      }).then(response => {
        file.previewElement.querySelector('.progress').classList.add('is-hidden')

        if (response.data.success === false)
          file.previewElement.querySelector('.error').innerHTML = response.data.description

        if (response.data.files && response.data.files[0])
          page.updateTemplate(file, response.data.files[0])

        return done()
      })
    }
  })

  page.dropzone.on('addedfile', file => {
    // Set active tab to file uploads, if necessary
    if (page.activeTab !== 0)
      page.setActiveTab(0)
    // Add file entry
    tabDiv.querySelector('.uploads').classList.remove('is-hidden')
    file.previewElement.querySelector('.name').innerHTML = file.name
  })

  page.dropzone.on('sending', (file, xhr) => {
    if (file.upload.chunked) return
    // Add headers if not uploading chunks
    if (page.album !== null) xhr.setRequestHeader('albumid', page.album)
    if (page.fileLength !== null) xhr.setRequestHeader('filelength', page.fileLength)
    if (page.uploadAge !== null) xhr.setRequestHeader('age', page.uploadAge)
  })

  // Update the total progress bar
  page.dropzone.on('uploadprogress', (file, progress) => {
    // For some reason, chunked uploads fire 100% progress event
    // for each chunk's successful uploads
    if (file.upload.chunked && progress === 100) return
    file.previewElement.querySelector('.progress').setAttribute('value', progress)
    file.previewElement.querySelector('.progress').innerHTML = `${progress}%`
  })

  page.dropzone.on('success', (file, response) => {
    if (!response) return
    file.previewElement.querySelector('.progress').classList.add('is-hidden')

    if (response.success === false)
      file.previewElement.querySelector('.error').innerHTML = response.description

    if (response.files && response.files[0])
      page.updateTemplate(file, response.files[0])
  })

  page.dropzone.on('error', (file, error) => {
    // Clean up file size errors
    if ((typeof error === 'string' && /^File is too big/.test(error)) ||
      (typeof error === 'object' && /File too large/.test(error.description)))
      error = `File too large (${page.getPrettyBytes(file.size)}).`

    page.updateTemplateIcon(file.previewElement, 'icon-block')
    file.previewElement.querySelector('.progress').classList.add('is-hidden')
    file.previewElement.querySelector('.name').innerHTML = file.name
    file.previewElement.querySelector('.error').innerHTML = error.description || error
  })
}

page.uploadUrls = button => {
  const tabDiv = document.querySelector('#tab-urls')
  if (!tabDiv || button.classList.contains('is-loading'))
    return

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
      .filter(url => {
        return url.trim().length
      })
    document.querySelector('#urls').value = urls.join('\n')

    if (!urls.length)
      return done('You have not entered any URLs.')

    tabDiv.querySelector('.uploads').classList.remove('is-hidden')
    const files = urls.map(url => {
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
        files[i].previewElement.querySelector('.progress').classList.add('is-hidden')
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

      return axios.post('api/upload', { urls: [files[i].url] }, { headers }).then(response => {
        return posted(response.data)
      }).catch(error => {
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

page.updateTemplateIcon = (templateElement, iconClass) => {
  const iconElement = templateElement.querySelector('.icon')
  if (!iconElement) return
  iconElement.classList.add(iconClass)
  iconElement.classList.remove('is-hidden')
}

page.updateTemplate = (file, response) => {
  if (!response.url) return

  const a = file.previewElement.querySelector('.link > a')
  const clipboard = file.previewElement.querySelector('.clipboard-mobile > .clipboard-js')
  a.href = a.innerHTML = clipboard.dataset.clipboardText = response.url
  clipboard.parentElement.classList.remove('is-hidden')

  const exec = /.[\w]+(\?|$)/.exec(response.url)
  const extname = exec && exec[0]
    ? exec[0].toLowerCase()
    : null

  if (page.imageExts.includes(extname))
    if (page.previewImages) {
      const img = file.previewElement.querySelector('img')
      img.setAttribute('alt', response.name || '')
      img.dataset.src = response.url
      img.classList.remove('is-hidden')
      img.onerror = event => {
        // Hide image elements that fail to load
        // Consequently include WEBP in browsers that do not have WEBP support (e.i. IE)
        event.currentTarget.classList.add('is-hidden')
        page.updateTemplateIcon(file.previewElement, 'icon-picture')
      }
      page.lazyLoad.update(file.previewElement.querySelectorAll('img'))
    } else {
      page.updateTemplateIcon(file.previewElement, 'icon-picture')
    }
  else if (page.videoExts.includes(extname))
    page.updateTemplateIcon(file.previewElement, 'icon-video')
  else
    page.updateTemplateIcon(file.previewElement, 'icon-doc-inv')

  if (response.expirydate) {
    const expiryDate = file.previewElement.querySelector('.expiry-date')
    expiryDate.innerHTML = `EXP: ${page.getPrettyDate(new Date(response.expirydate * 1000))}`
    expiryDate.classList.remove('is-hidden')
  }
}

page.createAlbum = () => {
  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <div class="controls">
        <input id="swalName" class="input" type="text" placeholder="Name" maxlength="${page.albumTitleMaxLength}">
      </div>
      <p class="help">Max length is ${page.albumTitleMaxLength} characters.</p>
    </div>
    <div class="field">
      <div class="control">
        <textarea id="swalDescription" class="textarea" placeholder="Description" rows="2" maxlength="${page.albumDescMaxLength}"></textarea>
      </div>
      <p class="help">Max length is ${page.albumDescMaxLength} characters.</p>
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
  }).then(value => {
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
    }).then(response => {
      if (response.data.success === false)
        return swal('An error occurred!', response.data.description, 'error')

      const option = document.createElement('option')
      page.albumSelect.appendChild(option)
      option.value = response.data.id
      option.innerHTML = name
      option.selected = true

      swal('Woohoo!', 'Album was created successfully.', 'success')
    }).catch(page.onUnexpectedError)
  })
}

page.prepareUploadConfig = () => {
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
    parallelUploads: { min: 1, max: 8 }
  }

  document.querySelector('#chunkSizeDiv .help').innerHTML =
    `Default is ${fallback.chunkSize} MB. Max is ${numConfig.chunkSize.max} MB.`
  document.querySelector('#parallelUploadsDiv .help').innerHTML =
    `Default is ${fallback.parallelUploads}. Max is ${numConfig.parallelUploads.max}.`

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

    fileLengthDiv.classList.remove('is-hidden')
    fileLengthDiv.querySelector('.help').innerHTML = helpText
  }

  Object.keys(numConfig).forEach(key => {
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
    uploadAgeDiv.classList.remove('is-hidden')
  }

  const tabContent = document.querySelector('#tab-config')
  const form = tabContent.querySelector('form')
  form.addEventListener('submit', event => {
    event.preventDefault()
  })

  const siBytes = localStorage[lsKeys.siBytes] !== '0'
  if (!siBytes) document.querySelector('#siBytes').value = '0'

  const olderOnTop = localStorage[lsKeys.uploadsHistoryOrder] !== '0'
  if (!olderOnTop) {
    document.querySelector('#uploadsHistoryOrder').value = '0'
    const uploadFields = document.querySelectorAll('.tab-content > .uploads')
    for (let i = 0; i < uploadFields.length; i++)
      uploadFields[i].classList.add('is-reversed')
  }

  page.previewImages = localStorage[lsKeys.previewImages] !== '0'

  document.querySelector('#saveConfig').addEventListener('click', () => {
    if (!form.checkValidity())
      return

    const prefKeys = ['siBytes', 'uploadsHistoryOrder', 'previewImages', 'uploadAge']
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
    }).then(() => {
      location.reload()
    })
  })
}

page.getPrettyUploadAge = hours => {
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
window.addEventListener('paste', event => {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items
  const index = Object.keys(items)
  for (let i = 0; i < index.length; i++) {
    const item = items[index[i]]
    if (item.kind === 'file') {
      const blob = item.getAsFile()
      const file = new File([blob], `pasted-image.${blob.type.match(/(?:[^/]*\/)([^;]*)/)[1]}`, {
        type: blob.type
      })
      page.dropzone.addFile(file)
    }
  }
})

window.onload = () => {
  page.checkIfPublic()

  page.clipboardJS = new ClipboardJS('.clipboard-js')

  page.clipboardJS.on('success', () => {
    return swal('Copied!', 'The link has been copied to clipboard.', 'success')
  })

  page.clipboardJS.on('error', page.onUnexpectedError)

  page.lazyLoad = new LazyLoad({
    elements_selector: '.field.uploads img'
  })

  document.querySelector('#createAlbum').addEventListener('click', () => {
    page.createAlbum()
  })
}
