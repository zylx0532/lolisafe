/* global LazyLoad */

const page = {
  lazyLoad: null
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
  const elements = document.getElementsByClassName('file-size')
  for (let i = 0; i < elements.length; i++)
    elements[i].innerHTML = page.getPrettyBytes(parseInt(elements[i].innerHTML.replace(/\s*B$/i, '')))

  page.lazyLoad = new LazyLoad()
}
