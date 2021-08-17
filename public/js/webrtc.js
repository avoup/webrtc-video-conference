'use strict';

class Webrtc extends EventTarget {
    constructor(
        room = 'room_1',
        socket,
        pcConfig = null,
        logging = { log: true, warn: true, error: true }
    ) {
        super();
        this.room = room;
        this.socket = socket;
        this.pcConfig = pcConfig;

        this.myId = null;
        this.pcs = {};
        this.streams = {};
        this.usersInRoom;
        this.currentRoom;
        this.inCall = false;
        this.isReady = false; // True if at least 2 users are in room
        this.isInitiator = false;
        this.isAdmin = false; // is checked on the server
        this.localStream = null;

        // Manage logging
        this.console = console;
        this.console.log = logging.log ? console.log : () => {};
        this.console.warn = logging.warn ? console.warn : () => {};
        this.console.error = logging.error ? console.error : () => {};

        // Initialize socket.io listeners
        this._onSocketListeners();

        
    }

    _emit(eventName, details) {
        this.dispatchEvent(
            new CustomEvent(eventName, {
                detail: details,
            })
        );
    }

    get getLocal() {
        return this.localStream;
    }

    get getMyId() {
        return this.myId;
    }

    get getIsAdmin() {
        return this.isAdmin;
    }

    get roomId() {
        return this.room;
    }

    get participants() {
        return this.usersInRoom;
    }

    // Get local stream
    getLocalStream(audioConstraints, videoConstraints) {
        return navigator.mediaDevices
            .getUserMedia({
                audio: audioConstraints,
                video: videoConstraints,
            })
            .then(this._gotStream)
            .catch(() => {
                this._emit('error', {
                    error: new Error(`Can't get usermedia`),
                });
                this.console.error("Can't get usermedia");
            });
    }

    _connect(socketId) {
        if (typeof this.localStream !== 'undefined' && this.isReady) {
            this.console.log('Create peer connection to ', socketId);

            this._createPeerConnection(socketId);
            this.pcs[socketId].addStream(this.localStream);

            if (this.isInitiator) {
                this.console.log('Creating offer for ', socketId);
                this._makeOffer(socketId);
            }
        } else {
            this.console.warn('NOT connecting');
        }
    }

    joinRoom(room) {
        this.socket.emit('create or join', room);
    }

    _onSocketListeners() {
        this.console.log('socket listeners initialized');

        // Room gets created
        this.socket.on('created', (room, socketId) => {
            this.currentRoom = room;
            this.myId = socketId;
            this.isInitiator = true;
            this.isAdmin = true;

            this.dispatchEvent(new Event('roomCreated'));
        });
        // Joined room
        this.socket.on('joined', (room, socketId) => {
            this.currentRoom = room;
            this.isReady = true;
            this.myId = socketId;

            this.dispatchEvent(new Event('join'));

            this.console.log('joined: ' + room);
        });

        // Someone joins room
        this.socket.on('join', (room) => {
            this.console.log('Incoming request to join room: ' + room);
            this.isReady = true;

            this.dispatchEvent(new Event('newJoin'));
        });

        // Room is ready for connection
        this.socket.on('ready', (user, allUsers) => {
            this.console.log('User: ', user, ' joined room');
            if (user !== this.myId && this.inCall) this.isInitiator = true;
            this.usersInRoom = allUsers;
            // usersOnline();
        });

        // Logs from server
        this.socket.on('kickout', (socketId) => {
            this.console.log('kickout user: ', socketId);
            if (socketId === this.myId) {
                this.dispatchEvent(new Event('kicked'));
                this._removeUser();
            } else {
                this._removeUser(socketId);
            }
        });

        // Logs from server
        this.socket.on('log', (log) => {
            this.console.log.apply(console, log);
        });

        /**
         * Message from the server
         */
        this.socket.on('message', (message, socketId) => {
            this.console.log('From', socketId, ' received:', message.type);

            // If participant left
            if (message.type === 'leave') {
                this._handleUserLeave(socketId);
                delete this.usersInRoom.sockets[socketId];
                // usersOnline();
                this.isInitiator = true;

                this._emit('userLeave', { socketId: socketId });
                return;
            }

            // If participant hanged up
            if (message.type === 'hangup') {
                this._removeUser(socketId);
                this._emit('userHangup', { socketId: socketId });
                return;
            }

            // Avoid dublicate connections
            if (
                this.pcs[socketId] &&
                this.pcs[socketId].connectionState === 'connected'
            ) {
                this.console.log(
                    'Connection with ',
                    socketId,
                    'is already established'
                );
                return;
            }

            switch (message.type) {
                case 'gotstream':
                    // callBtn.textContent = 'Answer'
                    // hangBtn.disabled = false;
                    // hangBtn.textContent = 'Reject';
                    this._connect(socketId);
                    break;
                case 'offer':
                    if (!this.pcs[socketId]) {
                        this._connect(socketId);
                    }
                    this.pcs[socketId].setRemoteDescription(
                        new RTCSessionDescription(message)
                    );
                    this._answer(socketId);
                    break;
                case 'answer':
                    this.pcs[socketId].setRemoteDescription(
                        new RTCSessionDescription(message)
                    );
                    break;
                case 'candidate':
                    this.inCall = true;
                    // hangBtn.disabled = false;
                    // hangBtn.textContent = 'Hangup';
                    const candidate = new RTCIceCandidate({
                        sdpMLineIndex: message.label,
                        candidate: message.candidate,
                    });
                    this.pcs[socketId].addIceCandidate(candidate);
                    break;
            }
        });
    }

    _sendMessage(message, toId = null, roomId = null) {
        this.socket.emit('message', message, toId, roomId);
    }

    _gotStream = (stream) => {
        this.console.log('Add local stream.');
        this.localStream = stream;

        this._sendMessage({ type: 'gotstream' }, null, this.currentRoom);

        return stream;
    };

    _createPeerConnection(socketId) {
        try {
            if (this.pcs[socketId]) {
                this.console.log(
                    'Connection with ',
                    socketId,
                    ' already established'
                );
                return;
            }

            this.pcs[socketId] = new RTCPeerConnection(this.pcConfig);
            this.pcs[socketId].onicecandidate = this._handleIceCandidate.bind(
                this,
                socketId
            );
            this.pcs[socketId].onaddstream = this._handleRemoteStreamAdded.bind(
                this,
                socketId
            );
            this.pcs[socketId].onremovestream = this._handleRemoteStreamRemove;

            this.console.log('Created RTCPeerConnnection for ', socketId);
        } catch (error) {
            this._emit('error', {
                error: new Error(`RTCPeerConnection failed: ${error.message}`),
            });
            this.console.error('RTCPeerConnection failed: ' + error.message);
        }
    }

    _handleIceCandidate(socketId, event) {
        this.console.log('icecandidate event');
        if (event.candidate) {
            this._sendMessage(
                {
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate,
                },
                socketId
            );
        }
    }

    _handleCreateOfferError(event) {
        this._emit('error', {
            error: new Error('Error while creating an offer'),
        });
        this.console.error('ERROR creating offer');
    }

    _makeOffer(socketId) {
        this.console.log('Sending offer to ', socketId);
        this.pcs[socketId].createOffer(
            this._setSendLocalDescription.bind(this, socketId),
            this._handleCreateOfferError
        );
    }

    _answer(socketId) {
        this.console.log('Sending answer to ', socketId);
        this.pcs[socketId]
            .createAnswer()
            .then(
                this._setSendLocalDescription.bind(this, socketId),
                this._handleSDPError
            );
    }

    _setSendLocalDescription(socketId, sessionDescription) {
        this.pcs[socketId].setLocalDescription(sessionDescription);
        this._sendMessage(sessionDescription, socketId);
    }

    _handleSDPError(error) {
        this._emit('error', {
            error: new Error(`Session description error: ${error.toString()}`),
        });
        this.console.log('Session description error: ' + error.toString());
    }

    _handleRemoteStreamAdded(socketId, event) {
        this.console.log('Remote stream added for ', socketId);
        this.streams[socketId] = event.stream;

        this._emit('newUser', {
            socketId,
            stream: event.stream,
        });
    }

    _handleRemoteStreamRemove(event) {
        this.console.log('Remote stream removed.');
    }

    _handleUserLeave(socketId) {
        this.console.log(socketId, 'Left the call.');
        this._removeUser(socketId);
        this.isInitiator = false;
    }

    _removeUser(socketId = null) {
        if (!socketId) {
            // close all connections
            for (const [key, value] of Object.entries(this.pcs)) {
                this.console.log('closing', value);
                value.close();
                delete this.pcs[key];
            }
        } else {
            if (!this.pcs[socketId]) return;
            this.pcs[socketId].close();
            delete this.pcs[socketId];
        }

        this._emit('removeUser', { socketId });
    }

    kickUser(socketId) {
        this._removeUser(socketId);
        this.socket.emit('kickout', socketId);
    }
}
