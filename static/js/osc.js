window.justree = window.justree || {};

(function (WebSocketPort, justree) {
    var config = justree.config;
    var clock = justree.clock;
    var shared = justree.shared;

    var clientFingerprint = config.clientFingerprint;
    var ModalEnum = shared.ModalEnum;
    var gainParam = config.gainParam;
    var timeLenParam = config.timeLenParam;
    var freqMinParam = config.freqMinParam;
    var freqMaxRatParam = config.freqMaxRatParam;
    var envAtkParam = config.envAtkParam;
    var envDcyParam = config.envDcyParam;
    var noteOnAddress = config.oscNoteOnAddress;

    /* private state */
    var connected = false;
    var socketOsc = null;
    var clockCallback = function (clockPosRelStart, clockPosRelDelta) {
        var cells = shared.getNodeRootLeafCellsSorted();
        var clockPosRelEnd = clockPosRelStart + clockPosRelDelta;
        var looping = clockPosRelEnd > 1.0;

        var cellsEmitting = [];
        for (var i = 0; i < cells.length; ++i) {
            var cell = cells[i];
            var cellStart = cell.x;
            if (cellStart >= clockPosRelStart && cellStart < clockPosRelEnd && cell.node.getVelocity() > 0.0) {
                cellsEmitting.push(cell);
            }
            if (looping) {
                if (cellStart >= (clockPosRelStart - 1.0) && cellStart < (clockPosRelEnd - 1.0) && cell.node.getVelocity() > 0.0) {
                    cellsEmitting.push(cell);
                }
            }
        }

        if (cellsEmitting.length == 0) {
            return;
        }

        var timeLen = timeLenParam.val;
        var freqMin = freqMinParam.val;
        var freqMaxRat = freqMaxRatParam.val;
        var envAtk = envAtkParam.val;
        var envDcy = envDcyParam.val;
        for (var i = 0; i < cellsEmitting.length; ++i) {
            var cell = cellsEmitting[i];
            var freqBase = freqMin * Math.pow(freqMaxRat, 1.0 - (cell.y + cell.height));
            var freqCutoff = freqMin * Math.pow(freqMaxRat, 1.0 - cell.y);
            var velocity = cell.node.getVelocity();
            var envLen = cell.width * timeLen * 1000.0;

            osc.serverSendMsg(noteOnAddress, [freqBase, freqCutoff, velocity, envAtk, envDcy, envLen]);
        }
    };
    var callbackServerOpen = function (event) {
        console.log('socket open');
        serverConnected = true;
        osc.serverSendMsg('/connect');
    };
    var callbackServerClose = function (event) {
        console.log('socket close');
        serverConnected = false;
    };
    var callbackServerMessage = function (event) {
        console.log('socket message: ' + event.data);
        alert(event.data);
    };
    var callbackServerError = function (event) {
        console.log('socket error: ' + event.data);
    };

    /* exports */
    var osc = justree.osc = {};
    osc.init = function () {
        clock.registerCallback(clockCallback); 
    };
    osc.serverConnect = function () {
        serverSocket = new WebSocketPort({
            url: 'ws://' + config.oscServerIp + ':' + config.oscServerPort
        });

        // register socket callbacks
        serverSocket.on('open', callbackServerOpen);
        serverSocket.on('close', callbackServerClose);
        serverSocket.on('message', callbackServerMessage);
        serverSocket.on('error', callbackServerError);

        // open socket
        try {
            serverSocket.open();
        }
        catch (e) {
            alert('Could not connect to audio server.');
            throw 'Could not connect to OSC server.';
        }
    };
    osc.serverDisconnect = function () {
        if (serverConnected) {
            serverSocket.close();
        }
        serverConnected = false;
        serverSocket = null;
    };
    osc.serverSendMsg = function (address, args) {
        args = args || [];
        if (serverConnected) {
            serverSocket.send({
                address: address,
                args: [clientFingerprint].concat(args)
            });
        }
    };
})(osc.WebSocketPort, window.justree);
