# Todo

Normal priority:

* [x] Improve performance of album public pages, ~~and maybe paginate them~~.
* [x] Use [native lazy-load tag](https://web.dev/native-lazy-loading) on nojs album pages.
* [x] Use incremental version numbering instead of randomized strings.
* [ ] Use versioning in APIs, somehow.
* [ ] Better `df` handling (system disk stats).
* [x] Use loading spinners on dashboard's sidebar menus.
* [x] Disable all other sidebar menus when a menu is still loading.
* [ ] Collapsible dashboard's sidebar albums menus.
* [x] Change `title` attribute of disabled control buttons in uploads & users lists.
* [x] Use Gatsby logo for link to [blog.fiery.me](https://blog.fiery.me/) on the homepage.
* [ ] Auto-detect missing columns in `database/db.js`.
* [x] Better error message when server is down.
* [x] Show expiry date in thumbs view.
* [ ] Add Select all checkbox somewhere in thumbs view.
* [x] Display renders after API check.
* [x] Enforce pass min/max lengths in dashboard's change password form.
* [ ] Add a copy all links to clipboard when there are more than 2 uploads in history.
* [x] Update fb_share.png.
* [ ] Support [fragments](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Identifying_resources_on_the_Web#Fragment) for dashboard sidebar menus.

Low priority:

* [ ] Delete user feature.
* [ ] Bulk delete user feature.
* [ ] Bulk disable user feature.
* [ ] Strip EXIF from images. [#51](https://github.com/BobbyWibowo/lolisafe/issues/51)
* [ ] DMCA request logs (bare text file will do), and link it in FAQ.

Lower priority:

* [ ] Perhaps consider switching from [Express](https://github.com/expressjs/express) to [Fastify](https://github.com/fastify/fastify)?
* [ ] Multi-level sub dirs for uploads. [#51](https://github.com/BobbyWibowo/lolisafe/issues/51)
* [ ] Mime type blacklist. [#51](https://github.com/BobbyWibowo/lolisafe/issues/51)
* [ ] Cluster mode (multi-core support). [#50](https://github.com/BobbyWibowo/lolisafe/issues/50)
* [ ] Tiered accounts. [#51](https://github.com/BobbyWibowo/lolisafe/issues/51)
