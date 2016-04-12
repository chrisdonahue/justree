window.justree = window.justree || {};

(function (justree) {
    var config = justree.config;
    var dsp = justree.dsp;
	var saturate = justree.saturate;
	var shared = justree.shared;

	var PlayheadStateEnum = shared.PlayheadStateEnum;
    var ModalEnum = shared.ModalEnum;
	
	var audio = justree.audio = {};
	audio.init = function () {
        audio.gainParam = config.gainParam;
        audio.timeLenParam = config.timeLenParam;
        audio.freqMinParam = config.freqMinParam;
        audio.freqMaxRatParam = config.freqMaxRatParam;
        audio.params = [audio.gainParam, audio.timeLenParam, audio.freqMinParam, audio.freqMaxRatParam];
        for (var i = 0; i < audio.params.length; ++i) {
            var param = audio.params[i];
            param.valLast = param.val;
        }

		var audioCtx = audio.audioCtx = new window.AudioContext();
		var sampleRate = audio.sampleRate = audioCtx.sampleRate;
		var sampleRateInverse = audio.sampleRateInverse = 1.0 / sampleRate;
		var blockSize = audio.blockSize = config.blockSize;
		var blockSizeInverse = audio.blockSizeInverse = 1.0 / blockSize;
		var scriptNode = audio.scriptNode = audioCtx.createScriptProcessor(blockSize, 0, 1);

        audio.synthBuffer = new dsp.AudioBuffer(3, blockSize);
        audio.synthVoices = [];
        audio.synthCellIdxToVoiceIdx = {};
        audio.synthVoicesIdxAvailable = [];
        audio.sineTab = dsp.allocateBufferFloat32(config.synthTabLen);
        dsp.tabGenerate(audio.sineTab, 'sine');
        for (var voiceIdx = 0; voiceIdx < config.synthVoicesNum; ++voiceIdx) {
            var voice = new dsp.CycTabRead4();
            voice.tabSet(audio.sineTab);
            audio.synthVoices.push(voice);
            audio.synthVoicesIdxAvailable.push(voiceIdx);
        }

        var segments = Array()
        segments.push(Array(config.synthAtk, 1.0));
        segments.push(Array(1.0 - config.synthAtk - config.synthRel, 1.0));
        segments.push(Array(config.synthRel, 0.0));
        audio.envTab = dsp.allocateBufferFloat32(config.synthTabLen);
        dsp.envGenerate(audio.envTab, 0, config.synthTabLen - 1, 0.0, segments);
        audio.envTab[config.synthTabLen - 1] = 0.0;
        audio.envRangeMap = new dsp.RangeMapLinear(0.0, 1.0, false, 1.0, config.synthTabLen - 2, true);
        audio.envTabRead = new dsp.TabRead2();
        audio.envTabRead.tabSet(audio.envTab);

        audio.saturateRangeMap = new dsp.RangeMapLinear(-10.0, 10.0, true, 1.0, config.synthTabLen - 3, false);
        audio.saturateTabRead = new dsp.TabRead4();
        audio.saturateTab = dsp.allocateBufferFloat32(config.synthTabLen);
        saturate.tablify(saturate.arctan(1.0, 2.0 / Math.PI), audio.saturateTab, -10.0, 10.0, 1, 2, -1.0, 1.0);
        audio.saturateTabRead.tabSet(audio.saturateTab);

        // https://github.com/web-audio-components/simple-reverb/blob/master/index.js
        var reverbLen = Math.floor(sampleRate * config.reverbLen);
        var reverbDcy = config.reverbDcy;
        var impulse = audioCtx.createBuffer(2, reverbLen, sampleRate);
        var impulseL = impulse.getChannelData(0);
        var impulseR = impulse.getChannelData(1);
        for (var i = 0; i < reverbLen; ++i) {
            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, reverbDcy);
            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, reverbDcy);
        }
        var reverbNode = audio.reverbNode = audioCtx.createConvolver();
        reverbNode.buffer = impulse;

		scriptNode.onaudioprocess = audio.callback;
        //scriptNode.connect(audioCtx.destination);
		scriptNode.connect(reverbNode);
        reverbNode.connect(audioCtx.destination);
	};
	audio.callback = function (event) {
        var sampleRate = audio.sampleRate;
        var sampleRateInverse = audio.sampleRateInverse;
        var blockOut = event.outputBuffer;
        var blockLen = blockOut.length;

        // convenience pointers to our internal buffer
        var block = audio.synthBuffer;
        var block0 = block.channelGet(0);
        var block1 = block.channelGet(1);
        var block2 = block.channelGet(2);

        // clear buffer
        audio.synthBuffer.clear();

        if (shared.playheadState !== PlayheadStateEnum.STOPPED &&
            shared.leafCellsSorted !== null &&
            shared.leafCellsSorted.length > 0) {
            // calculate/dezipper (TODO) UI parameters
            var gain = audio.gainParam.val;
            gain = gain * gain * gain * gain;

            // relative time
            var playheadPosStart = shared.playheadPosRel;
            var playheadPosStep = 1.0 / (sampleRate * audio.timeLenParam.val);
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
                if (cellCurrStart >= playheadPosStart && cellCurrStart < playheadPosEnd && cellCurr.node.on) {
                    cellsIdxStarting.push(cellCurrIdx);
                }
                if (cellCurrEnd >= playheadPosStart && cellCurrEnd < playheadPosEnd && cellCurr.node.on) {
                    cellsIdxEnding.push(cellCurrIdx);
                }
                ++cellCurrIdx;
            }

            if (cellsIdxStarting.length > 0 || cellsIdxEnding.length > 0) {
                //console.log(String(cellsIdxStarting.length) + ', ' + String(cellsIdxEnding.length));
            }

            // assign cell starts to voices
            var cellIdxToVoiceIdx = audio.synthCellIdxToVoiceIdx;
            var voicesIdxAvailable = audio.synthVoicesIdxAvailable;
            while (cellsIdxStarting.length > 0 && voicesIdxAvailable.length > 0) {
                cellIdxToVoiceIdx[cellsIdxStarting.pop()] = voicesIdxAvailable.pop();
            }

            // render voices
            var synthVoices = audio.synthVoices;
            var freqMin = audio.freqMinParam.val;
            var freqMaxRat = audio.freqMaxRatParam.val;
            var envRangeMap = audio.envRangeMap;
            var envTabRead = audio.envTabRead;
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
            audio.saturateRangeMap.perform(block, 2, 0, blockLen);
            audio.saturateTabRead.perform(block, 2, 0, blockLen);
        }

        // copy our mono synth to other channels
        for (var channel = 0; channel < blockOut.numberOfChannels; ++channel) {
            var blockOutCh = blockOut.getChannelData(channel);
            for (var sample = 0; sample < blockLen; ++sample) {
                blockOutCh[sample] = block2[sample];
            }
        }

        // stop or loop
        if (shared.playheadState === PlayheadStateEnum.PLAYING) {
            if (shared.playheadPosRel >= 1.0) {
                shared.playheadState = PlayheadStateEnum.STOPPED;
                shared.playheadPosRel = 0.0;
            }
        }
        else if (shared.playheadState === PlayheadStateEnum.LOOPING) {
            while (shared.playheadPosRel >= 1.0) {
                shared.playheadPosRel -= 1.0;
            }
        }
	};
})(window.justree);