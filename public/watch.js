let peerConnection;
const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    // {
    //   "urls": "turn:TURN_IP?transport=tcp",
    //   "username": "TURN_USERNAME",
    //   "credential": "TURN_CREDENTIALS"
    // }
  ],
};

const socket = io.connect(window.location.origin);
const video = document.querySelector("video");
const enableAudioButton = document.querySelector("#enable-audio");

enableAudioButton.addEventListener("click", enableAudio);

socket.on("offer", (id, description) => {
  peerConnection = new RTCPeerConnection(config);
  const channel = peerConnection.createDataChannel("chat", { negotiated: true, id: 0 });
  channel.onopen = function (event) {
    const controller = new Controller(channel)
    window.addEventListener("keydown", ({ key, repeat }) => {
      if (repeat) return
      controller[key]?.()
    })
    window.addEventListener("keyup", ({ key }) => {
      if (controller[key]) {
        controller.Stop()
      }
    })
  }
  peerConnection
    .setRemoteDescription(description)
    .then(() => peerConnection.createAnswer())
    .then((sdp) => peerConnection.setLocalDescription(sdp))
    .then(() => {
      socket.emit("answer", id, peerConnection.localDescription);
    });
  peerConnection.ontrack = (event) => {
    video.srcObject = event.streams[0];
  };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", id, event.candidate);
    }
  };
});

socket.on("candidate", (id, candidate) => {
  peerConnection
    .addIceCandidate(new RTCIceCandidate(candidate))
    .catch((e) => console.error(e));
});

socket.on("connect", () => {
  socket.emit("watcher");
});

socket.on("broadcaster", () => {
  socket.emit("watcher");
});

window.onunload = window.onbeforeunload = () => {
  socket.close();
  peerConnection.close();
};

function enableAudio() {
  console.log("Enabling audio");
  video.muted = false;
}

class Controller {
  constructor(channel) {
    this.channel = channel
  }
  #send(name) {
    this.channel.send(name)
  }

  ArrowLeft() {
    this.#send('left');
  }
  ArrowRight() {
    this.#send('right');
  }
  ArrowUp() {
    this.#send('up');
  }
  ArrowDown() {
    this.#send('down');
  }
  Stop() {
    this.#send('stop');
  }
}
