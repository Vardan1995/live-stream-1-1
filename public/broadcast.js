// Constants and configurations
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  // Additional ICE servers can be added here
];
const PEER_CONNECTION_CONFIG = { iceServers: ICE_SERVERS };
const socket = io.connect(window.location.origin);

// DOM elements
const videoElement = document.querySelector("video");
const audioSourceSelect = document.querySelector("select#audioSource");
const videoSourceSelect = document.querySelector("select#videoSource");

// State management
let peerConnections = {};
let localStream = null;
let zoomLevel = 1;

// Socket event handlers
function setupSocketListeners() {
  socket.on("answer", handleAnswer);
  socket.on("watcher", handleNewWatcher);
  socket.on("candidate", handleNewICECandidate);
  socket.on("disconnectPeer", handlePeerDisconnect);
  window.onunload = window.onbeforeunload = handleWindowUnload;
}

async function initializeMedia() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    videoElement.srcObject = stream;
    localStream = stream;
    socket.emit("broadcaster");
    await enumerateDevices();
  } catch (error) {
    console.error("Error initializing media: ", error);
  }
}

async function enumerateDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  populateDeviceSelection(devices, audioSourceSelect, 'audioinput');
  populateDeviceSelection(devices, videoSourceSelect, 'videoinput');
}

function populateDeviceSelection(devices, selectElement, kind) {
  devices.forEach((device) => {
    if (device.kind === kind) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `${kind} ${selectElement.length + 1}`;
      selectElement.appendChild(option);
    }
  });
}

function handleNewWatcher(id) {
  const peerConnection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
  peerConnections[id] = peerConnection;

  setupPeerConnection(peerConnection, id);
  addLocalTracksToPeerConnection(peerConnection);
  createAndSendOffer(peerConnection, id);
}

function setupPeerConnection(peerConnection, id) {
  const dataChannel = peerConnection.createDataChannel("chat", { negotiated: true, id: 0 });
  dataChannel.onmessage = (event) => {
    document.getElementById("ev").innerText = event.data;
    adjustZoom(event.data);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", id, event.candidate);
    }
  };
}

function addLocalTracksToPeerConnection(peerConnection) {
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });
}

async function createAndSendOffer(peerConnection, id) {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", id, offer);
}

function handleAnswer(id, description) {
  const peerConnection = peerConnections[id];
  peerConnection.setRemoteDescription(description);
}

function handleNewICECandidate(id, candidate) {
  const peerConnection = peerConnections[id];
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

function handlePeerDisconnect(id) {
  if (peerConnections[id]) {
    peerConnections[id].close();
    delete peerConnections[id];
  }
}

function handleWindowUnload() {
  socket.close();
}

function adjustZoom(action) {
  const videoTrack = localStream.getVideoTracks()[0];
  const capabilities = videoTrack.getCapabilities();

  // Check if zoom is supported
  if (!capabilities || !capabilities.zoom) {
    console.error('Zoom is not supported by', videoTrack.label);
    return;
  }

  if (action === "+") {
    zoomLevel = Math.min(zoomLevel + 1, capabilities.zoom.max);
  } else if (action === "-") {
    zoomLevel = Math.max(zoomLevel - 1, capabilities.zoom.min);
  }

  videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel }] })
    .catch(e => console.error('Error applying zoom constraint:', e));
}

function setupDeviceChangeListeners() {
  audioSourceSelect.onchange = updateStream;
  videoSourceSelect.onchange = updateStream;
}

async function updateStream() {
  if (localStream) {
    // Stop all current tracks before switching to new sources
    localStream.getTracks().forEach(track => track.stop());
  }

  const audioSource = audioSourceSelect.value;
  const videoSource = videoSourceSelect.value;
  const constraints = {
    audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
    video: { deviceId: videoSource ? { exact: videoSource } : undefined }
  };

  try {
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    localStream = newStream;
    videoElement.srcObject = newStream;

    // Replace tracks in all peer connections
    Object.values(peerConnections).forEach(peerConnection => {
      const senders = peerConnection.getSenders();
      newStream.getTracks().forEach(newTrack => {
        const sender = senders.find(sender => sender.track.kind === newTrack.kind);
        if (sender) {
          sender.replaceTrack(newTrack);
        }
      });
    });

    socket.emit("broadcaster"); // Notify the server about the stream update
  } catch (error) {
    console.error("Error updating the stream: ", error);
  }
}

// This function call initializes the device change listeners
setupDeviceChangeListeners();

// Initialize
setupSocketListeners();
initializeMedia();
