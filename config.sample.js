module.exports = {

  /*
    If set to true the user will need to specify the auto-generated token
    on each API call, meaning random strangers won't be able to use the service
    unless they have the token lolisafe provides you with.
    If it's set to false, then upload will be public for anyone to use.
  */
  private: true,

  // If true, users will be able to create accounts and access their uploaded files
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

  // Port on which to run the server
  port: 9999,

  // Pages to process for the frontend
  pages: ['home', 'auth', 'dashboard', 'faq'],

  /*
    If set to true, all extensions in "extensionsFilter" array will be blacklisted,
    otherwise only files with those extensions that can be uploaded.
  */
  filterBlacklist: true,

  extensionsFilter: [
    '.jar',
    '.exe',
    '.msi',
    '.com',
    '.bat',
    '.cmd',
    '.scr',
    '.ps1',
    '.sh'
  ],

  // Uploads config
  uploads: {

    // Folder where images should be stored
    folder: 'uploads',

    /*
      Max file size allowed. Needs to be in MB
      Note: When maxSize is greater than 1 MiB, you must set the client_max_body_size to the same as maxSize.
    */
    maxSize: '512MB',

    /*
      Chunked uploads.
      If this is enabled, every files uploaded from the homepage uploader will forcibly be chunked
      by the size specified in "chunkSize". People will still be able to upload bigger files with
      the API as long as they don't surpass the limit specified in the "maxSize" option above.
      Total size of the whole chunks will also later be checked against the "maxSize" option.
      No-JS uploader page will not have chunked uploads support, if you want to change the maximum
      file size 'displayed' on it, you can change the value of "noJsMaxSize".
      You can also set it to null (or other falsy values) to inherit the value of "maxSize" option.
      "chunkSize", and "noJsMaxSize" if set, need to be in MB.
    */
    chunkedUploads: {
      enabled: true,
      chunkSize: '10MB',
      noJsMaxSize: null
    },

    /*
      The length of the random generated name for the uploaded files.
      If "userChangeable" is set to true, registered users will be able to change
      their preferred file name length from the dashboard. The allowed range will
      be set by "min" and "max". Otherwise it will use "default".
      Technically it's possible to have "default" outside of the "min" and "max" range,
      but please not. Otherwise, once a user has changed to a value within the range,
      the user will no longer be able to use the default value.
    */
    fileLength: {
      min: 4,
      max: 32,
      default: 32,
      userChangeable: false
    },

    /*
    This option will limit how many times it will
    try to generate a new random name when a collision occurrs.
    The shorter the file name length is, the higher the chance for a collision to occur.
  */
    maxTries: 1,

    /*
      NOTE: Thumbnails are only for the admin panel and they require you
      to install a separate binary called graphicsmagick (http://www.graphicsmagick.org)
      for images and ffmpeg (https://ffmpeg.org/) for video files
    */
    generateThumbnails: {
      image: true,
      video: false
    },

    /*
      Allows users to download a .zip file of all files in an album.
      The file is generated when the user clicks the download button in the view
      and is re-used if the album has not changed between download requests
    */
    generateZips: true
  },

  // Folder where to store logs
  logsFolder: 'logs',

  // The following values shouldn't be touched
  database: {
    client: 'sqlite3',
    connection: { filename: './database/db' },
    useNullAsDefault: true
  }
}
