<p align="center">
  <img src="https://lh3.googleusercontent.com/J68ffoWBYBsMDTpuQbu_AiOn8SpAi4AycmZ4xblZluSPDWdPVqZFREbxucrfCMq-ciFOPQ-6bNn3ju7pOw=w480-h492-rw-no">
</p>

# WebRTC Video Conference

**Live demo:** https://webrtc-video-conference-sample.herokuapp.com/

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
<br>
<br>
**_Note:_** _private properties and methods of the class are named starting with underscore('\_privateProp') and should not be accessed from outside.
<br>
JS's built in private properties ('#privateProp') are not used as that's a relatively new future and only newest versions of the browsers support it._

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

## Arguments

-   **socket** - socket.io instance (_required at least version 4.1.3_)
-   **pcConfig** - peer connection configuration. Stun/Turn servers can be passed here. If not provided webrtc will not use any servers and will be operational only on local network. Any number of stun and turn servers can be passed.

```js
{
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
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

After initialization local media stream should be accessed.

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

events `createdRoom` and `joinedRoom` will be emitted if join or creation of room was successful. After that `webrtc.gotStream()` can be called to notify server that local stream is ready for sharing.

## webrtc.leaveRoom()

Closes all open connections and leaves the current room. On successful leave event `leftRoom` will be emitted with room ID.

## webrtc.kickUser()

kick user with the given socket id from the call.

```js
webrtc.kickUser(socketId);
```

## Events

As mentioned `Webrtc` instance emits events, which can be listened to with [EventTarget.addEventListener()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener). Some of the events return data in `event.detail` property.

| Name         | Description                                   | Data                                                                                   |
| ------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| createdRoom  | Successfuly created a room.                   |                                                                                        |
| joinedRoom   | Successfuly joined a room.                    |                                                                                        |
| leftRoom     | Successfuly left a room.                      | **roomId** - ID of the abandoned room                                                  |
| kicked       | You were kicked out of conference.            |                                                                                        |
| userLeave    | User left the conference.                     | **socketId** - socket id of the user that left                                         |
| newUser      | New user joined.                              | **socketId** - socket id of the joined user.<br> **stream** - media stream of new user |
| removeUser   | Connections with user was closed and removed. | **socketId** - socket id of the removed user                                           |
| notification | Notification.                                 | **notification** - notification text                                                   |
| error        | An error occured.                             | **error** - Error object                                                               |

## Getters

| Name         | Description                             |
| ------------ | --------------------------------------- |
| localStream  | Returns local stream.                   |
| myId         | Returns current socket id.              |
| isAdmin      | If current user is admin(created room). |
| roomId       | Returns joined room id.                 |
| participants | Returns participants' ids in room.      |

# Stun and Turn servers

The project uses free stun and turn servers. For production use you might need to consider other alternatives.
<br>
If you want to build your own turn server consider using [coturn server](https://github.com/coturn/coturn).

If you are willing to pay to get these services there are providers who offer them:

-   [Twilio](https://www.twilio.com/stun-turn)
-   [Xirsys](https://xirsys.com/)
-   [Kurento](https://www.kurento.org/)

You might find these articles helpful:

-   https://medium.com/swlh/setup-your-own-coturn-server-using-aws-ec2-instance-29303101e7b5
-   https://kostya-malsev.medium.com/set-up-a-turn-server-on-aws-in-15-minutes-25beb145bc77
-   https://nextcloud-talk.readthedocs.io/en/latest/TURN/

_...more information is being added_

---

## Contributing

If you find any error in code or demo, or have an idea for more optimal solution for the code, please either open an issue or submit a pull request.
Contributions are welcome!

## License

MIT License

Copyright (c) 2021 avoup

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
