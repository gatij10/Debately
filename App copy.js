import './App.css';
import React, { useState, useRef } from 'react';
import firebase from './client/src/firebase/index';
import Modal from './client/src/components/Modal';
import symblToken from './client/src/symblToken';

function App() {
    
  const [mediaButton, setMediaButton] = useState(false);
  const [createRoomButton, setCreateRoomButton] = useState(true);
  const [joinRoomButton, setJoinRoomButton] = useState(true);
  const [hangUpButton, setHangUpButton] = useState(true);
  const [roomId, setRoomId] = useState("");
  const [showModal, setShowModal] = useState(false);

  const localStream = useRef();
  const remoteStream = useRef();

  const registerPeerConnectionListeners = () =>{
    console.log(peerConnection)
    peerConnection.addEventListener('icegatheringstatechange', () => {
      console.log(
          `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
    });
  
    peerConnection.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
    });
  
    peerConnection.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${peerConnection.signalingState}`);
    });
  
    peerConnection.addEventListener('iceconnectionstatechange ', () => {
      console.log(
          `ICE connection state change: ${peerConnection.iceConnectionState}`);
    });
  }

  const configuration = {
      iceServers: [
        {
          urls: [
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
          ],
        },
      ],
      iceCandidatePoolSize: 10,
    };

  let peerConnection = null;

  const onClickCreateRoom = async() =>{
    setCreateRoomButton(false);
    setJoinRoomButton(false);
    const db = firebase.firestore();
    const roomRef = await db.collection('rooms').doc();
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration); 
    registerPeerConnectionListeners();
    localStream.current.srcObject.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream.current.srcObject);
      });
    // Code for collecting ICE candidates below
    const callerCandidatesCollection = roomRef.collection('callerCandidates');

    peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) {
          console.log('Got final candidate!');
          return;
        }
        console.log('Got candidate: ', event.candidate);
        callerCandidatesCollection.add(event.candidate.toJSON());
      });
    // Code for collecting ICE candidates above

    // Code for creating a room below
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log('Created offer:', offer);

    const roomWithOffer = {
        'offer': {
        type: offer.type,
        sdp: offer.sdp,
        },
    };
    await roomRef.set(roomWithOffer);
    setRoomId(roomRef.id);
    // Code for creating a room above

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.current.srcObject.addTrack(track);
      });
    });

    // Listening for remote session description below
    roomRef.onSnapshot(async snapshot => {
      const data = snapshot.data();
      if (!peerConnection.currentRemoteDescription && data && data.answer) {
        console.log('Got remote description: ', data.answer);
        const rtcSessionDescription = new RTCSessionDescription(data.answer);
        await peerConnection.setRemoteDescription(rtcSessionDescription);
      }
    });
    // Listening for remote session description above

    // Listen for remote ICE candidates below
    roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // Listen for remote ICE candidates above
  }

  const joinRoom = async() =>{
    setCreateRoomButton(true);
    setJoinRoomButton(true);
    console.log('Join room: ', roomId);
    await joinRoomById(roomId);
  }

  const joinRoomById = async() =>{
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(`${roomId}`);
    const roomSnapshot = await roomRef.get();
    console.log('Got room:', roomSnapshot.exists);
    if (roomSnapshot.exists) {
      console.log('Create PeerConnection with configuration: ', configuration);
      peerConnection = new RTCPeerConnection(configuration);
      registerPeerConnectionListeners();
      localStream.current.srcObject.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream.current.srcObject);
      });

      // Code for collecting ICE candidates below
      const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
      peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) {
          console.log('Got final candidate!');
          return;
        }
        console.log('Got candidate: ', event.candidate);
        calleeCandidatesCollection.add(event.candidate.toJSON());
      });
      // Code for collecting ICE candidates above

      peerConnection.addEventListener('track', event => {
        console.log('Got remote track:', event.streams[0]);
        event.streams[0].getTracks().forEach(track => {
          console.log('Add a track to the remoteStream:', track);
          remoteStream.current.srcObject.addTrack(track);
        });
      });

      // Code for creating SDP answer below
      const offer = roomSnapshot.data().offer;
      console.log('Got offer:', offer);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      console.log('Created answer:', answer);
      await peerConnection.setLocalDescription(answer);

      const roomWithAnswer = {
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
      };
      await roomRef.update(roomWithAnswer);
      // Code for creating SDP answer above

      // Listening for remote ICE candidates below
      roomRef.collection('callerCandidates').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
          if (change.type === 'added') {
            let data = change.doc.data();
            console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
            await peerConnection.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
      // Listening for remote ICE candidates above
    }
  }

  const onClickMedia = async() =>{
    const stream = await navigator.mediaDevices.getUserMedia({video: false, audio: true});
    localStream.current.srcObject = stream;
    remoteStream.current.srcObject = new MediaStream();
    setMediaButton(true);
    setJoinRoomButton(false);
    setCreateRoomButton(false);
    setHangUpButton(false);
  }

  const onClickSymbl = () =>{
    const accessToken = symblToken.bearer;
    const uniqueMeetingId = btoa("user@example.com")
    const symblEndpoint = `wss://api.symbl.ai/v1/realtime/insights/${uniqueMeetingId}?access_token=${accessToken}`;
    
    const ws = new WebSocket(symblEndpoint);
    
    // Fired when a message is received from the WebSocket server
    ws.onmessage = (event) => {
      // You can find the conversationId in event.message.data.conversationId;
      const data = JSON.parse(event.data);
      if (data.type === 'message' && data.message.hasOwnProperty('data')) {
        console.log('conversationId', data.message.data.conversationId);
      }
      if (data.type === 'message_response') {
        for (let message of data.messages) {
          console.log('Transcript (more accurate): ', message.payload.content);
        }
      }
      if (data.type === 'topic_response') {
        for (let topic of data.topics) {
          console.log('Topic detected: ', topic.phrases)
        }
      }
      if (data.type === 'insight_response') {
        for (let insight of data.insights) {
          console.log('Insight detected: ', insight.payload.content);
        }
      }
      if (data.type === 'message' && data.message.hasOwnProperty('punctuated')) {
        console.log('Live transcript (less accurate): ', data.message.punctuated.transcript)
      }
      console.log(`Response type: ${data.type}. Object: `, data);
    };
    
    // Fired when the WebSocket closes unexpectedly due to an error or lost connetion
    ws.onerror  = (err) => {
      console.error(err);
    };
    
    // Fired when the WebSocket connection has been closed
    ws.onclose = (event) => {
      console.info('Connection to websocket closed');
    };
    
    // Fired when the connection succeeds.
    ws.onopen = (event) => {
      ws.send(JSON.stringify({
        type: 'start_request',
        meetingTitle: 'Websockets How-to', // Conversation name
        insightTypes: ['question', 'action_item'], // Will enable insight generation
        config: {
          confidenceThreshold: 0.5,
          languageCode: 'en-US',
          speechRecognition: {
            encoding: 'LINEAR16',
            sampleRateHertz: 44100,
          }
        },
        speaker: {
          userId: 'example@symbl.ai',
          name: 'Example Sample',
        }
      }));
    };

    const AudioContext = window.AudioContext;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(localStream.current.srcObject);
    const processor = context.createScriptProcessor(1024, 1, 1);
    const gainNode = context.createGain();
    source.connect(gainNode);
    gainNode.connect(processor);
    processor.connect(context.destination);
    processor.onaudioprocess = (e) => {
      // convert to 16-bit payload
      const inputData = e.inputBuffer.getChannelData(0) || new Float32Array(this.bufferSize);
      const targetBuffer = new Int16Array(inputData.length);
      for (let index = inputData.length; index > 0; index--) {
          targetBuffer[index] = 32767 * Math.min(1, inputData[index]);
      }
      // Send audio stream to websocket.
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(targetBuffer.buffer);
      }
    };

  }

  const onClickHangUp = () =>{
    const tracks = localStream.current.srcObject.getTracks();
    tracks.forEach(track => {
      track.stop();
    });

    if (remoteStream.current.srcObject) {
      remoteStream.current.srcObject.getTracks().forEach(track => track.stop());
    }

    if (peerConnection) {
      peerConnection.close();
    }

    localStream.current.srcObject = null;
    remoteStream.current.srcObject = null;
    setMediaButton(false);
    setJoinRoomButton(true);
    setCreateRoomButton(true);
    setHangUpButton(true);
    setRoomId("");
  }

  return (
    <div className="App">
      <div id="buttons">
    <button className="mdc-button mdc-button--raised" id="cameraBtn" disabled={mediaButton} onClick={onClickMedia}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">perm_camera_mic</i>
        <span className="mdc-button__label">Open camera microphone</span>
    </button>
    <button className="mdc-button mdc-button--raised" disabled={createRoomButton} id="createBtn" onClick={onClickCreateRoom}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">group_add</i>
        <span className="mdc-button__label">Create room</span>
    </button>
    <button className="mdc-button mdc-button--raised" disabled={joinRoomButton} id="joinBtn" onClick={()=>setShowModal(true)}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">group</i>
        <span className="mdc-button__label">Join room</span>
    </button>
    <button className="mdc-button mdc-button--raised" disabled={hangUpButton} id="hangupBtn" onClick={onClickHangUp} >
        <i className="material-icons mdc-button__icon" aria-hidden="true">close</i>
        <span className="mdc-button__label">Hangup</span>
    </button>
    <button className="mdc-button mdc-button--raised" id="hangupBtn" onClick={onClickSymbl} >
        <span className="mdc-button__label">Connect To Symbl</span>
    </button>
</div>
<div>
    <span id="currentRoom">{roomId}</span>
</div>
<div id="videos">
    <audio controls id="localVideo" muted autoPlay ref={localStream} playsInline ></audio>
    <audio controls id="remoteVideo" autoPlay playsInline ref={remoteStream}></audio>
</div>
<Modal showModal={showModal} setShowModal={setShowModal} joinRoom={joinRoom} roomId={roomId} setRoomId={setRoomId} />
    </div>
  );
}

export default App;
