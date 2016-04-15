window.justree = window.justree || {};

(function (Fingerprint, justree) {	
	var config = justree.config = {};

    config.clientFingerprint = new Fingerprint().get();

    // initial tree params
    config.initBreadthMax = 3;
    config.initDepthMin = 2;
    config.initDepthMax = 5;

    // tree params
    config.nDims = 2;
    config.pTerm = 0.5;
    config.pOn = 0.0;
    config.ratios = [1, 2, 3];

    // mutate tree params
    config.growDepthMaxParam = {
        'min': 1,
        'max': 6,
        'step': 1,
        'valInit': 4
    };
    config.growBreadthMaxParam = {
        'min': 2,
        'max': 6,
        'step': 1,
        'valInit': 2
    };

    // message params
    config.allowWebAudioApi = true;
    config.timeoutMockFs = 44100.0;
    config.blockSizePow2 = {
        'min': 1,
        'max': 12,
        'step': 1,
        'valInit': 10
    };

    // playback params
    config.gainParam = {
        'min': 0.0,
        'max': 1.0,
        'step': 0.01,
        'valInit': 0.25
    };
    config.timeLenParam = {
        'min': 0.0,
        'max': 1.0,
        'step': 0.01,
        'valInit': 0.25
    };
    config.freqMinParam = {
        'min': 20.0,
        'max': 2020.0,
        'step': 10.0,
        'valInit': 220.0
    };
    config.freqMaxRatParam = {
        'min': 1.0,
        'max': 8.0,
        'step': 1.0,
        'valInit': 2.0
    };
    config.envAtkParam = {
        'min': 0.0,
        'max': 100.0,
        'step': 10.0,
        'valInit': 5.0,
    };
    config.envDcyParam = {
        'min': 0.0,
        'max': 1000.0,
        'step': 100.0,
        'valInit': 50.0
    };

    // network params
    config.oscServerIp = 'localhost';
    config.oscServerPort = 1235;
    config.oscNoteOnAddress = '/noteon';
    config.shareRoute = '/justrees'
    
    // debug
    config.debug = true;
    config.debugAssert = function(assertion, msg) {
        if (config.debug && !assertion) {
            alert(msg);
            throw msg;
        }
    };
})(window.Fingerprint, window.justree);