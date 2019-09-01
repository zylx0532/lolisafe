/* global lsKeys, page */

// keys for localStorage
lsKeys.siBytes = 'siBytes'

page.prepareShareX = function () {
  if (!page.token) return
  const origin = (location.hostname + location.pathname).replace(/\/(dashboard)?$/, '')
  const originClean = origin.replace(/\//g, '_')
  const sharexElement = document.querySelector('#ShareX')
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

page.getPrettyBytes = function (num) {
  // MIT License
  // Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)
  if (!Number.isFinite(num)) return num

  const si = localStorage[lsKeys.siBytes] !== '0'
  const neg = num < 0 ? '-' : ''
  const scale = si ? 1000 : 1024
  if (neg) num = -num
  if (num < scale) return `${neg}${num} B`

  const exponent = Math.min(Math.floor(Math.log10(num) / 3), 8) // 8 is count of KMGTPEZY
  const numStr = Number((num / Math.pow(scale, exponent)).toPrecision(3))
  const pre = (si ? 'kMGTPEZY' : 'KMGTPEZY').charAt(exponent - 1) + (si ? '' : 'i')
  return `${neg}${numStr} ${pre}B`
}
