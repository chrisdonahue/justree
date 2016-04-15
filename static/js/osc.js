window.justree = window.justree || {};

(function (WebSocketPort, justree) {
    var config = justree.config;
    var clock = justree.clock;

    var clientFingerprint = config.clientFingerprint;
    var ModalEnum = shared.ModalEnum;
    var gainParam = config.gainParam;
    var freqMinParam = config.freqMinParam;
    var freqMaxRatParam = config.freqMaxRatParam;
    var timeoutRateParam = config.timeoutRateParam;

    /* private state */
    var connected = false;
    var socketOsc = null;
    var clockCallback = function (clockPosRelStart, clockPosRelDelta) {
        var sampleRate = osc.sampleRate;
        var sampleRateInverse = osc.sampleRateInverse;
        var blockOut = event.outputBuffer;
        var blockLen = blockOut.length;

        // convenience pointers to our internal buffer
        var block = osc.synthBuffer;
        var block0 = block.channelGet(0);
        var block1 = block.channelGet(1);
        var block2 = block.channelGet(2);

        // clear buffer
        osc.synthBuffer.clear();

        if (shared.playheadState !== oscStateEnum.STOPPED &&
            shared.leafCellsSorted !== null &&
            shared.leafCellsSorted.length > 0) {
            // calculate/dezipper (TODO) UI parameters
            var gain = osc.gainParam.val;
            gain = gain * gain * gain * gain;

            // relative time
            var playheadPosStart = shared.playheadPosRel;
            var playheadPosStep = 1.0 / (sampleRate * osc.timeLenParam.val);
            var playheadPosStepBlock = playheadPosStep * blockLen;
            var playheadPosEnd = playheadPosStart + playheadPosStepBlock;
            //console.log(String(playheadPosStart) + '->' + String(playheadPosEnd));

            // TODO edge case: no voices available but one will be at some point in this block

            // check if any voices starting or ending this block
            // TODO: deal with cell starts on loop
            var cells = shared.leafCellsSorted;
            var cellsIdxStarting = [];
            var cellsIdxEnding = [];
            var cellCurrIdx = 0;
            while (cellCurrIdx < cells.length) {
                var cellCurr = cells[cellCurrIdx];
                var cellCurrStart = cellCurr.x;
                var cellCurrEnd = cellCurr.x + cellCurr.width;
                if (cellCurrStart >= playheadPosStart && cellCurrStart < playheadPosEnd && cellCurr.node.getVelocity() > 0.0) {
                    cellsIdxStarting.push(cellCurrIdx);
                }
                if (cellCurrEnd >= playheadPosStart && cellCurrEnd < playheadPosEnd && cellCurr.node.getVelocity() > 0.0) {
                    cellsIdxEnding.push(cellCurrIdx);
                }
                ++cellCurrIdx;
            }

            if (cellsIdxStarting.length > 0 || cellsIdxEnding.length > 0) {
                //console.log(String(cellsIdxStarting.length) + ', ' + String(cellsIdxEnding.length));
            }

            // assign cell starts to voices
            var cellIdxToVoiceIdx = osc.synthCellIdxToVoiceIdx;
            var voicesIdxAvailable = osc.synthVoicesIdxAvailable;
            while (cellsIdxStarting.length > 0 && voicesIdxAvailable.length > 0) {
                cellIdxToVoiceIdx[cellsIdxStarting.pop()] = voicesIdxAvailable.pop();
            }

            // render voices
            var synthVoices = osc.synthVoices;
            var freqMin = osc.freqMinParam.val;
            var freqMaxRat = osc.freqMaxRatParam.val;
            var envRangeMap = osc.envRangeMap;
            var envTabRead = osc.envTabRead;
            _.each(cellIdxToVoiceIdx, function (value, key) {
                // calculate sine waves for each active voice
                var cell = cells[key];
                var voice = synthVoices[value];
                var freqHz = freqMin * Math.pow(freqMaxRat, 1.0 - (cell.y + cell.height));
                var freqRel = freqHz * sampleRateInverse;

                for (var sample = 0; sample < blockLen; ++sample) {
                    block0[sample] = freqRel;
                }
                voice.perform(block, 0, 0, blockLen);

                // calculate envelope phasor
                var cellWidthInv = 1.0 / cell.width;
                var cellFrac = (playheadPosStart - cell.x) * cellWidthInv;
                var cellFracStep = playheadPosStep * cellWidthInv;
                for (var sample = 0; sample < blockLen; ++sample) {
                    block1[sample] = cellFrac;
                    cellFrac += cellFracStep;
                }

                // map to table range
                envRangeMap.perform(block, 1, 0, blockLen);

                // generate envelope
                envTabRead.perform(block, 1, 0, blockLen);

                // add enveloped sinusoid to sum
                for (var sample = 0; sample < blockLen; ++sample) {
                    block2[sample] += block0[sample] * block1[sample];
                }
            });

            // release cell ends from voices
            while (cellsIdxEnding.length > 0) {
                var cellIdx = cellsIdxEnding.pop();
                if (cellIdx in cellIdxToVoiceIdx) {
                    var voiceIdx = cellIdxToVoiceIdx[cellIdx];
                    delete cellIdxToVoiceIdx[cellIdx];
                    voicesIdxAvailable.push(voiceIdx);
                    synthVoices[voiceIdx].phaseReset();
                }
            }

            // increment playhead
            shared.playheadPosRel = playheadPosEnd;

            // apply gain
            for (var sample = 0; sample < blockLen; ++sample) {
                block2[sample] *= gain;
            }

            // saturate (soft clip)
            osc.saturateRangeMap.perform(block, 2, 0, blockLen);
            osc.saturateTabRead.perform(block, 2, 0, blockLen);
        }

        // copy our mono synth to other channels
        for (var channel = 0; channel < blockOut.numberOfChannels; ++channel) {
            var blockOutCh = blockOut.getChannelData(channel);
            for (var sample = 0; sample < blockLen; ++sample) {
                blockOutCh[sample] = block2[sample];
            }
        }

        // stop or loop

    };
    var callbackServerOpen = function (event) {
        console.log('socket open');
        serverConnected = true;
        server.sendOsc('/connect');
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
    osc.serverSendMsg = function (messageAddress, parameters) {
        parameters = parameters || [];
        if (serverConnected) {
            serverSocket.send({
                address: messageAddress,
                args: [clientFingerprint].concat(parameters)
            });
        }
    };
})(osc.WebSocketPort, window.justree);