/* global page, swal */

page.renderRoot = 'render/al/'
page.renderArray = [
  'admiral_graf_spee_1.png',
  'admiral_hipper_1.png',
  'akagi_1.png',
  'akashi_1.png',
  'akashi_2.png',
  'atago_1.png',
  'atago_3.png',
  'atago_4.png',
  'atago_5.png',
  'belfast_2.png',
  'choukai_1.png',
  'deutschland_1.png',
  'enterprise_1.png',
  'glorious_1.png',
  'hammann_1.png',
  'hammann_2.png',
  'hammann_3.png',
  'hatsuharu_1.png',
  'kaga_1.png',
  'kaga_2.png',
  'kaga_3.png',
  'laffey_1.png',
  'laffey_2.png',
  'laffey_3.png',
  'prinz_eugen_3.png',
  'san_diego_1.png',
  'takao_3.png',
  'unicorn_1.png',
  'unicorn_2.png',
  'unicorn_3.png',
  'unicorn_4.png',
  'unicorn_6.png',
  'unicorn_7.png',
  'unicorn_8.png',
  'yamashiro_1.png',
  'yamashiro_2.png',
  'yamashiro_3.png',
  'yukikaze_1.png'
]
page.render = null

page.doRenderSwal = function () {
  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalRender" type="checkbox" ${localStorage.render === '0' ? '' : 'checked'}>
          Enable random render of ship waifu~
        </label>
      </div>
      <p class="help">If disabled, you will still be able to see a small button on the bottom right corner of the screen to re-enable it.</p>
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
      swal('Success!', `Render is now ${newValue ? 'disabled' : 'enabled'}.`, 'success')
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
    element.title = 'ship waifu~'
    element.innerHTML = '<i class="icon-picture-1"></i>'
  } else {
    // Let us just allow people to get new render when toggling the option
    page.render = page.renderArray[Math.floor(Math.random() * page.renderArray.length)]
    element = document.createElement('img')
    element.alt = element.title = 'ship waifu~'
    element.className = 'is-hidden-mobile'
    element.src = `${page.renderRoot}${page.render}${page.getRenderVersion()}`
  }

  element.classList.add('render')
  element.addEventListener('click', page.doRenderSwal)
  document.body.appendChild(element)
}

page.doRender()
