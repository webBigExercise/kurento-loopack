const io = require('socket.io-client')
const kurentoUtils = require('kurento-utils')

const wsUrl = `https://localhost:3000`
const socket = io(wsUrl)
let webRtcPeer

//initiate connection
socket.on('connect', async () => {
  console.log('connected')

  const webRtcPeerOptions = {
    localVideo: document.querySelector('#videoInput'),
    remoteVideo: document.querySelector('#videoOutput'),

    //browser collect ice candidate (network connection)
    onicecandidate: (candidate) =>
      socket.emit('client-send-ice-candidate', {
        data: { candidate },
      }),
  }

  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(
    webRtcPeerOptions,
    function (err) {
      if (err) return console.error(err)
      this.generateOffer((err, sdp) => {
        if (err) return console.error(err)

        socket.emit('client-offer-sdp', {
          data: { sdp },
        })
      })
    }
  )
})

socket.on('server-answer-sdp', ({data}) => {
  webRtcPeer.processAnswer(data.sdp)
})

socket.on('server-send-kurento-candidate', ({data}) => {
  webRtcPeer.addIceCandidate(data.candidate)
})