/* global swal, axios, Dropzone, ClipboardJS, LazyLoad */

const lsKeys = {
  token: 'token',
  chunkSize: 'chunkSize',
  parallelUploads: 'parallelUploads',
  uploadsHistoryOrder: 'uploadsHistoryOrder',
  previewImages: 'previewImages',
  fileLength: 'fileLength',
  uploadAge: 'uploadAge',
  stripTags: 'stripTags'
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
  stripTagsConfig: null,

  // store album id that will be used with upload requests
  album: null,

  parallelUploads: 2,
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

  // additional vars for url uploads
  urlsQueue: [],
  activeUrlsQueue: 0,

  // Include BMP for uploads preview only, cause the real images will be used
  // Sharp isn't capable of making their thumbnails for dashboard and album public pages
  imageExts: ['.webp', '.jpg', '.jpeg', '.bmp', '.gif', '.png', '.tiff', '.tif', '.svg'],
  videoExts: ['.webm', '.mp4', '.wmv', '.avi', '.mov', '.mkv'],

  albumTitleMaxLength: 70,
  albumDescMaxLength: 4000
}

// Handler for errors during initialization
page.onInitError = error => {
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

  if (error.response)
    page.onAxiosError(error)
  else
    page.onError(error)
}

// Handler for regular JS errors
page.onError = error => {
  console.error(error)

  const content = document.createElement('div')
  content.innerHTML = `<code>${error.toString()}</code>`
  return swal({
    title: 'An error occurred!',
    icon: 'error',
    content
  })
}

// Handler for Axios errors
page.onAxiosError = error => {
  console.error(error)

  // Better Cloudflare errors
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
    : 'There was an error with the request, please check the console for more information.'

  return swal(`${error.response.status} ${statusText}`, description, 'error')
}

page.checkIfPublic = () => {
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
    page.stripTagsConfig = response.data.stripTags
    return page.preparePage()
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

    localStorage[lsKeys.token] = token
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
      page.addUrlsToQueue()
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
    <div id="dropzone" class="button is-danger is-outlined is-fullwidth is-unselectable">
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
    chunkSize: page.chunkSize * 1e6, // this option expects Bytes
    parallelChunkUploads: false, // for now, enabling this breaks descriptive upload progress
    timeout: 0,

    init () {
      this.on('addedfile', file => {
        // Set active tab to file uploads, if necessary
        if (page.activeTab !== 0)
          page.setActiveTab(0)

        // Add file entry
        tabDiv.querySelector('.uploads').classList.remove('is-hidden')

        file.previewElement.querySelector('.name').innerHTML = file.name
        file.previewElement.querySelector('.descriptive-progress').innerHTML = 'Waiting in queue\u2026'
      })

      this.on('sending', (file, xhr) => {
        // Add timeout listener (hacky method due to lack of built-in timeout handler)
        if (!xhr.ontimeout)
          xhr.ontimeout = () => {
            const instances = page.dropzone.getUploadingFiles()
              .filter(instance => instance.xhr === xhr)
            page.dropzone._handleUploadError(instances, xhr, 'Connection timed out. Try to reduce upload chunk size.')
          }

        // Add start timestamp of upload attempt
        if (xhr._start === undefined)
          xhr._start = Date.now()

        // If not chunked uploads, add extra headers
        if (!file.upload.chunked) {
          if (page.album !== null) xhr.setRequestHeader('albumid', page.album)
          if (page.fileLength !== null) xhr.setRequestHeader('filelength', page.fileLength)
          if (page.uploadAge !== null) xhr.setRequestHeader('age', page.uploadAge)
          if (page.stripTags !== null) xhr.setRequestHeader('striptags', page.stripTags)
        }

        if (!file.upload.chunked)
          file.previewElement.querySelector('.descriptive-progress').innerHTML = 'Uploading\u2026'
        else if (file.upload.chunks.length === 1)
          file.previewElement.querySelector('.descriptive-progress').innerHTML = `Uploading chunk 1/${file.upload.totalChunkCount}\u2026`
      })

      // Update descriptive progress
      this.on('uploadprogress', (file, progress) => {
        // Total bytes will eventually be bigger than file size when chunked
        const total = Math.max(file.size, file.upload.total)
        const percentage = (file.upload.bytesSent / total * 100).toFixed(0)

        const upl = file.upload.chunked
          ? file.upload.chunks[file.upload.chunks.length - 1]
          : file.upload
        const xhr = upl.xhr || file.xhr

        let prefix = 'Uploading\u2026'
        let skipProgress = false
        if (file.upload.chunked) {
          const done = upl.bytesSent === upl.total
          const last = file.upload.chunks.length === file.upload.totalChunkCount
          let chunkIndex = file.upload.chunks.length
          if (done && !last) {
            chunkIndex++
            skipProgress = true
          }
          prefix = `Uploading chunk ${chunkIndex}/${file.upload.totalChunkCount}\u2026`
        }

        let prettyBytesPerSec
        if (!skipProgress) {
          const elapsed = (Date.now() - xhr._start) / 1000
          const bytesPerSec = elapsed ? (upl.bytesSent / elapsed) : 0
          prettyBytesPerSec = page.getPrettyBytes(bytesPerSec)
        }

        file.previewElement.querySelector('.descriptive-progress').innerHTML =
          `${prefix} ${percentage}%${prettyBytesPerSec ? ` at ~${prettyBytesPerSec}/s` : ''}`
      })

      this.on('success', (file, data) => {
        if (!data) return
        file.previewElement.querySelector('.descriptive-progress').classList.add('is-hidden')

        if (data.success === false) {
          file.previewElement.querySelector('.error').innerHTML = data.description
          file.previewElement.querySelector('.error').classList.remove('is-hidden')
        }

        if (Array.isArray(data.files) && data.files[0])
          page.updateTemplate(file, data.files[0])
      })

      this.on('error', (file, error) => {
        // Clean up file size errors
        if ((typeof error === 'string' && /^File is too big/.test(error)) ||
          (typeof error === 'object' && /File too large/.test(error.description)))
          error = `File too large (${page.getPrettyBytes(file.size)}).`

        page.updateTemplateIcon(file.previewElement, 'icon-block')

        file.previewElement.querySelector('.descriptive-progress').classList.add('is-hidden')

        file.previewElement.querySelector('.error').innerHTML = error.description || error
        file.previewElement.querySelector('.error').classList.remove('is-hidden')
      })
    },

    chunksUploaded (file, done) {
      file.previewElement.querySelector('.descriptive-progress').innerHTML =
        `Rebuilding ${file.upload.totalChunkCount} chunks\u2026`

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
        headers: {
          token: page.token,
          // Unlike the options above (e.g. albumid, filelength, etc.),
          // strip tags can not yet be configured per file with this API
          striptags: page.stripTags
        }
      }).catch(error => {
        // Format error for display purpose
        return error.response.data ? error.response : {
          data: {
            success: false,
            description: error.toString()
          }
        }
      }).then(response => {
        file.previewElement.querySelector('.descriptive-progress').classList.add('is-hidden')

        if (response.data.success === false) {
          file.previewElement.querySelector('.error').innerHTML = response.data.description
          file.previewElement.querySelector('.error').classList.remove('is-hidden')
        }

        if (response.data.files && response.data.files[0])
          page.updateTemplate(file, response.data.files[0])

        return done()
      })
    }
  })
}

page.addUrlsToQueue = () => {
  const urls = document.querySelector('#urls').value
    .split(/\r?\n/)
    .filter(url => {
      return url.trim().length
    })

  if (!urls.length)
    return swal('An error occurred!', 'You have not entered any URLs.', 'error')

  const tabDiv = document.querySelector('#tab-urls')
  tabDiv.querySelector('.uploads').classList.remove('is-hidden')

  for (let i = 0; i < urls.length; i++) {
    const previewTemplate = document.createElement('template')
    previewTemplate.innerHTML = page.previewTemplate.trim()

    const previewElement = previewTemplate.content.firstChild
    previewElement.querySelector('.name').innerHTML = urls[i]
    previewElement.querySelector('.descriptive-progress').innerHTML = 'Waiting in queue\u2026'

    const previewsContainer = tabDiv.querySelector('.uploads')
    previewsContainer.appendChild(previewElement)

    page.urlsQueue.push({
      url: urls[i],
      previewElement
    })
  }

  page.processUrlsQueue()
  document.querySelector('#urls').value = ''
}

page.processUrlsQueue = () => {
  if (!page.urlsQueue.length) return

  function finishedUrlUpload (file, data) {
    file.previewElement.querySelector('.descriptive-progress').classList.add('is-hidden')

    if (data.success === false) {
      const match = data.description.match(/ over limit: (\d+)$/)
      if (match && match[1])
        data.description = `File exceeded limit of ${page.getPrettyBytes(match[1])}.`

      file.previewElement.querySelector('.error').innerHTML = data.description
      file.previewElement.querySelector('.error').classList.remove('is-hidden')
    }

    if (Array.isArray(data.files) && data.files[0])
      page.updateTemplate(file, data.files[0])

    page.activeUrlsQueue--
    return shiftQueue()
  }

  function initUrlUpload (file) {
    file.previewElement.querySelector('.descriptive-progress').innerHTML =
      'Waiting for server to fetch URL\u2026'

    return axios.post('api/upload', {
      urls: [file.url]
    }, {
      headers: {
        token: page.token,
        albumid: page.album,
        age: page.uploadAge,
        filelength: page.fileLength
      }
    }).catch(error => {
      // Format error for display purpose
      return error.response.data ? error.response : {
        data: {
          success: false,
          description: error.toString()
        }
      }
    }).then(response => {
      return finishedUrlUpload(file, response.data)
    })
  }

  function shiftQueue () {
    while (page.urlsQueue.length && (page.activeUrlsQueue < page.parallelUploads)) {
      page.activeUrlsQueue++
      initUrlUpload(page.urlsQueue.shift())
    }
  }

  return shiftQueue()
}

page.updateTemplateIcon = (templateElement, iconClass) => {
  const iconElement = templateElement.querySelector('.icon')
  if (!iconElement) return

  iconElement.classList.add(iconClass)
  iconElement.classList.remove('is-hidden')
}

page.updateTemplate = (file, response) => {
  if (!response.url) return

  const link = file.previewElement.querySelector('.link')
  const a = link.querySelector('a')
  const clipboard = file.previewElement.querySelector('.clipboard-mobile > .clipboard-js')
  a.href = a.innerHTML = clipboard.dataset.clipboardText = response.url

  link.classList.remove('is-hidden')
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
        // Consequently include WEBP in browsers that do not have WEBP support (e.g. IE)
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
    }).catch(page.onError)
  })
}

page.prepareUploadConfig = () => {
  const fallback = {
    chunkSize: page.chunkSize,
    parallelUploads: page.parallelUploads
  }

  const temporaryUploadAges = Array.isArray(page.temporaryUploadAges) && page.temporaryUploadAges.length
  const fileIdentifierLength = page.fileIdentifierLength &&
    typeof page.fileIdentifierLength.min === 'number' &&
    typeof page.fileIdentifierLength.max === 'number'

  const config = {
    siBytes: {
      label: 'File size display',
      select: [
        { value: 'default', text: '1000 B = 1 kB = 1 Kilobyte' },
        { value: '0', text: '1024 B = 1 KiB = 1 Kibibyte' }
      ],
      help: 'This will be used in our homepage, dashboard, and album public pages.',
      valueHandler () {} // Do nothing
    },
    fileLength: {
      display: fileIdentifierLength,
      label: 'File identifier length',
      number: fileIdentifierLength ? {
        min: page.fileIdentifierLength.min,
        max: page.fileIdentifierLength.max,
        round: true
      } : undefined,
      help: true, // true means auto-generated, for number-based configs only
      disabled: fileIdentifierLength && page.fileIdentifierLength.force
    },
    uploadAge: {
      display: temporaryUploadAges,
      label: 'Upload age',
      select: [],
      help: 'Whether to automatically delete your uploads after a certain amount of time.'
    },
    stripTags: {
      display: page.stripTagsConfig,
      label: 'Strip tags',
      select: page.stripTagsConfig ? [
        { value: page.stripTagsConfig.default ? 'default' : '1', text: 'Yes' },
        { value: page.stripTagsConfig.default ? '0' : 'default', text: 'No' }
      ] : null,
      help: `Whether to strip tags (e.g. EXIF) from your uploads.<br>
        This only applies to regular image${page.stripTagsConfig && page.stripTagsConfig.video ? ' and video' : ''} uploads (i.e. not URL uploads).`,
      disabled: page.stripTagsConfig && page.stripTagsConfig.force
    },
    chunkSize: {
      display: !isNaN(page.chunkSize),
      label: 'Upload chunk size (MB)',
      number: {
        min: 1,
        max: 95,
        suffix: ' MB',
        round: true
      },
      help: true
    },
    parallelUploads: {
      label: 'Parallel uploads',
      number: {
        min: 1,
        max: 10,
        round: true
      },
      help: true
    },
    uploadsHistoryOrder: {
      label: 'Uploads history order',
      select: [
        { value: 'default', text: 'Older files on top' },
        { value: '0', text: 'Newer files on top' }
      ],
      help: `"Newer files on top" will use a CSS technique, which unfortunately come with <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/flex-direction#Accessibility_Concerns" target="_blank" rel="noopener">some undesirable side effects</a>.<br>
        This also affects text selection, such as when trying to select text from top to bottom will result in them being selected from bottom to top instead, and vice versa.`,
      valueHandler (value) {
        if (value === '0') {
          const uploadFields = document.querySelectorAll('.tab-content > .uploads')
          for (let i = 0; i < uploadFields.length; i++)
            uploadFields[i].classList.add('is-reversed')
        }
      }
    },
    previewImages: {
      label: 'Load images for preview',
      select: [
        { value: 'default', text: 'Yes' },
        { value: '0', text: 'No' }
      ],
      help: 'By default, uploaded images will be loaded as their previews.',
      valueHandler (value) {
        page.previewImages = value !== '0'
      }
    }
  }

  if (temporaryUploadAges) {
    const stored = parseFloat(localStorage[lsKeys.uploadAge])
    for (let i = 0; i < page.temporaryUploadAges.length; i++) {
      const age = page.temporaryUploadAges[i]
      config.uploadAge.select.push({
        value: i === 0 ? 'default' : String(age),
        text: page.getPrettyUploadAge(age)
      })
      if (age === stored)
        config.uploadAge.value = stored
    }
  }

  if (fileIdentifierLength) {
    fallback.fileLength = page.fileIdentifierLength.default || undefined
    const stored = parseInt(localStorage[lsKeys.fileLength])
    if (!page.fileIdentifierLength.force &&
      !isNaN(stored) &&
      stored >= page.fileIdentifierLength.min &&
      stored <= page.fileIdentifierLength.max)
      config.fileLength.value = stored
  }

  const tabContent = document.querySelector('#tab-config')
  const form = document.createElement('form')
  form.addEventListener('submit', event => event.preventDefault())

  const configKeys = Object.keys(config)
  for (let i = 0; i < configKeys.length; i++) {
    const key = configKeys[i]
    const conf = config[key]

    // Skip only if display attribute is explicitly set to false
    if (conf.display === false)
      continue

    const field = document.createElement('div')
    field.className = 'field'

    let value
    if (!conf.disabled) {
      if (conf.value !== undefined) {
        value = conf.value
      } else if (conf.number !== undefined) {
        const parsed = parseInt(localStorage[lsKeys[key]])
        if (!isNaN(parsed))
          value = parsed
      } else {
        const stored = localStorage[lsKeys[key]]
        if (Array.isArray(conf.select))
          value = conf.select.find(sel => sel.value === stored) ? stored : undefined
        else
          value = stored
      }

      // If valueHandler function exists, defer to the function,
      // otherwise pass value to global page object
      if (typeof conf.valueHandler === 'function')
        conf.valueHandler(value)
      else if (value !== undefined)
        page[key] = value
    }

    let control
    if (Array.isArray(conf.select)) {
      control = document.createElement('div')
      control.className = 'select is-fullwidth'

      const opts = []
      for (let j = 0; j < conf.select.length; j++) {
        const opt = conf.select[j]
        const selected = (value && (opt.value === String(value))) ||
          (value === undefined && opt.value === 'default')
        opts.push(`
          <option value="${opt.value}"${selected ? ' selected' : ''}>
            ${opt.text}${opt.value === 'default' ? ' (default)' : ''}
          </option>
        `)
      }

      control.innerHTML = `
        <select id="${key}">
          ${opts.join('\n')}
        </select>
      `
    } else if (conf.number !== undefined) {
      control = document.createElement('input')
      control.id = control.name = key
      control.className = 'input is-fullwidth'
      control.type = 'number'

      if (conf.number.min !== undefined)
        control.min = conf.number.min
      if (conf.number.max !== undefined)
        control.max = conf.number.max
      if (typeof value === 'number')
        control.value = value
      else if (fallback[key] !== undefined)
        control.value = fallback[key]
    }

    let help
    if (conf.disabled) {
      if (Array.isArray(conf.select))
        control.querySelector('select').disabled = conf.disabled
      else
        control.disabled = conf.disabled
      help = 'This option is currently not configurable.'
    } else if (typeof conf.help === 'string') {
      help = conf.help
    } else if (conf.help === true && conf.number !== undefined) {
      const tmp = []

      if (fallback[key] !== undefined)
        tmp.push(`Default is ${fallback[key]}${conf.number.suffix || ''}.`)
      if (conf.number.min !== undefined)
        tmp.push(`Min is ${conf.number.min}${conf.number.suffix || ''}.`)
      if (conf.number.max !== undefined)
        tmp.push(`Max is ${conf.number.max}${conf.number.suffix || ''}.`)

      help = tmp.join(' ')
    }

    field.innerHTML = `
      <label class="label">${conf.label}</label>
      <div class="control"></div>
      ${help ? `<p class="help">${help}</p>` : ''}
    `
    field.querySelector('div.control').appendChild(control)

    form.appendChild(field)
  }

  const submit = document.createElement('div')
  submit.className = 'field'
  submit.innerHTML = `
    <p class="control">
      <button id="saveConfig" type="submit" class="button is-danger is-outlined is-fullwidth">
        <span class="icon">
          <i class="icon-floppy"></i>
        </span>
        <span>Save & reload</span>
      </button>
    </p>
    <p class="help">
      This configuration will only be used in this browser.<br>
      After reloading the page, some of them will also be applied to the ShareX config that you can download by clicking on the ShareX icon below.
    </p>
  `

  form.appendChild(submit)
  form.querySelector('#saveConfig').addEventListener('click', () => {
    if (!form.checkValidity())
      return

    const keys = Object.keys(config)
      .filter(key => config[key].display !== false && config[key].disabled !== true)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]

      let value
      if (config[key].select !== undefined) {
        if (form.elements[key].value !== 'default')
          value = form.elements[key].value
      } else if (config[key].number !== undefined) {
        const parsed = parseInt(form.elements[key].value)
        if (!isNaN(parsed))
          value = Math.min(Math.max(parsed, config[key].number.min), config[key].number.max)
      }

      if (value !== undefined && value !== fallback[key])
        localStorage[lsKeys[key]] = value
      else
        localStorage.removeItem(lsKeys[key])
    }

    swal({
      title: 'Woohoo!',
      text: 'Configuration saved into this browser.',
      icon: 'success'
    }).then(() => {
      location.reload()
    })
  })

  tabContent.appendChild(form)
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
      /* eslint-disable-next-line compat/compat */
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
    return swal('', 'The link has been copied to clipboard.', 'success', {
      buttons: false,
      timer: 1500
    })
  })

  page.clipboardJS.on('error', page.onError)

  page.lazyLoad = new LazyLoad({
    elements_selector: '.field.uploads img'
  })

  document.querySelector('#createAlbum').addEventListener('click', () => {
    page.createAlbum()
  })
}
