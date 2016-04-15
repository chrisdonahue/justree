window.justree = window.justree || {};

(function (Fingerprint, justree) {	
	var config = justree.config = {};

    config.clientFingerprint = new Fingerprint().get();

    // tree params
    config.breadthMax = 3;
    config.depthMin = 2;
    config.depthMax = 3;
    config.nDims = 2;
    config.pTerm = 0.5;
    config.pOn = 0.0;
    config.ratios = [1, 2, 3];

    // hear params
    config.gainParam = {
        'min': 0.0,
        'max': 1.0,
        'step': 0.01,
        'valInit': 0.5
    };
    config.timeLenParam = {
        'min': 0.0,
        'max': 1.0,
        'step': 0.01,
        'valInit': 0.5
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
    config.timeoutMockFs = 44100.0;
    config.timeoutRateParam = {
        'min': 1,
        'max': 10,
        'step': 1,
        'valInit': 6
    };

    // edit params
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

    // network params
    config.oscServerIp = 'localhost';
    config.oscServerPort = 1234;
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