window.justree = window.justree || {};

(function (justree) {	
	var config = justree.config = {};

    // tree params
    config.breadthMax = 3;
    config.depthMin = 2;
    config.depthMax = 3;
    config.nDims = 2;
    config.pTerm = 0.5;
    config.pOn = 0.0;
    config.ratios = [1, 2, 3];
    config.ratiosTime = []; // TODO
    config.ratiosFreq = [];
    config.ratiosLen = config.ratios.length;
    config.undoStackSize = 8;
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
    config.growDepthMin = 1;
    config.growDepthMax = 

    // audio params
    config.blockSize = 1024;
    config.gainParam = {
        'min': 0.0,
        'max': 1.0,
        'step': 0.01,
        'valInit': 0.5
    };
    config.timeLenParam = {
        'min': 1.0,
        'max': 10.0,
        'step': 0.1,
        'valInit': 2.0
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
    config.reverbOn = false;

    // synth params
    config.synthTabLen = 4096;
    config.synthVoicesNum = 8;
    config.synthAtk = 0.05;
    config.synthRel = 0.25;

    // fx params
    config.reverbLen = 1.5;
    config.reverbDcy = 10.0;

    // share params
    config.shareRoute = '/justrees'
    
    // debug
    config.debug = true;
    config.debugAssert = function(assertion, msg) {
        if (config.debug && !assertion) {
            alert(msg);
            throw msg;
        }
    };
})(window.justree);