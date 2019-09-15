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

/** TASKS: LINT */

gulp.task('lint:js', () => {
  return gulp.src('./src/js/**/*.js')
    .pipe(eslint())
    .pipe(eslint.failAfterError())
})

gulp.task('lint:css', () => {
  return gulp.src('./src/css/**/*.css')
    .pipe(stylelint())
})

gulp.task('lint', gulp.parallel('lint:js', 'lint:css'))

/** TASKS: CLEAN */

gulp.task('clean:css', () => {
  return del(['dist/css'])
})

gulp.task('clean:js', () => {
  return del(['dist/js'])
})

gulp.task('clean', gulp.parallel('clean:css', 'clean:js'))

/** TASKS: BUILD */

gulp.task('build:css', () => {
  const plugins = [
    postcssPresetEnv()
  ]

  // Minify on production
  if (process.env.NODE_ENV !== 'development')
    plugins.push(cssnano())

  return gulp.src('./src/css/**/*.css')
    .pipe(sourcemaps.init())
    .pipe(postcss(plugins))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('./dist/css'))
})

gulp.task('build:js', () => {
  return gulp.src('./src/js/**/*.js')
    .pipe(sourcemaps.init())
    .pipe(buble())
    // Minify on production
    .pipe(gulpif(process.env.NODE_ENV !== 'development', terser()))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('./dist/js'))
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
      'routes/'
    ],
    ext: 'js',
    done
  })
})

gulp.task('watch', gulp.series('clean', 'build', gulp.parallel('watch:src', 'nodemon')))
