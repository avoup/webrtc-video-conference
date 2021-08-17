# WebRTC Video Conference

WebRTC video conference sample application. Uses Mesh architecture (every participant sends and receives its media to all other participants).

## Getting Started

In your terminal type:

```bash
# Clone from Github
git clone https://github.com/avoup/webrtc-video-conference myproject

# Change directory
cd myproject

# Install NPM dependencies
npm install

# Start app
npm start

```

## Project Structure

| Name                    | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| **public**/js/webrtc.js | Main webrtc logic.                                           |
| **public**/js/main.js   | Js for using webrtc.js.                                      |
| **public**/css/main.css | Style                                                        |
| **public**/index.html   | Landing page.                                                |
| .gitignore              | Folder and files to be ignored by git.                       |
| server.js               | Sample server for webrtc signaling using socket.io.          |
| package.json            | NPM dependencies.                                            |
| package-lock.json       | Contains exact versions of NPM dependencies in package.json. |

<br>

# Documentation

Project uses Webrtc API without external libraries, for signaling it uses socket.io, stun and turn servers are publicly available free servers, see the list [here](https://gist.github.com/sagivo/3a4b2f2c7ac6e1b5267c2f1f59ac6c6b).

For easy implementation and modular design all the webrtc logic is contained in the Webrtc class in `public/js/webrtc.js` file. This class is an extension of EventTarget class, meaning it emits events and we can add event listeners to it.
The class's construction function takes 3 arguments

```js
class Webrtc extends EventTarget {
    constructor(socket, pcConfig, logging) {
        super();
        ...
    }
```

example initialization

```js
const webrtc = new Webrtc(
    socket,
    { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    {
        log: true,
        warn: true,
        error: true,
    }
);
```

-   **socket** - socket.io instance (required)
-   **pcConfig** - peer connection configuration. Stun/Turn servers can be passed here. If not provided webrtc will not use any servers and will be operational only on local network. Any number of stun and turn servers can be passed.

```js
{
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun1.l.google.com:19302'
            ],
        },
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com',
        },
    ],
}
```

-   **logging** - enable or disable logging on actions.
    -   log - enable console.log
    -   warn - enable console.warn
    -   error - enable console.error

```js
{
    log: true,
    warn: true,
    error: true,
}
```

## webrtc.getLocalStream()

After initialization local media stream should be accessed. This method noitifies server that it got stream and is ready to connect.

```js
webrtc
    .getLocalStream(true, { width: 640, height: 480 })
    .then((stream) => (localVideo.srcObject = stream));
```

getLocalStream takes two arguments for `audio` and `video` constraints. It returns promise, which returns a stream from local media that can be attached to an HTML audio or video element as a source, element should be set on `autoplay`.

The method actually returns [navigator.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## webrtc.joinRoom()

After initialization room can be joined with `joinRoom` method.

```js
webrtc.joinRoom('room-1');
```

## Events

| Name        | Description                                           |
| ----------- | ----------------------------------------------------- |
| roomCreated | Room you tried to join did not exist and got created. |
| join        | You joined a room.                                    |
| kicked      | You were kicked out of conference.                    |
| userLeave   | User left the conference.                             |
| newUser     | New user joined.                                      |
| removeUser  | Connections with user was closed and removed.         |
| error       | An error occured.                                     |

# Getting ready for Production

...will be added

# Video conference architectures

...will be added

...more information is being added
