module.exports = {
  stripIndents (string) {
    if (!string) return
    const result = string.replace(/^[^\S\n]+/gm, '')
    const match = result.match(/^[^\S\n]*(?=\S)/gm)
    const indent = match && Math.min(...match.map(el => el.length))
    if (indent) {
      const regexp = new RegExp(`^.{${indent}}`, 'gm')
      return result.replace(regexp, '')
    }
    return result
  }
}
