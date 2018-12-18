/* global page */

page.prepareShareX = function () {
  if (!page.token) return
  const origin = (location.hostname + location.pathname).replace(/\/(dashboard)?$/, '')
  const originClean = origin.replace(/\//g, '_')
  const sharexElement = document.getElementById('ShareX')
  const sharexFile = `{
  "Name": "${originClean}",
  "DestinationType": "ImageUploader, FileUploader",
  "RequestType": "POST",
  "RequestURL": "${location.protocol}//${origin}/api/upload",
  "FileFormName": "files[]",
  "Headers": {
    "token": "${page.token}"
  },
  "ResponseType": "Text",
  "URL": "$json:files[0].url$",
  "ThumbnailURL": "$json:files[0].url$"
}\n`
  const sharexBlob = new Blob([sharexFile], { type: 'application/octet-binary' })
  sharexElement.setAttribute('href', URL.createObjectURL(sharexBlob))
  sharexElement.setAttribute('download', `${originClean}.sxcu`)
}
