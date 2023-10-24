import _ from 'lodash'
import esbuild from 'esbuild'
import fs from 'fs'
import pathlib from 'path'
import * as childProcess from 'child_process'

type WasmPackProps = {
  outdir: string
  target: 'nodejs' | 'web'
}
const wasmPack = ({ outdir, target }: WasmPackProps) => {
  return childProcess.spawnSync(
    'pnpm',
    ['wasm-pack', 'build', '--verbose', '--out-dir', outdir, '--target', target, '--release', '--no-pack'],
    {
      stdio: 'inherit'
    }
  )
}

const getBinChunks = (wasmBinPath: string): string[] => {
  const wasmBin: Buffer = fs.readFileSync(wasmBinPath)
  const wasmB64 = wasmBin.toString('base64')
  const wasmB64Chunked = _.chunk(wasmB64, 100).map((chunk) => chunk.join(''))
  return wasmB64Chunked
}

const replaceInFile = (filePath: string, searchValue: string, replaceValue: string) => {
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  if (!fileContent.includes(searchValue)) {
    const maxLen = 10
    const searchValueSummary = searchValue.length > maxLen ? `${searchValue.slice(0, maxLen)}...` : searchValue
    throw new Error(`File ${filePath} does not contain the search value: "${searchValueSummary}"`)
  }

  const newFileContent = fileContent.replace(searchValue, replaceValue)
  fs.writeFileSync(filePath, newFileContent)
}

const rootDir = __dirname

const srcDir = pathlib.join(rootDir, 'src')
const srcEntryPoint = pathlib.join(srcDir, 'index.ts')

const pkgDir = pathlib.join(rootDir, 'pkg')
const pkgNodeDir = pathlib.join(pkgDir, 'node')
const pkgWebDir = pathlib.join(pkgDir, 'web')
const wasmFileName = 'entities_bg.wasm'
const gitIgnoreFileName = '.gitignore'
const indexJsFileName = 'index.js'

const distDir = pathlib.join(rootDir, 'dist')
const distNodeDir = pathlib.join(distDir, 'node')
const distWebDir = pathlib.join(distDir, 'web')

const buildNodeJs = async () => {
  wasmPack({ outdir: pkgNodeDir, target: 'nodejs' })
  fs.mkdirSync(pkgNodeDir, { recursive: true })
  fs.rmSync(pathlib.join(pkgNodeDir, gitIgnoreFileName), { force: true })

  const wasmB64Chunked = getBinChunks(pathlib.join(pkgNodeDir, wasmFileName))

  const currentCode = [
    "const path = require('path').join(__dirname, 'entities_bg.wasm');",
    "const bytes = require('fs').readFileSync(path);"
  ].join('\n')

  const newCode = [
    'const bin = [',
    ...wasmB64Chunked.map((chunk) => `  "${chunk}",`),
    "].join('')",
    '',
    'const bytes = Buffer.from(bin, "base64")',
    '',
    'module.exports = require("./entities.js")'
  ].join('\n')

  replaceInFile(pathlib.join(pkgNodeDir, 'entities.js'), currentCode, newCode)

  const entryPointContent = "module.exports = require('./entities.js')"

  fs.writeFileSync(pathlib.join(pkgNodeDir, indexJsFileName), entryPointContent)

  await esbuild.build({
    entryPoints: [srcEntryPoint],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: pathlib.join(distNodeDir, indexJsFileName),
    sourcemap: false
  })
}

const buildWeb = async () => {
  wasmPack({ outdir: pkgWebDir, target: 'web' })

  const wasmB64Chunked = getBinChunks(pathlib.join(pkgWebDir, wasmFileName))
  const entryPointContent = [
    "import { initSync } from './entities.js'",
    '',
    'const bin = [',
    ...wasmB64Chunked.map((chunk) => `  "${chunk}",`),
    "].join('')",
    '',
    'const wasmBin = Uint8Array.from(atob(bin), c => c.charCodeAt(0))',
    '',
    'initSync(wasmBin)',
    '',
    "export * from './entities.js'"
  ].join('\n')

  fs.mkdirSync(pkgWebDir, { recursive: true })
  fs.rmSync(pathlib.join(pkgWebDir, gitIgnoreFileName), { force: true })
  fs.writeFileSync(pathlib.join(pkgWebDir, indexJsFileName), entryPointContent)

  await esbuild.build({
    entryPoints: [srcEntryPoint],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    outfile: pathlib.join(distWebDir, indexJsFileName),
    sourcemap: false
  })
}

const main = async (argv: string[]) => {
  const [target] = argv
  if (target === 'nodejs') {
    await buildNodeJs()
    return
  }
  if (target === 'web') {
    await buildWeb()
    return
  }
  throw new Error(`Unsuported target: ${target}`)
}

void main(process.argv.slice(2))
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
