// Builds public/library/ from packs/: OGG previews, export originals and library.json.
// Needs ffmpeg and ffprobe in PATH. Outputs newer than their source are kept.
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKS = join(ROOT, 'packs')
const OUT = join(ROOT, 'public', 'library')
const AUDIO = new Set(['.ogg', '.wav', '.mp3', '.flac', '.aif', '.aiff'])
const LIBRARY_VERSION = 1

async function walk(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await walk(full)))
    else found.push(full)
  }
  return found
}

const isSound = (file) =>
  AUDIO.has(extname(file).toLowerCase()) && !/preview/i.test(file.split(sep).pop())

/** Path segments inside the pack; a top folder shared by every sound is dropped. */
function segmentsOf(files, packDir) {
  const lists = files.map((f) => relative(packDir, f).split(sep))
  const top = lists[0][0]
  const shared = lists.every((s) => s.length > 1 && s[0] === top)
  return shared ? lists.map((s) => s.slice(1)) : lists
}

const slug = (text) => text.toLowerCase().replace(/ /g, '-')

async function isFresh(out, src) {
  try {
    return (await stat(out)).mtimeMs >= (await stat(src)).mtimeMs
  } catch {
    return false
  }
}

async function probe(file) {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_name',
    '-of',
    'json',
    file,
  ])
  const info = JSON.parse(stdout)
  return {
    duration: Math.round(Number(info.format.duration) * 100) / 100,
    codec: info.streams[0].codec_name,
  }
}

const ffmpeg = (args) => run('ffmpeg', ['-y', '-v', 'error', ...args])

/** AIF keeps its PCM depth in WAV: pcm_s24be → pcm_s24le. */
const wavCodec = (codec) => (/^pcm_/.test(codec) ? codec.replace(/be$/, 'le') : 'pcm_s16le')

async function buildSound(pack, file, segs) {
  const ext = extname(file).toLowerCase()
  const last = segs.at(-1)
  const stem = last.slice(0, last.length - extname(last).length)
  const id = `${pack.id}/${[...segs.slice(0, -1), stem].map(slug).join('/')}`
  const tags = [...new Set(segs.slice(0, -1).map((s) => s.toLowerCase()))]
  const preview = `${id}.ogg`
  const { duration, codec } = await probe(file)
  await mkdir(dirname(join(OUT, preview)), { recursive: true })
  if (ext === '.ogg') {
    if (!(await isFresh(join(OUT, preview), file))) await copyFile(file, join(OUT, preview))
    return { id, pack: pack.id, name: stem, tags, duration, preview, original: preview }
  }
  const aif = ext === '.aif' || ext === '.aiff'
  const original = aif ? `${id}.wav` : `${id}${ext}`
  if (!(await isFresh(join(OUT, original), file))) {
    if (aif) await ffmpeg(['-i', file, '-c:a', wavCodec(codec), join(OUT, original)])
    else await copyFile(file, join(OUT, original))
  }
  if (!(await isFresh(join(OUT, preview), file))) {
    await ffmpeg(['-i', file, '-vn', '-c:a', 'libvorbis', '-q:a', '5', join(OUT, preview)])
  }
  return { id, pack: pack.id, name: stem, tags, duration, preview, original }
}

async function pool(jobs, size) {
  const results = new Array(jobs.length)
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++
      results[i] = await jobs[i]()
    }
  }
  await Promise.all(Array.from({ length: size }, worker))
  return results
}

async function main() {
  const packs = JSON.parse(await readFile(join(ROOT, 'packs.json'), 'utf8'))
  const jobs = []
  for (const pack of packs) {
    const dir = join(PACKS, pack.id)
    const files = (await walk(dir)).filter(isSound).sort()
    if (!files.length) throw new Error(`No sounds in packs/${pack.id}`)
    segmentsOf(files, dir).forEach((segs, i) => jobs.push(() => buildSound(pack, files[i], segs)))
  }
  const sounds = await pool(jobs, availableParallelism())
  const seen = new Set()
  for (const s of sounds) {
    if (seen.has(s.id)) throw new Error(`Duplicate sound id: ${s.id}`)
    seen.add(s.id)
  }
  const library = { version: LIBRARY_VERSION, packs, sounds }
  await writeFile(join(OUT, 'library.json'), JSON.stringify(library))
  for (const pack of packs) {
    console.log(pack.id.padEnd(24), sounds.filter((s) => s.pack === pack.id).length)
  }
  console.log('sounds:', sounds.length)
}

await main()
