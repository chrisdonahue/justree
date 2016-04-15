window.justree = window.justree || {};

(function (justree) {
    var config = justree.config;

    var timeoutRateParam = config.timeoutRateParam;
    var timeLenParam = config.timeLenParam;
    var timeoutMockFs = config.timeoutMockFs;
    var timeoutMockFsInv = 1.0 / timeoutMockFs;
	
    var ClockStateEnum = {
        'STOPPED': 0,
        'PLAYING': 1,
        'LOOPING': 2
    };
    var state = ClockStateEnum.STOPPED;
    var posRel = 0.0;
    var callbacks = []

	var clockCallback = function () {
		if (state === ClockStateEnum.STOPPED) {
			return;
		}

		var posAbsDelta = Math.pow(2, timeoutRateParam.val) * timeoutMockFsInv;
		var posRelDelta = posAbsDelta / timeLenParam.val;

		for (var i = 0; i < callbacks.length; ++i) {
			callbacks[i](posRel, posRelDelta);
		}

        if (state === ClockStateEnum.PLAYING) {
            if (posRel >= 1.0) {
                state = ClockStateEnum.STOPPED;
                posRel = 0.0;
            }
        }
        else if (state === ClockStateEnum.LOOPING) {
            while (posRel >= 1.0) {
                posRel -= 1.0;
            }
        }

        setTimeout(clockCallback, posAbsDelta * 1000.0);
	};

	var clock = justree.clock = {};
	clock.start = function () {
        state = ClockStateEnum.PLAYING;
        posRel = 0.0;
        clockCallback();
	};
	clock.stop = function () {
        state = ClockStateEnum.STOPPED;
        posRel = 0.0;
	};
	clock.loop = function () {
		if (state === ClockStateEnum.STOPPED) {
			clock.start();
		}
        state = ClockStateEnum.LOOPING;
	};
	clock.registerCallback = function (callback) {
		callbacks.push(callback);
	};
})(window.justree);