'use strict';

class Webrtc extends EventTarget {
    constructor(
        socket,
        pcConfig = null,
        logging = { log: true, warn: true, error: true }
    ) {
        super();
        this.room;
        this.socket = socket;
        this.pcConfig = pcConfig;

        this._myId = null;
        this.pcs = {}; // Peer connections
        this.streams = {};
        this.currentRoom;
        this.inCall = false;
        this.isReady = false; // At least 2 users are in room
        this.isInitiator = false; // Initiates connections if true
        this._isAdmin = false; // Should be checked on the server
        this._localStream = null;

        // Manage logging
        this.log = logging.log ? console.log : () => {};
        this.warn = logging.warn ? console.warn : () => {};
        this.error = logging.error ? console.error : () => {};

        // Initialize socket.io listeners
        this._onSocketListeners();
    }

    // Custom event emitter
    _emit(eventName, details) {
        this.dispatchEvent(
            new CustomEvent(eventName, {
                detail: details,
            })
        );
    }

    get localStream() {
        return this._localStream;
    }

    get myId() {
        return this._myId;
    }

    get isAdmin() {
        return this._isAdmin;
    }

    get roomId() {
        return this.room;
    }

    get participants() {
        return Object.keys(this.pcs);
    }

    gotStream() {
        if (this.room) {
            this._sendMessage({ type: 'gotstream' }, null, this.room);
        } else {
            this.warn('Should join room before sending stream');

            this._emit('notification', {
                notification: `Should join room before sending a stream.`,
            });
        }
    }

    joinRoom(room) {
        if (this.room) {
            this.warn('Leave current room before joining a new one');

            this._emit('notification', {
                notification: `Leave current room before joining a new one`,
            });
            return;
        }
        if (!room) {
            this.warn('Room ID not provided');

            this._emit('notification', {
                notification: `Room ID not provided`,
            });
            return;
        }
        this.socket.emit('create or join', room);
    }

    leaveRoom() {
        if (!this.room) {
            this.warn('You are currently not in a room');

            this._emit('notification', {
                notification: `You are currently not in a room`,
            });
            return;
        }
        this.isInitiator = false;
        this.socket.emit('leave room', this.room);
    }

    // Get local stream
    getLocalStream(audioConstraints, videoConstraints) {
        return navigator.mediaDevices
            .getUserMedia({
                audio: audioConstraints,
                video: videoConstraints,
            })
            .then((stream) => {
                this.log('Got local stream.');
                this._localStream = stream;
                return stream;
            })
            .catch(() => {
                this.error("Can't get usermedia");

                this._emit('error', {
                    error: new Error(`Can't get usermedia`),
                });
            });
    }

    /**
     * Try connecting to peers
     * if got local stream and is ready for connection
     */
    _connect(socketId) {
        if (typeof this._localStream !== 'undefined' && this.isReady) {
            this.log('Create peer connection to ', socketId);

            this._createPeerConnection(socketId);
            this.pcs[socketId].addStream(this._localStream);

            if (this.isInitiator) {
                this.log('Creating offer for ', socketId);

                this._makeOffer(socketId);
            }
        } else {
            this.warn('NOT connecting');
        }
    }

    /**
     * Initialize listeners for socket.io events
     */
    _onSocketListeners() {
        this.log('socket listeners initialized');

        // Room got created
        this.socket.on('created', (room, socketId) => {
            this.room = room;
            this._myId = socketId;
            this.isInitiator = true;
            this._isAdmin = true;

            this._emit('createdRoom', { roomId: room });
        });

        // Joined the room
        this.socket.on('joined', (room, socketId) => {
            this.log('joined: ' + room);

            this.room = room;
            this.isReady = true;
            this._myId = socketId;

            this._emit('joinedRoom', { roomId: room });
        });

        // Left the room
        this.socket.on('left room', (room) => {
            if (room === this.room) {
                this.warn(`Left the room ${room}`);

                this.room = null;
                this._removeUser();
                this._emit('leftRoom', {
                    roomId: room,
                });
            }
        });

        // Someone joins room
        this.socket.on('join', (room) => {
            this.log('Incoming request to join room: ' + room);

            this.isReady = true;

            this.dispatchEvent(new Event('newJoin'));
        });

        // Room is ready for connection
        this.socket.on('ready', (user) => {
            this.log('User: ', user, ' joined room');

            if (user !== this._myId && this.inCall) this.isInitiator = true;
        });

        // Someone got kicked from call
        this.socket.on('kickout', (socketId) => {
            this.log('kickout user: ', socketId);

            if (socketId === this._myId) {
                // You got kicked out
                this.dispatchEvent(new Event('kicked'));
                this._removeUser();
            } else {
                // Someone else got kicked out
                this._removeUser(socketId);
            }
        });

        // Logs from server
        this.socket.on('log', (log) => {
            this.log.apply(console, log);
        });

        /**
         * Message from the server
         * Manage stream and sdp exchange between peers
         */
        this.socket.on('message', (message, socketId) => {
            this.log('From', socketId, ' received:', message.type);

            // Participant leaves
            if (message.type === 'leave') {
                this.log(socketId, 'Left the call.');
                this._removeUser(socketId);
                this.isInitiator = true;

                this._emit('userLeave', { socketId: socketId });
                return;
            }

            // Avoid dublicate connections
            if (
                this.pcs[socketId] &&
                this.pcs[socketId].connectionState === 'connected'
            ) {
                this.log(
                    'Connection with ',
                    socketId,
                    'is already established'
                );
                return;
            }

            switch (message.type) {
                case 'gotstream': // user is ready to share their stream
                    this._connect(socketId);
                    break;
                case 'offer': // got connection offer
                    if (!this.pcs[socketId]) {
                        this._connect(socketId);
                    }
                    this.pcs[socketId].setRemoteDescription(
                        new RTCSessionDescription(message)
                    );
                    this._answer(socketId);
                    break;
                case 'answer': // got answer for sent offer
                    this.pcs[socketId].setRemoteDescription(
                        new RTCSessionDescription(message)
                    );
                    break;
                case 'candidate': // received candidate sdp
                    this.inCall = true;
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

    _createPeerConnection(socketId) {
        try {
            if (this.pcs[socketId]) {
                // Skip peer if connection is already established
                this.warn('Connection with ', socketId, ' already established');
                return;
            }

            this.pcs[socketId] = new RTCPeerConnection(this.pcConfig);
            this.pcs[socketId].onicecandidate = this._handleIceCandidate.bind(
                this,
                socketId
            );
            this.pcs[socketId].ontrack = this._handleOnTrack.bind(
                this,
                socketId
            );
            // this.pcs[socketId].onremovetrack = this._handleOnRemoveTrack.bind(
            //     this,
            //     socketId
            // );

            this.log('Created RTCPeerConnnection for ', socketId);
        } catch (error) {
            this.error('RTCPeerConnection failed: ' + error.message);

            this._emit('error', {
                error: new Error(`RTCPeerConnection failed: ${error.message}`),
            });
        }
    }

    /**
     * Send ICE candidate through signaling server (socket.io in this case)
     */
    _handleIceCandidate(socketId, event) {
        this.log('icecandidate event');

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
        this.error('ERROR creating offer');

        this._emit('error', {
            error: new Error('Error while creating an offer'),
        });
    }

    /**
     * Make an offer
     * Creates session descripton
     */
    _makeOffer(socketId) {
        this.log('Sending offer to ', socketId);

        this.pcs[socketId].createOffer(
            this._setSendLocalDescription.bind(this, socketId),
            this._handleCreateOfferError
        );
    }

    /**
     * Create an answer for incoming offer
     */
    _answer(socketId) {
        this.log('Sending answer to ', socketId);

        this.pcs[socketId]
            .createAnswer()
            .then(
                this._setSendLocalDescription.bind(this, socketId),
                this._handleSDPError
            );
    }

    /**
     * Set local description and send it to server
     */
    _setSendLocalDescription(socketId, sessionDescription) {
        this.pcs[socketId].setLocalDescription(sessionDescription);
        this._sendMessage(sessionDescription, socketId);
    }

    _handleSDPError(error) {
        this.log('Session description error: ' + error.toString());

        this._emit('error', {
            error: new Error(`Session description error: ${error.toString()}`),
        });
    }

    _handleOnTrack(socketId, event) {
        this.log('Remote stream added for ', socketId);

        if (this.streams[socketId]?.id !== event.streams[0].id) {
            this.streams[socketId] = event.streams[0];

            this._emit('newUser', {
                socketId,
                stream: event.streams[0],
            });
        }
    }

    _handleUserLeave(socketId) {
        this.log(socketId, 'Left the call.');
        this._removeUser(socketId);
        this.isInitiator = false;
    }

    _removeUser(socketId = null) {
        if (!socketId) {
            // close all connections
            for (const [key, value] of Object.entries(this.pcs)) {
                this.log('closing', value);
                value.close();
                delete this.pcs[key];
            }
            this.streams = {};
        } else {
            if (!this.pcs[socketId]) return;
            this.pcs[socketId].close();
            delete this.pcs[socketId];

            delete this.streams[socketId];
        }

        this._emit('removeUser', { socketId });
    }

    kickUser(socketId) {
        if (!this.isAdmin) {
            this._emit('notification', {
                notification: 'You are not an admin',
            });
            return;
        }
        this._removeUser(socketId);
        this.socket.emit('kickout', socketId, this.room);
    }
}
