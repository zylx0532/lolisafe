# README

`versions.json` is the file that tells Nunjucks what version strings to append to client-side lolisafe assets.

To bump the version, it's recommended to use use `yarn bump-versions`.

```none
$ yarn bump-versions
$ node ./scripts/bump-versions.js

Bump version strings for client-side assets.

Usage:
node scripts/bump-versions.js <types>

types:
Space separated list of types (accepts 1 to 4).
1: CSS and JS files (lolisafe core assets + fontello.css).
2: Icons, images and config files (manifest.json, browserconfig.xml, etc).
3: CSS and JS files (libs from /public/libs, such as bulma, lazyload, etc).
4: Renders from /public/render/* directories (to be used with /src/js/misc/render.js).
a: Shortcut to update all types.
```

By default, running `yarn build` will also run `node ./scripts/bump-versions.js 1`.

## Cache-Control

Version strings will NOT be used when `cacheControl` in `config.js` is not enabled.

To begin with, version strings are only necessary when the assets are being cached indefinitely in browsers.
