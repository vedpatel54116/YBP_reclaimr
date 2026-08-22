// Tiny JSON-file persistence layer. Data volume is small (demo scale), so a
// document store is fine and keeps the server free of native dependencies.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, '..', 'data.json')

let data = null

export function getData() {
  return data
}

export function setData(d) {
  data = d
}

export function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return data
  }
  return null
}

export function saveData() {
  if (!data) return
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

export function uid(prefix = '') {
  data.seq = (data.seq || 0) + 1
  return `${prefix}_${data.seq}`
}
