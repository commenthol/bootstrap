/* eslint
  no-console:off,
  unicorn/no-array-for-each: off,
  unicorn/consistent-destructuring:off,
  unicorn/prefer-string-starts-ends-with:off,
  unicorn/no-array-reduce:off,
  unicorn/prefer-object-from-entries:off,
 */
/* eslint-env node
 */

/*
  NOTES

  - border colors only first color is set

  Process
  npm run css3vars
*/

const css = require('css')
const fsP = require('fs/promises')
const path = require('path')
const Color = require('color')

const RE_COLOR = /(#[\da-f]{3,6}|rgba\((?:\d+, ){3}[\d.]+\)|^(?:\d+, ){2}\d+)/i
const RE_COLOR_RGB = /((?:\d+, ){2}\d+)/

const onColorDecl = (rule, colorMap) => {
  rule.declarations?.forEach(decl => {
    const { type, property, value } = decl
    if (type === 'declaration' &&
      property.startsWith('--bs-') &&
      RE_COLOR.test(value)
    ) {
      if (colorMap[value]) {
        console.log('doubled', value, property, colorMap[value])
      } else {
        colorMap[value] = property
      }
    }
  })
  if (rule.rules) {
    rule.rules.forEach(rule => {
      onColorDecl(rule, colorMap)
    })
  }
}

const appendRootVars = (stylesheet, varMap) => {
  for (const rule of stylesheet.rules) {
    if (rule?.selectors?.[0] !== ':root') {
      continue
    }

    for (const [value, property] of Object.entries(varMap)) {
      rule.declarations.push({
        type: 'declaration',
        property,
        value
      })
    }

    return
  }
}

const reduceColors = stylesheet => {
  const colorMap = {
    '#fff': '--bs-white',
    '#000': '--bs-black',
    '255, 255, 255': '--bs-white-rgb',
    '0, 0, 0': '--bs-black-rgb',
    '#e5e5e5': '--bs-table-light-border-color',
    '#bebebf': '--bs-table-dark-border-color'
  }
  appendRootVars(stylesheet, colorMap)
  onColorDecl(stylesheet, colorMap)
  return colorMap
}

const matchRgbColor = value => {
  const m = RE_COLOR_RGB.exec(value)
  return m ? m[1] : undefined
}

const matchColor = value => {
  const m = RE_COLOR.exec(value)
  return m ? m[1] : undefined
}

const findColor = (colorMap, value) => {
  let match = matchColor(value)
  let repl = colorMap[match]
  if (!repl && match && match.startsWith('rgba(')) {
    match = matchRgbColor(value)
    repl = colorMap[match]
  }

  return { repl, match }
}

const replaceColors = (rule, colorMap) => {
  const { selectors } = rule

  if (selectors?.[0] !== ':root') {
    rule.declarations?.forEach(decl => {
      const { type, property, value } = decl
      let tmp
      if (type === 'declaration' &&
      // /(color|box-shadow|border)/.test(property) &&
      // !property.startsWith('--bs') || /^--bs-alert/.test(property)) &&
      RE_COLOR.test(value)
      ) {
        for (let i = 0; i < 4; i++) { // iterate over border-color which may contain several colors
          const { match, repl } = findColor(colorMap, tmp || value)
          if (match && repl) {
            const replVar = `var(${repl})`
            // console.log({ property, value, match, replVar })
            decl.value = value.replace(match, replVar)
            tmp = decl.value
          } else if (i === 0) {
            // NEEDS ACTION: define missing colors...
            console.log({ selectors, property, match })
          } else {
            break
          }
        }
      }
    })
  }

  if (rule.rules) {
    rule.rules.forEach(rule => {
      replaceColors(rule, colorMap)
    })
  }
}

const MAIN_COLORS = ['primary', 'secondary', 'success', 'info', 'warning', 'danger', 'light', 'dark']
// const RE_MAIN_COLORS = new RegExp(MAIN_COLORS.join('|'))
const contrastThreshold = 60

const changeRootColors = stylesheet => {
  for (const rule of stylesheet.rules) {
    if (rule?.selectors?.[0] !== ':root') {
      continue
    }

    const varMap = {}
    rule.declarations.forEach(decl => {
      const { type, property, value } = decl
      if (type === 'declaration') {
        varMap[property] = value
      }
    })

    for (const name of MAIN_COLORS) {
      const color = new Color(varMap[`--bs-${name}`])
      // varMap[`--bs-${name}`] = color.hsl().string()
      const [h, s, l] = color.hsl().color
      const btnColor = (l - contrastThreshold) * -100 > 0 ? 'var(--bs-white)' : 'var(--bs-black)'

      varMap[`--bs-button-${name}-color`] = btnColor
      varMap[`--bs-button-${name}-hover-color`] = btnColor
      varMap[`--bs-button-${name}-active-color`] = btnColor
    }

    rule.declarations = []
    for (const [property, value] of Object.entries(varMap)) {
      rule.declarations.push({ type: 'declaration', property, value })
    }

    return
  }
}

const main = async () => {
  const filename = path.resolve(__dirname, 'dist/css/bootstrap.css')
  const filenameOut = path.resolve(__dirname, 'dist/css/bootstrap.css')
  const content = await fsP.readFile(filename, 'utf8')

  const parsed = css.parse(content)
  // normalize for later diff
  // await fsP.writeFile(filename, css.stringify(parsed), 'utf8')

  // console.log(JSON.stringify(parsed, null,2))
  const colorMap = reduceColors(parsed.stylesheet)
  // console.log(colorMap)
  replaceColors(parsed.stylesheet, colorMap)
  changeRootColors(parsed.stylesheet)

  await fsP.writeFile(filenameOut, css.stringify(parsed), 'utf8')
}

main().catch(console.error)
