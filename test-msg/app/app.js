const FramedStream = require('framed-stream')
const PearRuntime = require('pear-runtime')
const ReadyResource = require('ready-resource')

module.exports = class App extends ReadyResource {
  constructor({ dir, app, updates, version, upgrade, name, room }) {
    super()

    this.dir = dir
    this.app = app
    this.updates = updates
    this.version = version
    this.upgrade = upgrade
    this.name = name
    this.room = room

    this.IPC = null
    this.pipe = null
  }

  _open() {
    // El orden de este array importa: el worker los lee por índice vía Bare.argv.
    this.IPC = PearRuntime.run(require.resolve('./workers/main.js'), [
      String(this.updates),
      this.version,
      this.upgrade,
      this.name,
      this.dir,
      this.app || '',
      this.room
    ])
    this.pipe = new FramedStream(this.IPC)

    this.pipe.on('data', (data) => this._onmessage(data))
    this.pipe.on('error', (err) => this.emit('error', err))
    this.IPC.on('error', (err) => this.emit('error', err))
    this.IPC.on('exit', (code) => {
      if (code === 0 || this.closing !== null || this.closed) return
      this.emit('error', new Error(`Updates worker exited with code ${code}`))
    })
  }

  _close() {
    const pipe = this.pipe
    const IPC = this.IPC

    this.pipe = null
    this.IPC = null

    pipe?.destroy()
    IPC?.destroy()
  }

  _onmessage(data) {
    const message = data.toString()

    if (message === 'updating') {
      this.emit('updating')
      return
    }

    if (message === 'updated') {
      this.emit('updated')
      this._send('pear:applyUpdate')
      return
    }

    if (message === 'pear:updateApplied') {
      this.emit('update-applied')
      return
    }

    this.emit('message', message)
  }

  _send(message) {
    if (this.pipe === null) return
    this.pipe.write(message)
  }

  // Manda una línea de chat al worker, que la broadcastea a los peers.
  say(text) {
    this._send(`chat:${text}`)
  }

  async exit(code = 0) {
    Bare.exitCode = code
    await this.close()
  }
}
