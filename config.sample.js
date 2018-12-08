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
    then fill this option with your lolisafe homepage, otherwise leave it null (or other falsy value).
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
    If set to true, all extensions in "extensionsFilter" array will be blacklisted,
    otherwise only files with those extensions that can be uploaded.
  */
  filterBlacklist: true,

  extensionsFilter: [
    '.jar',
    '.exe',
    '.exec',
    '.msi',
    '.com',
    '.bat',
    '.cmd',
    '.nt',
    '.scr',
    '.ps1',
    '.psm1',
    '.sh',
    '.bash',
    '.bsh',
    '.csh',
    '.bash_profile',
    '.bashrc',
    '.profile'
  ],

  /*
    If set to true, files with no extensions will always be rejected.
  */
  filterNoExtension: false,

  /*
    Show hash of the current git commit in homepage.
  */
  showGitHash: false,

  /*
    Path to error pages. Only 404 and 500 will be used.
    Note: rootDir can either be relative or absolute path.
  */
  errorPages: {
    rootDir: './pages/error',
    404: '404.html',
    500: '500.html'
  },

  /*
    Uploads config.
  */
  uploads: {
    /*
      Folder where images should be stored.
    */
    folder: 'uploads',

    /*
      Max file size allowed. Needs to be in MB.
      Note: When maxSize is greater than 1 MiB and using nginx as reverse proxy,
      you must set client_max_body_size to the same as maxSize.
      https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size
    */
    maxSize: '512MB',

    /*
      Max file size allowed for upload by URLs. Needs to be in MB.
      NOTE: Set to falsy value (false, null, etc.) to disable upload by URLs.
    */
    urlMaxSize: '32MB',

    /*
      Scan files using ClamAV through clamd.
    */
    scan: {
      enabled: false,
      ip: '127.0.0.1',
      port: 3310
    },

    /*
      Use DuckDuckGo's proxy when fetching URL uploads.
      This may be considered a hack and not supported by DuckDuckGo, so USE AT YOUR OWN RISK.
      This should work with any type of URLs, but they have to be direct links,
      since DuckDuckGo's proxy will not follow redirects.
    */
    urlDuckDuckGoProxy: false,

    /*
      Chunk size for chunk uploads. Needs to be in MB.
      If this is enabled, every files uploaded from the homepage uploader will forcibly be chunked
      by the size specified in "chunkSize". People will still be able to upload bigger files with
      the API as long as they don't surpass the limit specified in the "maxSize" option above.
      Total size of the whole chunks will also later be checked against the "maxSize" option.
      NOTE: Set to falsy value (false, null, etc.) to disable chunked uploads.
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
      generate a new random name when a collision occurrs.
      The shorter the length is, the higher the chance for a collision to occur.
      This applies to both file name and album identifier.
    */
    maxTries: 1,

    /*
      Thumbnails are only for the dashboard.
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
      NOTE: Set to falsy value (false, null, etc.) to inherit "maxSize" option.
    */
    noJsMaxSize: '100MB',

    /*
      If you have a Page Rule in Cloudflare to cache everything in the album zip
      API route (homeDomain/api/album/zip/*), with this option you can limit the
      maximum total size of files in an album that can be zipped.
      Cloudflare will not cache files bigger than 512MB.
      NOTE: Set to falsy value (false, null, etc.) to disable max total size.
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
