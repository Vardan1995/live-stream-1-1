const { RTCPeerConnection, RTCIceCandidate } = require('wrtc')
const io = require("socket.io-client")
const { SerialPort } = require("serialport")

const serialport = new SerialPort({ path: "COM5", baudRate: 9600 })

const socket = io.connect("http://localhost:4000");


const config = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302",
        }
    ],
};
let lastWatcherPeerConnection


socket.on("answer", (id, description) => {
    console.log("controller on answer", description);
    lastWatcherPeerConnection.setRemoteDescription(description);
});

socket.on("watcher", (id) => {
    console.log("controller on watcher");
    lastWatcherPeerConnection = new RTCPeerConnection(config);

    const channel = lastWatcherPeerConnection.createDataChannel("chat", { negotiated: true, id: 0 });
    channel.onmessage = function (event) {
        console.log("controller chat on message");
        handleAction(event.data)
    }

    lastWatcherPeerConnection = lastWatcherPeerConnection;

    lastWatcherPeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("candidate", id, event.candidate);
        }
    };

    lastWatcherPeerConnection
        .createOffer()
        .then((sdp) => lastWatcherPeerConnection.setLocalDescription(sdp))
        .then(() => {
            socket.emit("offer", id, lastWatcherPeerConnection.localDescription);
        });
});

socket.on("candidate", (id, candidate) => {
    lastWatcherPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("disconnectPeer", (id) => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
});





socket.emit("controller");

const actionState = {
    up: null,
    down: null,
    left: null,
    right: null,
}
const actionChars = {
    up: "u",
    down: "d",
    left: "l",
    right: "r",
}

function handleAction(action) {
    const [isDelete, name] = action.split("-")

    if (isDelete) {
        actionState[name] = null
    } else {

        actionState[name] = name
    }
    const actions = Object.values(actionState).filter(a => a).map(key => actionChars[key]).join("") + '\n'

    console.log(actions);
    serialport.write(actions)
}

serialport.on('readable', function () {// for later use
    console.log('Data:', serialport.read().toString())
})