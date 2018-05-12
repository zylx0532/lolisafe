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
  lazyLoad: null
}

const imageExtensions = ['.webp', '.jpg', '.jpeg', '.bmp', '.gif', '.png']

page.checkIfPublic = async () => {
  const response = await axios.get('api/check')
    .catch(error => {
      console.log(error)
      const button = document.getElementById('loginToUpload')
      button.classList.remove('is-loading')
      button.innerText = 'Error occurred. Reload the page?'
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  page.private = response.data.private
  page.enableUserAccounts = response.data.enableUserAccounts
  page.maxFileSize = response.data.maxFileSize
  page.chunkSize = response.data.chunkSize
  page.preparePage()
}

page.preparePage = () => {
  if (page.private) {
    if (page.token) {
      return page.verifyToken(page.token, true)
    } else {
      const button = document.getElementById('loginToUpload')
      button.href = 'auth'
      button.classList.remove('is-loading')

      if (page.enableUserAccounts) {
        button.innerText = 'Anonymous upload is disabled. Log in to page.'
      } else {
        button.innerText = 'Running in private mode. Log in to page.'
      }
    }
  } else {
    return page.prepareUpload()
  }
}

page.verifyToken = async (token, reloadOnError) => {
  if (reloadOnError === undefined) { reloadOnError = false }

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
      location.reload()
    }
    return
  }

  localStorage.token = token
  page.token = token
  return page.prepareUpload()
}

page.prepareUpload = () => {
  // I think this fits best here because we need to check for a valid token before we can get the albums
  if (page.token) {
    page.albumSelect = document.getElementById('albumSelect')

    page.albumSelect.addEventListener('change', () => {
      page.album = parseInt(page.albumSelect.value)
    })

    page.prepareAlbums()

    // Display the album selection
    document.getElementById('albumDiv').style.display = 'flex'
  }

  document.getElementById('maxFileSize').innerHTML = `Maximum upload size per file is ${page.maxFileSize}`
  document.getElementById('loginToUpload').style.display = 'none'

  if (!page.token && page.enableUserAccounts) {
    document.getElementById('loginLinkText').innerHTML = 'Create an account and keep track of your uploads'
  }

  const previewNode = document.querySelector('#tpl')
  page.previewTemplate = previewNode.innerHTML
  previewNode.parentNode.removeChild(previewNode)

  page.prepareDropzone()

  const tabs = document.getElementById('tabs')
  if (tabs) {
    tabs.style.display = 'flex'
    const items = tabs.getElementsByTagName('li')
    for (const item of items) {
      item.addEventListener('click', function () {
        page.setActiveTab(this.dataset.id)
      })
    }
    document.getElementById('uploadUrls').addEventListener('click', function () {
      page.uploadUrls(this)
    })
    page.setActiveTab('tab-files')
  } else {
    document.getElementById('tab-files').style.display = 'block'
  }
}

page.prepareAlbums = async () => {
  const option = document.createElement('option')
  option.value = ''
  option.innerHTML = 'Upload to album'
  option.disabled = true
  option.selected = true
  page.albumSelect.appendChild(option)

  const response = await axios.get('api/albums', { headers: { token: page.token } })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  if (response.data.success === false) {
    return swal('An error occurred!', response.data.description, 'error')
  }

  const albums = response.data.albums

  // If the user doesn't have any albums we don't really need to display
  // an album selection
  if (albums.length === 0) { return }

  // Loop through the albums and create an option for each album
  for (const album of albums) {
    const option = document.createElement('option')
    option.value = album.id
    option.innerHTML = album.name
    page.albumSelect.appendChild(option)
  }
}

page.setActiveTab = activeId => {
  const items = document.getElementById('tabs').getElementsByTagName('li')
  for (const item of items) {
    const tabId = item.dataset.id
    if (tabId === activeId) {
      item.classList.add('is-active')
      document.getElementById(tabId).style.display = 'block'
    } else {
      item.classList.remove('is-active')
      document.getElementById(tabId).style.display = 'none'
    }
  }
}

page.prepareDropzone = () => {
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
  tabDiv.getElementsByClassName('dz-container')[0].appendChild(div)

  const previewsContainer = tabDiv.getElementsByClassName('uploads')[0]
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
    chunksUploaded: async (file, done) => {
      file.previewElement.querySelector('.progress').setAttribute('value', 100)
      file.previewElement.querySelector('.progress').innerHTML = '100%'

      // The API supports an array of multiple files
      const response = await axios.post('api/upload/finishchunks',
        {
          files: [{
            uuid: file.upload.uuid,
            original: file.name,
            size: file.size,
            type: file.type,
            count: file.upload.totalChunkCount,
            albumid: page.album
          }]
        },
        { headers: { token: page.token } })
        .then(response => response.data)
        .catch(error => {
          return {
            success: false,
            description: error.toString()
          }
        })

      file.previewElement.querySelector('.progress').style.display = 'none'

      if (response.success === false) {
        file.previewElement.querySelector('.error').innerHTML = response.description
      }

      if (response.files && response.files[0]) {
        page.updateTemplate(file, response.files[0])
      }
      return done()
    }
  })

  page.dropzone.on('addedfile', file => {
    tabDiv.getElementsByClassName('uploads')[0].style.display = 'block'
    file.previewElement.querySelector('.name').innerHTML = file.name
  })

  // Add the selected albumid, if an album is selected, as a header
  page.dropzone.on('sending', (file, xhr, formData) => {
    if (file.upload.chunked) { return }
    if (page.album) { xhr.setRequestHeader('albumid', page.album) }
  })

  // Update the total progress bar
  page.dropzone.on('uploadprogress', (file, progress, bytesSent) => {
    if (file.upload.chunked && progress === 100) { return }
    file.previewElement.querySelector('.progress').setAttribute('value', progress)
    file.previewElement.querySelector('.progress').innerHTML = `${progress}%`
  })

  page.dropzone.on('success', (file, response) => {
    if (!response) { return }
    file.previewElement.querySelector('.progress').style.display = 'none'
    // file.previewElement.querySelector('.name').innerHTML = file.name

    if (response.success === false) {
      file.previewElement.querySelector('.error').innerHTML = response.description
    }

    if (response.files && response.files[0]) {
      page.updateTemplate(file, response.files[0])
    }
  })

  page.dropzone.on('error', (file, error) => {
    file.previewElement.querySelector('.progress').style.display = 'none'
    file.previewElement.querySelector('.name').innerHTML = file.name
    file.previewElement.querySelector('.error').innerHTML = error
  })

  page.prepareShareX()
}

page.uploadUrls = async button => {
  const tabDiv = document.getElementById('tab-urls')
  if (!tabDiv) { return }

  if (button.classList.contains('is-loading')) { return }
  button.classList.add('is-loading')

  await new Promise(async (resolve, reject) => {
    const albumid = page.album
    const previewsContainer = tabDiv.getElementsByClassName('uploads')[0]
    const urls = document.getElementById('urls').value
      .split(/\r?\n/)
      .filter(url => url.trim().length)
    document.getElementById('urls').value = urls.join('\n')

    if (!urls.length) {
      // eslint-disable-next-line prefer-promise-reject-errors
      return reject('You have not entered any URLs.')
    }

    tabDiv.getElementsByClassName('uploads')[0].style.display = 'block'
    const files = urls.map(url => {
      const previewTemplate = document.createElement('template')
      previewTemplate.innerHTML = page.previewTemplate.trim()
      const previewElement = previewTemplate.content.firstChild
      previewElement.querySelector('.name').innerHTML = url
      previewsContainer.appendChild(previewElement)
      return {
        url,
        previewElement
      }
    })

    const post = async i => {
      if (i === files.length) { return resolve() }
      const file = files[i]
      const response = await axios.post('api/upload',
        {
          urls: [file.url]
        },
        {
          headers: {
            token: page.token,
            albumid
          }
        })
        .then(response => response.data)
        .catch(error => {
          return {
            success: false,
            description: error.toString()
          }
        })

      file.previewElement.querySelector('.progress').style.display = 'none'
      if (response.success) {
        page.updateTemplate(file, response.files[0])
      } else {
        file.previewElement.querySelector('.error').innerHTML = response.description
      }
      post(i + 1)
    }
    post(0)
  }).catch(error => {
    swal('An error occurred!', error.toString(), 'error')
  })

  button.classList.remove('is-loading')
}

page.updateTemplate = (file, response) => {
  if (!response.url) { return }

  const a = file.previewElement.querySelector('.link > a')
  const clipboard = file.previewElement.querySelector('.clipboard-mobile > .clipboard-js')
  a.href = a.innerHTML = clipboard.dataset['clipboardText'] = response.url
  clipboard.parentElement.style.display = 'block'

  const exec = /.[\w]+(\?|$)/.exec(response.url)
  if (exec && exec[0] && imageExtensions.includes(exec[0].toLowerCase())) {
    const img = file.previewElement.querySelector('img')
    img.setAttribute('alt', response.name || '')
    img.dataset['src'] = response.url
    img.onerror = function () { this.style.display = 'none' } // hide webp in firefox and ie
    page.lazyLoad.update(file.previewElement.querySelectorAll('img'))
  }
}

page.prepareShareX = () => {
  if (page.token) {
    const sharexElement = document.getElementById('ShareX')
    const sharexFile =
      '{\r\n' +
      `  "Name": "${location.hostname}",\r\n` +
      '  "DestinationType": "ImageUploader, FileUploader",\r\n' +
      '  "RequestType": "POST",\r\n' +
      `  "RequestURL": "${location.origin}/api/upload",\r\n` +
      '  "FileFormName": "files[]",\r\n' +
      '  "Headers": {\r\n' +
      `    "token": "${page.token}"\r\n` +
      '  },\r\n' +
      '  "ResponseType": "Text",\r\n' +
      '  "URL": "$json:files[0].url$",\r\n' +
      '  "ThumbnailURL": "$json:files[0].url$"\r\n' +
      '}'
    const sharexBlob = new Blob([sharexFile], { type: 'application/octet-binary' })
    sharexElement.setAttribute('href', URL.createObjectURL(sharexBlob))
    sharexElement.setAttribute('download', `${location.hostname}.sxcu`)
  }
}

page.createAlbum = async () => {
  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <label class="label">Album name</label>
      <div class="controls">
        <input id="_name" class="input" type="text" placeholder="My super album">
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="_download" type="checkbox" checked>
          Enable download
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="_public" type="checkbox" checked>
          Enable public link
        </label>
      </div>
    </div>
  `
  const value = await swal({
    title: 'Create new album',
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

  const name = document.getElementById('_name').value
  const response = await axios.post('api/albums', {
    name,
    download: document.getElementById('_download').checked,
    public: document.getElementById('_public').checked
  }, { headers: { token: page.token } })
    .catch(error => {
      console.log(error)
      return swal('An error occurred!', 'There was an error with the request, please check the console for more information.', 'error')
    })
  if (!response) { return }

  if (response.data.success === false) {
    return swal('An error occurred!', response.data.description, 'error')
  }

  const option = document.createElement('option')
  option.value = response.data.id
  option.innerHTML = name
  page.albumSelect.appendChild(option)

  swal('Woohoo!', 'Album was created successfully', 'success')
}

// Handle image paste event
window.addEventListener('paste', event => {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items
  for (const index in items) {
    const item = items[index]
    if (item.kind === 'file') {
      const blob = item.getAsFile()
      console.log(blob.type)
      const file = new File([blob], `pasted-image.${blob.type.match(/(?:[^/]*\/)([^;]*)/)[1]}`)
      file.type = blob.type
      console.log(file)
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

  page.clipboardJS.on('error', event => {
    console.error(event)
    return swal('An error occurred!', 'There was an error when trying to copy the link to clipboard, please check the console for more information.', 'error')
  })

  page.lazyLoad = new LazyLoad()
}
