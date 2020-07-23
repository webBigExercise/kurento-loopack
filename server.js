const https = require('https')
const express = require('express')
const fs = require('fs')
const socketIo = require('socket.io')
const { promisify } = require('util')
const kurento = require('kurento-client')

const port = 3000
const kurentoUrl = 'ws://localhost:8888/kurento'
const httpsOption = {
  key: fs.readFileSync('./keys/server.key'),
  cert: fs.readFileSync('./keys/server.crt'),
}
const app = express()
const server = https.createServer(httpsOption, app)
const io = socketIo(server)
const candidateStore = {}
const sessionStore = {}

io.on('connection', async (socket) => {
  console.log('connected')

  const kurentoClient = await promisify(kurento).bind(kurento)(kurentoUrl)

  socket.on('client-offer-sdp', async ({ data }) => {
    console.log('offer-sdp')
    const pipeline = await promisify(kurentoClient.create).bind(kurentoClient)(
      'MediaPipeline'
    )
    const webRtcEndpoint = await promisify(pipeline.create).bind(pipeline)(
      'WebRtcEndpoint'
    )

    // still not guarantee webRtcEndpoint can add all candidate
    // demo only
    while (candidateStore[socket.id]?.length) {
      const candidate = candidateStore[socket.id].shift()
      webRtcEndpoint.addIceCandidate(candidate)
    }

    await promisify(webRtcEndpoint.connect).bind(webRtcEndpoint)(webRtcEndpoint)

    //server collect icd candidate
    webRtcEndpoint.on('OnIceCandidate', (evt) => {
      const candidate = kurento.getComplexType('IceCandidate')(evt.candidate)
      socket.emit('server-send-kurento-candidate', { data: { candidate } })
    })

    const answerSdp = await promisify(webRtcEndpoint.processOffer).bind(
      webRtcEndpoint
    )(data.sdp)
    sessionStore[socket.id] = {
      pipeline,
      webRtcEndpoint,
    }

    await promisify(webRtcEndpoint.gatherCandidates).bind(webRtcEndpoint)()
    socket.emit('server-answer-sdp', { data: { sdp: answerSdp } })
  })

  socket.on('client-send-ice-candidate', async ({ data }) => {
    const candidate = kurento.getComplexType('IceCandidate')(data.candidate)

    if (sessionStore[socket.id]) {
      console.info('Add candidate immediately')
      const webRtcEndpoint = sessionStore[socket.id].webRtcEndpoint
      webRtcEndpoint.addIceCandidate(candidate)
      return
    }

    console.info('Queueing candidate')
    if (!candidateStore[socket.id]) {
      candidateStore[socket.id] = []
    }

    candidateStore[socket.id].push(candidate)
  })
})

app.use('/', express.static('.'))
server.listen(port, () => console.log('server is started on port: ' + port))
setTimeout(() => console.log(candidateStore), 10000)