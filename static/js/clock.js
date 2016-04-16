window.justree = window.justree || {};

(function (justree) {
    var config = justree.config;

    var blockSizePow2 = config.blockSizePow2;
    var timeLenParam = config.timeLenParam;
    var timeoutMockFs = config.timeoutMockFs;
    var timeoutMockFsInv = 1.0 / timeoutMockFs;
	
    var ClockStateEnum = {
        'STOPPED': 0,
        'PLAYING': 1,
        'LOOPING': 2
    };
    var state = ClockStateEnum.STOPPED;
    var posRel = -1.0;
    var callbacks = [];

    var webAudioSupported = config.allowWebAudioApi && window.supportsWebAudio;
    var webAudioCtx = null;
    var webAudioFs = -1.0;
    var webAudioBlockSize = -1;
    var webAudioPosAbsDelta = -1.0;

	var clockCallback = function () {
        // skip if clock is off
        if (state === ClockStateEnum.STOPPED) {
            return;
        }

        // calculate t and dt
        var posAbsDelta;
        if (webAudioSupported) {
            var posAbsDelta = webAudioPosAbsDelta;
        }
        else {
            var posAbsDelta = Math.pow(2, blockSizePow2.val) * timeoutMockFsInv;
        }
        var posRelDelta = posAbsDelta / config.timeLenToAbs(timeLenParam.val);

        // clip dt if we're not looping
        if (!(state === ClockStateEnum.LOOPING) && posRel + posRelDelta >= 1.0) {
            posRelDelta = 1.0 - posRel;
        }

        // call clocked callbacks
		for (var i = 0; i < callbacks.length; ++i) {
			callbacks[i](posRel, posRelDelta);
		}

        // increment timer
        posRel += posRelDelta;
        if (state === ClockStateEnum.PLAYING) {
            if (posRel >= 1.0) {
                state = ClockStateEnum.STOPPED;
                posRel = -1.0;
            }
        }
        else if (state === ClockStateEnum.LOOPING) {
            while (posRel >= 1.0) {
                posRel -= 1.0;
            }
        }

        // set timeout for mock
        if (!webAudioSupported) {
            setTimeout(clockCallback, posAbsDelta * 1000.0);
        }
	};

	var clock = justree.clock = {};
	clock.init = function () {
        if (webAudioSupported) {
            webAudioCtx = new window.AudioContext();
            webAudioFs = webAudioCtx.sampleRate;
            webAudioBlockSize = Math.pow(2, blockSizePow2.valInit);
            webAudioPosAbsDelta = webAudioBlockSize / webAudioFs;
            var webAudioScriptNode = webAudioCtx.createScriptProcessor(webAudioBlockSize, 0, 1);
            webAudioScriptNode.onaudioprocess = clockCallback;
            webAudioScriptNode.connect(webAudioCtx.destination);
        }
    };
	clock.start = function () {
        state = ClockStateEnum.PLAYING;
        posRel = 0.0;
        if (!webAudioSupported) {
            clockCallback();
        }
	};
	clock.stop = function () {
        state = ClockStateEnum.STOPPED;
        posRel = -1.0;
	};
	clock.loop = function () {
		if (state === ClockStateEnum.STOPPED) {
			clock.start();
		}
        state = ClockStateEnum.LOOPING;
	};
    clock.getPosRel = function () {
        return posRel;
    };
	clock.registerCallback = function (callback) {
		callbacks.push(callback);
	};
    clock.usingWebAudio = function () {
        return webAudioSupported;
    };
})(window.justree);