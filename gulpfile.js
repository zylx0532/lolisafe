const gulp = require('gulp')
const cssnano = require('cssnano')
const del = require('del')
const buble = require('gulp-buble')
const eslint = require('gulp-eslint')
const gulpif = require('gulp-if')
const nodemon = require('gulp-nodemon')
const postcss = require('gulp-postcss')
const postcssPresetEnv = require('postcss-preset-env')
const sourcemaps = require('gulp-sourcemaps')
const stylelint = require('gulp-stylelint')
const terser = require('gulp-terser')

// Put built files for development on a Git-ignored directory.
// This will prevent IDE's Git from unnecessarily
// building diff's during development.
const dist = process.env.NODE_ENV === 'development'
  ? './dist-dev'
  : './dist'

/** TASKS: LINT */

gulp.task('lint:js', () => {
  return gulp.src('./src/**/*.js', {
    ignore: './src/libs/**/*'
  })
    .pipe(eslint())
    .pipe(eslint.failAfterError())
})

gulp.task('lint:css', () => {
  return gulp.src('./src/**/*.css', {
    ignore: './src/libs/**/*'
  })
    .pipe(stylelint())
})

gulp.task('lint', gulp.parallel('lint:js', 'lint:css'))

/** TASKS: CLEAN */

gulp.task('clean:css', () => {
  return del([
    `${dist}/**/*.css`,
    `${dist}/**/*.css.map`
  ])
})

gulp.task('clean:js', () => {
  return del([
    `${dist}/**/*.js`,
    `${dist}/**/*.js.map`
  ])
})

gulp.task('clean:rest', () => {
  return del([
    `${dist}/*`
  ])
})

gulp.task('clean', gulp.parallel('clean:css', 'clean:js', 'clean:rest'))

/** TASKS: BUILD */

gulp.task('build:css', () => {
  const plugins = [
    postcssPresetEnv()
  ]

  // Minify on production
  if (process.env.NODE_ENV !== 'development')
    plugins.push(cssnano())

  return gulp.src('./src/**/*.css')
    .pipe(sourcemaps.init())
    .pipe(postcss(plugins))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(dist))
})

gulp.task('build:js', () => {
  return gulp.src('./src/**/*.js')
    .pipe(sourcemaps.init())
    .pipe(buble())
    // Minify on production
    .pipe(gulpif(process.env.NODE_ENV !== 'development', terser()))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(dist))
})

gulp.task('build', gulp.parallel('build:css', 'build:js'))

gulp.task('default', gulp.series('lint', 'clean', 'build'))

/** TASKS: WATCH (SKIP LINTER) */

gulp.task('watch:css', () => {
  return gulp.watch([
    'src/**/*.css'
  ], gulp.series('clean:css', 'build:css'))
})

gulp.task('watch:js', () => {
  return gulp.watch([
    'src/**/*.js'
  ], gulp.series('clean:js', 'build:js'))
})

gulp.task('watch:src', gulp.parallel('watch:css', 'watch:js'))

gulp.task('nodemon', done => {
  return nodemon({
    script: './lolisafe.js',
    env: process.env,
    watch: [
      'lolisafe.js',
      'logger.js',
      'config.js',
      'controllers/',
      'database/',
      'routes/',
      'views/_globals.njk',
      'views/_layout.njk',
      'views/album.njk'
    ],
    ext: 'js',
    done
  })
})

gulp.task('watch', gulp.series('clean', 'build', gulp.parallel('watch:src', 'nodemon')))
