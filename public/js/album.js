/* global LazyLoad */

const page = {
  lazyLoad: null,

  // byte units for getPrettyBytes()
  byteUnits: ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
}

page.getPrettyBytes = num => {
  // MIT License
  // Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)

  if (!Number.isFinite(num)) return num

  const neg = num < 0
  if (neg) num = -num
  if (num < 1) return (neg ? '-' : '') + num + ' B'

  const exponent = Math.min(Math.floor(Math.log10(num) / 3), page.byteUnits.length - 1)
  const numStr = Number((num / Math.pow(1000, exponent)).toPrecision(3))
  const unit = page.byteUnits[exponent]

  return (neg ? '-' : '') + numStr + ' ' + unit
}

window.onload = function () {
  const elements = document.getElementsByClassName('file-size')
  for (let i = 0; i < elements.length; i++)
    elements[i].innerHTML = page.getPrettyBytes(parseInt(elements[i].innerHTML))

  page.lazyLoad = new LazyLoad()
}
