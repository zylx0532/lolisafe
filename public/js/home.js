/* eslint-disable no-unused-expressions */
/* global swal, axios, Dropzone, ClipboardJS */

const upload = {
  isPrivate: true,
  token: localStorage.token,
  maxFileSize: undefined,
  chunkedUploads: undefined,
  // Add the album let to the upload so we can store the album id in there
  album: undefined,
  dropzone: undefined,
  clipboardJS: undefined
}

const imageExtensions = ['.webp', '.jpg', '.jpeg', '.bmp', '.gif', '.png']

upload.checkIfPublic = () => {
  axios.get('api/check')
    .then(response => {
      upload.isPrivate = response.data.private
      upload.maxFileSize = response.data.maxFileSize
      upload.chunkedUploads = response.data.chunkedUploads
      upload.preparePage()
    })
    .catch(error => {
      console.log(error)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

upload.preparePage = () => {
  if (upload.isPrivate) {
    if (upload.token) {
      return upload.verifyToken(upload.token, true)
    } else {
      const button = document.getElementById('loginToUpload')
      button.href = 'auth'
      button.innerText = 'Running in private mode. Log in to upload.'
      button.className = button.className.replace(' is-loading', '')
    }
  } else {
    return upload.prepareUpload()
  }
}

upload.verifyToken = (token, reloadOnError) => {
  if (reloadOnError === undefined) { reloadOnError = false }

  axios.post('api/tokens/verify', { token: token })
    .then(response => {
      if (response.data.success === false) {
        swal({
          title: 'An error occurred',
          text: response.data.description,
          icon: 'error'
        }).then(() => {
          if (reloadOnError) {
            localStorage.removeItem('token')
            location.reload()
          }
        })
        return
      }

      localStorage.token = token
      upload.token = token
      return upload.prepareUpload()
    })
    .catch(error => {
      console.log(error)
      return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
    })
}

upload.prepareUpload = () => {
  // I think this fits best here because we need to check for a valid token before we can get the albums
  if (upload.token) {
    const select = document.getElementById('albumSelect')

    select.addEventListener('change', () => {
      upload.album = select.value
    })

    axios.get('api/albums', { headers: { token: upload.token } })
      .then(res => {
        const albums = res.data.albums

        // If the user doesn't have any albums we don't really need to display
        // an album selection
        if (albums.length === 0) { return }

        // Loop through the albums and create an option for each album
        for (let i = 0; i < albums.length; i++) {
          const opt = document.createElement('option')
          opt.value = albums[i].id
          opt.innerHTML = albums[i].name
          select.appendChild(opt)
        }
        // Display the album selection
        document.getElementById('albumDiv').style.display = 'block'
      })
      .catch(e => {
        console.log(e)
        return swal('An error occurred', 'There was an error with the request, please check the console for more information.', 'error')
      })
  }

  const div = document.createElement('div')
  div.id = 'dropzone'
  div.className = 'button'
  div.innerHTML = `
    <span class="icon">
      <i class="icon-upload-cloud"></i>
    </span>
    <span>Click here or drag and drop files</span>
  `
  div.style.display = 'flex'

  document.getElementById('maxFileSize').innerHTML = `Maximum upload size per file is ${upload.maxFileSize}`
  document.getElementById('loginToUpload').style.display = 'none'

  if (upload.token === undefined) {
    document.getElementById('loginLinkText').innerHTML = 'Create an account and keep track of your uploads'
  }

  document.getElementById('uploadContainer').appendChild(div)

  upload.prepareDropzone()
}

upload.prepareDropzone = () => {
  const previewNode = document.querySelector('#template')
  previewNode.id = ''
  const previewTemplate = previewNode.parentNode.innerHTML
  previewNode.parentNode.removeChild(previewNode)

  upload.dropzone = new Dropzone('div#dropzone', {
    url: 'api/upload',
    paramName: 'files[]',
    maxFilesize: parseInt(upload.maxFileSize),
    parallelUploads: 2,
    uploadMultiple: false,
    previewsContainer: 'div#uploads',
    previewTemplate,
    createImageThumbnails: false,
    maxFiles: 1000,
    autoProcessQueue: true,
    headers: { token: upload.token },
    chunking: upload.chunkedUploads.enabled,
    chunkSize: parseInt(upload.chunkedUploads.maxSize) * 1000000, // 1000000 B = 1 MB,
    parallelChunkUploads: false, // when set to true, sometimes it often hangs with hundreds of parallel uploads
    chunksUploaded: async (file, done) => {
      file.previewElement.querySelector('.progress').setAttribute('value', 100)
      file.previewElement.querySelector('.progress').innerHTML = `100%`

      // The API supports an array of multiple files
      const response = await axios.post(
        'api/upload/finishchunks',
        {
          files: [
            {
              uuid: file.upload.uuid,
              original: file.name,
              size: file.size,
              type: file.type,
              count: file.upload.totalChunkCount
            }
          ]
        },
        {
          headers: { token: upload.token }
        })
        .then(response => response.data)
        .catch(error => {
          return {
            success: false,
            description: error.toString()
          }
        })

      file.previewTemplate.querySelector('.progress').style.display = 'none'

      if (response.success === false) {
        file.previewTemplate.querySelector('.error').innerHTML = response.description
        return done()
      }

      upload.appendLink(file, response.files[0].url)
      upload.showThumbnail(file, response.files[0].url)
      return done()
    }
  })

  upload.dropzone.on('addedfile', file => {
    document.getElementById('uploads').style.display = 'block'
  })

  // Add the selected albumid, if an album is selected, as a header
  upload.dropzone.on('sending', (file, xhr, formData) => {
    if (upload.album) { xhr.setRequestHeader('albumid', upload.album) }
  })

  // Update the total progress bar
  upload.dropzone.on('uploadprogress', (file, progress, bytesSent) => {
    if (file.upload.chunked && progress === 100) { return }
    file.previewElement.querySelector('.progress').setAttribute('value', progress)
    file.previewElement.querySelector('.progress').innerHTML = `${progress}%`
  })

  upload.dropzone.on('success', (file, response) => {
    if (!response) { return }
    file.previewTemplate.querySelector('.progress').style.display = 'none'

    if (response.success === false) {
      file.previewTemplate.querySelector('.error').innerHTML = response.description
      return
    }

    upload.appendLink(file, response.files[0].url)
    upload.showThumbnail(file, response.files[0].url)
  })

  upload.dropzone.on('error', (file, error) => {
    file.previewTemplate.querySelector('.progress').style.display = 'none'
    file.previewTemplate.querySelector('.error').innerHTML = error
  })

  upload.prepareShareX()
}

upload.appendLink = (file, url) => {
  const a = file.previewTemplate.querySelector('.link > a')
  const clipTablet = file.previewTemplate.querySelector('.link > .clipboard-js')
  const clipMobile = file.previewTemplate.querySelector('.clipboard-mobile > .clipboard-js')

  console.log(url)
  a.href = a.innerHTML = clipTablet.dataset['clipboardText'] = clipMobile.dataset['clipboardText'] = url
  a.parentElement.style = ''
}

upload.showThumbnail = (file, url) => {
  const exec = /.[\w]+(\?|$)/.exec(url)
  if (exec && exec[0] && imageExtensions.includes(exec[0].toLowerCase())) {
    upload.dropzone.emit('thumbnail', file, url)
  }
}

upload.prepareShareX = () => {
  if (upload.token) {
    const sharexElement = document.getElementById('ShareX')
    const sharexFile = `{\r\n\
  "Name": "${location.hostname}",\r\n\
  "DestinationType": "ImageUploader, FileUploader",\r\n\
  "RequestType": "POST",\r\n\
  "RequestURL": "${location.origin}/api/upload",\r\n\
  "FileFormName": "files[]",\r\n\
  "Headers": {\r\n\
    "token": "${upload.token}"\r\n\
  },\r\n\
  "ResponseType": "Text",\r\n\
  "URL": "$json:files[0].url$",\r\n\
  "ThumbnailURL": "$json:files[0].url$"\r\n\
}`
    const sharexBlob = new Blob([sharexFile], { type: 'application/octet-binary' })
    sharexElement.setAttribute('href', URL.createObjectURL(sharexBlob))
    sharexElement.setAttribute('download', `${location.hostname}.sxcu`)
  }
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
      upload.dropzone.addFile(file)
    }
  }
})

window.onload = () => {
  upload.checkIfPublic()

  upload.clipboardJS = new ClipboardJS('.clipboard-js')

  upload.clipboardJS.on('success', () => {
    return swal('Copied!', 'The link has been copied to clipboard.', 'success')
  })

  upload.clipboardJS.on('error', event => {
    console.error(event)
    return swal('An error occurred', 'There was an error when trying to copy the link to clipboard, please check the console for more information.', 'error')
  })
}
