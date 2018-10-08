/* global page */

page.prepareShareX = function () {
  if (!page.token) { return }
  var origin = (location.hostname + location.pathname).replace(/\/(dashboard)?$/, '')
  var originClean = origin.replace(/\//g, '_')
  var sharexElement = document.getElementById('ShareX')
  var sharexFile =
      '{\r\n' +
      '  "Name": "' + originClean + '",\r\n' +
      '  "DestinationType": "ImageUploader, FileUploader",\r\n' +
      '  "RequestType": "POST",\r\n' +
      '  "RequestURL": "' + origin + '/api/upload",\r\n' +
      '  "FileFormName": "files[]",\r\n' +
      '  "Headers": {\r\n' +
      '    "token": "' + page.token + '"\r\n' +
      '  },\r\n' +
      '  "ResponseType": "Text",\r\n' +
      '  "URL": "$json:files[0].url$",\r\n' +
      '  "ThumbnailURL": "$json:files[0].url$"\r\n' +
      '}'
  var sharexBlob = new Blob([sharexFile], { type: 'application/octet-binary' })
  sharexElement.setAttribute('href', URL.createObjectURL(sharexBlob))
  sharexElement.setAttribute('download', originClean + '.sxcu')
}
