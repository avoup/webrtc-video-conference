'use strinct';

const socket = io.connect();

const localVideo = document.querySelector('#localVideo-container video');

const videoGrid = document.querySelector('#videoGrid');

// Initilize webrtc
const webrtc = new Webrtc(
    'room-1',
    socket,
    {
        iceServers: [
            // {
            //     urls: 'stun:stun.l.google.com:19302',
            // },
            {                
                urls: 'turn:numb.viagenie.ca',
                credential: 'muazkh',
                username: 'webrtc@live.com'
            }
        ],
    },
    { log: true, warn: true, error: true }
);

const room = 'room_1';

// Get local stream
webrtc
    .getLocalStream(true, { width: 640, height: 480 })
    .then((stream) => (localVideo.srcObject = stream));
// Join a room
webrtc.joinRoom(room);

const setTitle = (status) => {
    console.log(`Room ${room} was ${status}`)
    document.querySelector('h1').textContent = 'Room: ' + room;
};

webrtc.addEventListener('roomCreated', setTitle.bind(this, 'created'));

webrtc.addEventListener('join', setTitle.bind(this, 'joined'));

webrtc.addEventListener('kicked', () => {
    document.querySelector('h1').textContent = 'You were kicked out';
    videoGrid.innerHTML = '';
});

webrtc.addEventListener('userLeave', (e) => {
    console.log(`user ${e.detail.socketId} left room`);
});

webrtc.addEventListener('newUser', (e) => {
    const socketId = e.detail.socketId;
    const stream = e.detail.stream;

    const videoContainer = document.createElement('div');
    videoContainer.setAttribute('class', 'grid-item');
    videoContainer.setAttribute('id', socketId);

    const video = document.createElement('video');
    video.setAttribute('autoplay', true);
    video.setAttribute('muted', true); // set to false
    video.setAttribute('playsinline', true);
    video.srcObject = stream;

    const p = document.createElement('p');
    p.textContent = socketId + ': ';

    videoContainer.append(p);
    videoContainer.append(video);

    // If user is admin add kick buttons
    if (webrtc.getIsAdmin) {
        const kickBtn = document.createElement('button');
        kickBtn.setAttribute('class', 'kick_btn');
        kickBtn.textContent = 'Kick';

        kickBtn.addEventListener('click', () => {
            webrtc.kickUser(socketId);
        });

        videoContainer.append(kickBtn);
    }
    videoGrid.append(videoContainer);
});

webrtc.addEventListener('removeUser', (e) => {
    const socketId = e.detail.socketId;
    if (!socketId) {
        // remove all remote stream elements
        videoGrid.innerHTML = '';
        return;
    }
    document.getElementById(socketId).remove();
});

webrtc.addEventListener('error', (e) => {
    const error = e.detail.error;
    console.error(error);
});
