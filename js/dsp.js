window.justree = window.justree || {};

(function (ObjectBase, justree) {
    var dsp = justree.dsp = {};

    dsp.isPositivePowerOfTwo = function (x) {
        return (typeof x === 'number') && (x > 0) && ((x & (x - 1)) === 0);
    };

    dsp.allocateBufferFloat32 = function (bufferLen) {
        return new Float32Array(bufferLen);
    };

    dsp.tabGenerate = function (tab, type) {
        var tabLen = tab.length;
        switch(type) {
            case 'sine':
                for (var i = 0; i < tabLen; i++) {
                    tab[i] = Math.sin(2.0 * Math.PI * (i / tabLen));
                }
                break;
            default:
                throw 'dsp.tabgenerate: Invalid table type (' + String(type) + ') specified.';
        }
    };

    dsp.envGenerate = function (tab, valStart, segments) {
        var tabLen = tab.length;

        var segmentRelLenSum = 0.0;
        for (var i = 0; i < segments.length; ++i) {
            segmentRelLenSum += segments[i][0];
        }

        var segmentsAbsLens = Array();
        var segmentAbsLenSum = 0;
        for (var i = 0; i < segments.length; ++i) {
            var segmentAbsLen = Math.floor(tabLen * (segments[i][0] / segmentRelLenSum));
            segmentsAbsLens.push(segmentAbsLen);
            segmentAbsLenSum += segmentAbsLen;
        }
        segmentsAbsLens[segmentsAbsLens.length - 1] -= (segmentAbsLenSum - tabLen);

        var valCurr = valStart;
        var tabI = 0;
        for (var i = 0; i < segments.length; ++i) {
            var segmentAbsLen = segmentsAbsLens[i];
            var segmentVal = segments[i][1];
            var segmentInc = (segmentVal - valCurr) / segmentAbsLen;
            for (var j = 0; j < segmentAbsLen; ++j) {
                tab[tabI] = valCurr;
                valCurr += segmentInc;
                ++tabI;
            }
            valCurr = segmentVal;
        }
    };

    var AudioBuffer = dsp.AudioBuffer = ObjectBase.extend({
        constructor: function (channelsNum, samplesNum) {
            this.channelsNum = channelsNum;
            this.samplesNum = samplesNum;
            this.buffer = {};
            for (var i = 0; i < channelsNum; ++i) {
                this.buffer[i] = dsp.allocateBufferFloat32(samplesNum);
            }
        },
        channelGet: function (channelNum) {
            if (channelNum < 0 || channelNum >= this.channelsNum) {
                throw 'AudioBuffer.channelGet: Requested invalid channel number (' + channelNum + ').';
            }

            return this.buffer[channelNum];
        },
        channelSet: function (channelNum, channel) {
            if (channelNum < 0 || channelNum >= this.channelsNum) {
                throw 'AudioBuffer.channelGet: Requested invalid channel number (' + channelNum + ').';
            }

            this.buffer[channelNum] = channel;
        },
        clear: function () {
            for (var channel = 0; channel < this.channelsNum; ++channel) {
                var channelBuffer = this.channelGet(channel);
                for (var sample = 0; sample < this.samplesNum; ++sample) {
                    channelBuffer[sample] = 0.0;
                }
            }
        }
    });

    // abstract base class
    var ObjectDsp = ObjectBase.extend({
        constructor: function () {},
        prepare: function (sampleRate, blockSize) {
            this.sampleRate = sampleRate;
            this.blockSize = blockSize;
            this.sampleRateInverse = sampleRateInverse;
            this.blockSizeInverse = blockSizeInverse;
        },
        perform: abstract(ObjectDsp, function (block) {}),
        release: function () {}
    });

    // abstract base class
    var TabRead = dsp.TabRead = ObjectDsp.extend({
        constructor: function (tab) {
            ObjectDsp.prototype.constructor.call(this);
            this.tab = tab !== undefined ? tab : null;
            this.tabLen = this.tab === null ? -1 : tab.length;
            this.tabMask = this.tabLen - 1;
        },
        tabSet: function (tab) {
            this.tab = tab;
            this.tabLen = this.tab.len;
            this.tabMask = this.tabLen - 1;
        },
        prepare: function (sampleRate, blockSize) {
            ObjectDsp.prototype.prepare.call(this, sampleRate, blockSize);
            if (this.tab === null) {
                throw 'TabRead.prepare: tabSet must be called first.'
            }
        }
    });

    var TabRead2 = dsp.TabRead2 = TabRead.extend({
        constructor: function (tab) {
            TabRead.prototype.constructor.call(this, tab);
            this.tabPhase = 0.0;
        },
        tabSet: function (tab) {
            TabRead.prototype.tabSet.call(this, tab);
            this.tabPhase = 0.0;
        },
        phaseReset: function () {
            this.tabPhase = 0.0;
        },
        perform: function (block) {
            TabRead.prototype.perform.call(this, block);
        }
    });

    var CycTabRead4 = dsp.CycTabRead4 = TabRead.extend({
        constructor: function (tab) {
            TabRead.prototype.constructor.call(this, tab);
            this.tabPhase = 0.0;
        },
        tabSet: function (tab) {
            TabRead.prototype.tabSet.call(this, tab);
            this.tabPhase = 0.0;
        },
        phaseReset: function () {
            this.tabPhase = 0.0;
        },
        perform: function (block) {
            TabRead.prototype.perform.call(this, block);
            var freq = block.channelGet(0);
            var out = block.channelGet(0);

            var tabLen = this.tabLen;
            var tabMask = this.tabMask;
            var tab = this.tab;
            var phase = this.tabPhase;

            var freqCurr, phaseInc, phaseTrunc, phaseFrac, inm1, in0, inp1, inp2;

            for (var i = 0; i < block.samplesNum; ++i) {
                freqCurr = freq[i];
                phaseInc = freqCurr * tabLen;
                phaseTrunc = Math.floor(phase);
                phaseFrac = phase - phaseTrunc;

                inm1 = tab[(phaseTrunc - 1) & tabMask];
                in0 = tab[phaseTrunc & tabMask];
                inp1 = tab[(phaseTrunc + 1) & tabMask];
                inp2 = tab[(phaseTrunc + 2) & tabMask];

                out[i] = in0 + 0.5 * phaseFrac * (inp1 - inm1 + 
                    phaseFrac * (4.0 * inp1 + 2.0 * inm1 - 5.0 * in0 - inp2 +
                    phaseFrac * (3.0 * (in0 - inp1) - inm1 + inp2)));

                phase += phaseInc;
            }

            while (phase > tabLen) {
                phase -= tabLen;
            }
            while (phase < 0.0) {
                phase += tabLen;
            }

            this.tabPhase = phase;
        }
    });
})(window.ObjectBase, window.justree);