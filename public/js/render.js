/* global page, swal */

page.renderRoot = 'render/al/'
page.renderArray = [
  'atago_1.png',
  'atago_2.png',
  'belfast_1.png',
  'belfast_2.png',
  'belfast_3.png',
  'eldridge_1.png',
  'hammann_1.png',
  'hammann_2.png',
  'javelin_1.png',
  'kaga_1.png',
  'laffey_1.png',
  'prinz_eugen_1.png',
  'prinz_eugen_2.png',
  'takao_1.png',
  'takao_2.png',
  'unicorn_1.png',
  'unicorn_2.png',
  'unicorn_3.png',
  'unicorn_4.png',
  'unicorn_5.png',
  'yamashiro_1.png'
]
page.render = null

page.doRenderSwal = function () {
  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalRender" type="checkbox" ${localStorage.render === '0' ? '' : 'checked'}>
          启用随机出现在右下角的嫁舰~
        </label>
      </div>
      <p class="help">如果禁用，您仍然可以在屏幕右下角看到一个小按钮以重新启用它。</p>
    </div>
  `

  swal({
    content: div,
    buttons: {
      confirm: true
    }
  }).then(function (value) {
    if (!value) return
    const newValue = div.querySelector('#swalRender').checked ? undefined : '0'
    if (newValue !== localStorage.render) {
      newValue ? localStorage.render = newValue : localStorage.removeItem('render')
      swal('成功！', `现在出现的嫁舰是 ${newValue ? 'disabled' : 'enabled'}.`, 'success')
      const element = document.querySelector('body > .render')
      element.remove()
      page.doRender()
    }
  })
}

page.getRenderVersion = function () {
  const renderScript = document.getElementById('renderScript')
  if (renderScript && renderScript.dataset.version)
    return `?v=${renderScript.dataset.version}`
  return ''
}

page.doRender = function () {
  if (!page.renderRoot || !page.renderArray || !page.renderArray.length) return

  let element
  if (localStorage.render === '0') {
    element = document.createElement('a')
    element.className = 'button is-breeze is-hidden-mobile'
    element.title = '嫁舰~'
    element.innerHTML = '<i class="icon-picture-1"></i>'
  } else {
    // Let us just allow people to get new render when toggling the option
    page.render = page.renderArray[Math.floor(Math.random() * page.renderArray.length)]
    element = document.createElement('img')
    element.alt = element.title = '嫁舰~'
    element.className = 'is-hidden-mobile'
    element.src = `${page.renderRoot}${page.render}${page.getRenderVersion()}`
  }

  element.classList.add('render')
  element.addEventListener('click', page.doRenderSwal)
  document.body.appendChild(element)
}

page.doRender()
