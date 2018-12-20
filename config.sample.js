module.exports = {
  /*
    If set to true the user will need to specify the auto-generated token
    on each API call, meaning random strangers won't be able to use the service
    unless they have the token lolisafe provides you with.
    If it's set to false, then upload will be public for anyone to use.
  */
  private: true,

  /*
    If true, users will be able to create accounts and access their uploaded files.
  */
  enableUserAccounts: true,

  /*
    Here you can decide if you want lolisafe to serve the files or if you prefer doing so via nginx.
    The main difference between the two is the ease of use and the chance of analytics in the future.
    If you set it to `true`, the uploaded files will be located after the host like:
      https://lolisafe.moe/yourFile.jpg

    If you set it to `false`, you need to set nginx to directly serve whatever folder it is you are serving your
    downloads in. This also gives you the ability to serve them, for example, like this:
      https://files.lolisafe.moe/yourFile.jpg

    Both cases require you to type the domain where the files will be served on the `domain` key below.
    Which one you use is ultimately up to you.
  */
  serveFilesWithNode: false,
  domain: 'https://lolisafe.moe',

  /*
    If you are serving your files with a different domain than your lolisafe homepage,
    then fill this option with your lolisafe homepage, otherwise any falsy value.
    This will be used when listing album links in the dashboard.
  */
  homeDomain: null,

  /*
    Port on which to run the server.
  */
  port: 9999,

  /*
    Pages to process for the frontend.
  */
  pages: ['home', 'auth', 'dashboard', 'faq'],

  /*
    This can be either 'blacklist' or 'whitelist', which should be self-explanatory.
    When this is set to neither, this will fallback to 'blacklist'.
  */
  extensionsFilterMode: 'blacklist',

  extensionsFilter: [
    '.bash_profile',
    '.bash',
    '.bashrc',
    '.bat',
    '.bsh',
    '.cmd',
    '.com',
    '.csh',
    '.exe',
    '.exec',
    '.jar',
    '.msi',
    '.nt',
    '.profile',
    '.ps1',
    '.psm1',
    '.scr',
    '.sh'
  ],

  /*
    If set to true, files with no extensions will always be rejected.
  */
  filterNoExtension: false,

  /*
    If set to true, files with zero bytes size will always be rejected.
    NOTE: Even if the files only contain whitespaces, as long as they aren't
    zero bytes, they will be accepted.
  */
  filterEmptyFile: true,

  /*
    Show hash of the current git commit in homepage.
  */
  showGitHash: false,

  /*
    Path to error pages. Only 404 and 500 will be used.
    NOTE: rootDir can either be relative or absolute path.
  */
  errorPages: {
    rootDir: './pages/error',
    404: '404.html',
    500: '500.html'
  },

  /*
    Trust proxy.
    Only enable if you are running this behind a proxy like Cloudflare, Incapsula, etc.
  */
  trustProxy: true,

  /*
    Uploads config.
  */
  uploads: {
    /*
      Folder where files should be stored.
    */
    folder: 'uploads',

    /*
      Max file size allowed. Needs to be in MB.
      NOTE: When maxSize is greater than 1 MiB and using nginx as reverse proxy,
      you must set client_max_body_size to the same as maxSize.
      https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size
    */
    maxSize: '512MB',

    /*
      Max file size allowed for upload by URLs. Needs to be in MB.
      NOTE: Set to falsy value to disable upload by URLs.
    */
    urlMaxSize: '32MB',

    /*
      Proxy URL uploads.
      NOTE: Set to falsy value to disable.

      Available templates:
      {url} = full URL (encoded & with protocol)
      {url-noprot} = URL without protocol (images.weserv.nl prefers this format)

      Example:
      https://images.weserv.nl/?url={url-noprot}
      will become:
      https://images.weserv.nl/?url=example.com/assets/image.png
    */
    urlProxy: 'https://images.weserv.nl/?url={url-noprot}',

    /*
      Disclaimer message that will be printed in the URL uploads form.
      Supports HTML. Be safe though.
    */
    urlDisclaimerMessage: 'URL uploads are being proxied and compressed by <a href="https://images.weserv.nl/" target="_blank" rel="noopener">images.weserv.nl</a>. By using this feature, you agree to their <a href="https://github.com/weserv/images/blob/4.x/Privacy-Policy.md" target="_blank" rel="noopener">Privacy Policy</a>.',

    /*
      Filter mode for URL uploads.
      Can be 'blacklist', 'whitelist', or 'inherit'.
      'inherit' => inherit primary extensions filter (extensionsFilter option).
      The rest are paired with urlExtensionsFilter option below and should be self-explanatory.
      When this is not set to any of the 3 values, this will fallback to 'inherit'.
    */
    urlExtensionsFilterMode: 'whitelist',

    /*
      An array of extensions that are allowed for URL uploads.
      Intended for URL proxies that only support certain extensions.
      This will parse the extensions from the URLs, so URLs that do not end with
      the file's extensions will always be rejected
      Queries and segments in the URLs will be bypassed when parsing.
      NOTE: Set to falsy value to disable filters.
    */
    urlExtensionsFilter: [
      '.gif',
      '.jpg',
      '.jpeg',
      '.png',
      '.bmp',
      '.xbm',
      '.webp'
    ],

    /*
      Scan files using ClamAV through clamd.
    */
    scan: {
      enabled: false,
      ip: '127.0.0.1',
      port: 3310
    },

    /*
      Chunk size for chunk uploads. Needs to be in MB.
      If this is enabled, every files uploaded from the homepage uploader will forcibly be chunked
      by the size specified in "chunkSize". People will still be able to upload bigger files with
      the API as long as they don't surpass the limit specified in the "maxSize" option above.
      Total size of the whole chunks will also later be checked against the "maxSize" option.
      NOTE: Set to falsy value to disable chunked uploads.
    */
    chunkSize: '10MB',

    /*
      The length of the randomly generated identifier for uploaded files.
      If "userChangeable" is set to true, registered users will be able to change
      their preferred length from the dashboard. The allowed range will be set
      by "min" and "max". Otherwise it will use "default".

      It's possible to have "default" be outside of the "min" and "max" range,
      but be aware that once a user has changed their preferred length to be somewhere
      within the range, they will no longer be able to restore it back to "default".
    */
    fileLength: {
      min: 4,
      max: 32,
      default: 32,
      userChangeable: false
    },

    /*
      Cache file identifiers.

      They will be used for stricter collision checks, such that a single identifier
      may not be used by more than a single file (e.i. if "abcd.jpg" already exists, a new PNG
      file may not be named as "abcd.png").

      If this is enabled, the safe will then attempt to read file list of the uploads directory
      during first launch, parse the names, then cache the identifiers into memory.
      Its downside is that it will use a bit more memory, generally a few MBs increase
      on a safe with over >10k uploads.

      If this is disabled, collision check will become less strict.
      As in, the same identifier may be used by multiple different extensions (e.i. if "abcd.jpg"
      already exists, new files can be possibly be named as "abcd.png", "abcd.mp4", etc).
      Its downside will be, in the rare chance that multiple image/video files are sharing the same
      identifier, they will end up with the same thumbnail in dashboard, since thumbnails will
      only be saved as PNG in storage (e.i. "abcd.jpg" and "abcd.png" will share a single thumbnail
      named "abcd.png" in thumbs directory, in which case, the file that's uploaded the earliest will
      be the source for the thumbnail).

      Unless you do not use thumbnails, it is highly recommended to enable this feature.
    */
    cacheFileIdentifiers: true,

    /*
      The length of the randomly generated identifier for albums.
    */
    albumIdentifierLength: 8,

    /*
      This option will limit how many times it will try to
      generate a new random name when a collision occurs.
      Generally, the shorter the length is, the higher the chance for a collision to occur.
      This applies to both file name and album identifier.
    */
    maxTries: 3,

    /*
      Thumbnails are only used in the dashboard and album's public pages.
      You need to install a separate binary called ffmpeg (https://ffmpeg.org/) for video thumbnails.
    */
    generateThumbs: {
      image: true,
      video: false
    },

    /*
      Allow users to download a ZIP archive of all files in an album.
      The file is generated when the user clicks the download button in the view
      and is re-used if the album has not changed between download requests.
    */
    generateZips: true
  },

  /*
    Cloudflare support.
  */
  cloudflare: {
    /*
      No-JS uploader page will not chunk the uploads, so it's recommended to change this
      into the maximum upload size you have in Cloudflare.
      This limit will only be applied to the subtitle in the page.
      NOTE: Set to falsy value to inherit "maxSize" option.
    */
    noJsMaxSize: '100MB',

    /*
      If you have a Page Rule in Cloudflare to cache everything in the album zip
      API route (homeDomain/api/album/zip/*), with this option you can limit the
      maximum total size of files in an album that can be zipped.
      Cloudflare will not cache files bigger than 512MB.
      NOTE: Set to falsy value to disable max total size.
    */
    zipMaxTotalSize: '512MB',

    /*
      If you want to make it automatically call Cloudflare's API to purge cache on file delete,
      fill your API key, email and your site's zone ID below, then set "purgeCache" to true.
      This will only purge cache of the deleted file and its associated thumb.
    */
    apiKey: '',
    email: '',
    zoneId: '',
    purgeCache: false
  },

  /*
    Folder where to store logs.
    NOTE: This is currently unused.
  */
  logsFolder: 'logs',

  /*
    The following values shouldn't be touched, unless you know what you are doing.
  */
  database: {
    client: 'sqlite3',
    connection: { filename: './database/db' },
    useNullAsDefault: true
  }
}
